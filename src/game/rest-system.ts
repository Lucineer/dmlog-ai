/**
 * DMLog.ai - D&D 5e Rest Mechanics System
 *
 * This system manages character states related to D&D 5e rest mechanics,
 * including HP, hit dice, spell slots, conditions, and exhaustion.
 *
 * Target: 220 lines. No external dependencies.
 */

// --- Interfaces ---

/**
 * Represents a D&D 5e character with relevant stats for rest mechanics.
 */
export interface Character {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  hitDice: string; // e.g., "1d8"
  hitDiceMax: number;
  hitDiceCur: number;
  spellSlots: Map<number, { max: number; cur: number }>; // e.g., 1: {max:2, cur:2}, 2: {max:1, cur:1}
  conditions: string[];
  exhaustion: number; // 0-6
}

// --- Helper Functions ---

/**
 * Rolls dice based on a string format (e.g., "1d8", "2d6").
 * @param diceString The string representing the dice to roll (e.g., "1d8").
 * @returns The total result of the dice roll.
 * @throws Error if the dice string format is invalid.
 */
function rollDice(diceString: string): number {
  const parts = diceString.toLowerCase().split('d');
  if (parts.length !== 2) {
    throw new Error(`Invalid dice string format: ${diceString}. Expected "XdY".`);
  }
  const numDice = parseInt(parts[0], 10);
  const dieType = parseInt(parts[1], 10);

  if (isNaN(numDice) || isNaN(dieType) || numDice <= 0 || dieType <= 0) {
    throw new Error(`Invalid dice values in string: ${diceString}.`);
  }

  let total = 0;
  for (let i = 0; i < numDice; i++) {
    total += Math.floor(Math.random() * dieType) + 1;
  }
  return total;
}

/**
 * Maps exhaustion levels to their corresponding effects.
 */
const EXHAUSTION_EFFECTS: Record<number, string> = {
  1: "Disadvantage on ability checks",
  2: "Speed halved",
  3: "Disadvantage on attack rolls and saving throws",
  4: "Hit point maximum halved",
  5: "Speed reduced to 0",
  6: "Death",
};

// --- RestSystem Class ---

export class RestSystem {
  private chars = new Map<string, Character>();
  private nextCharId = 1; // Simple ID generator for "no deps"

  /**
   * Generates a unique ID for a character.
   * @returns A unique character ID string.
   */
  private generateCharId(): string {
    return `char-${this.nextCharId++}`;
  }

  /**
   * Retrieves a character by ID, throwing an error if not found.
   * @param id The ID of the character.
   * @returns The Character object.
   * @throws Error if the character is not found.
   */
  private getChar(id: string): Character {
    const char = this.chars.get(id);
    if (!char) {
      throw new Error(`Character with ID '${id}' not found.`);
    }
    return char;
  }

  /**
   * 1. Adds a new character to the system.
   * Initializes `hitDiceCur`, `spellSlots.cur`, `conditions`, and `exhaustion` if not provided.
   * @param data Partial character data.
   * @returns The newly added Character object.
   */
  public addChar(data: Partial<Character>): Character {
    const newChar: Character = {
      id: data.id || this.generateCharId(),
      name: data.name || 'Unnamed Character',
      hp: data.hp ?? data.maxHp ?? 1,
      maxHp: data.maxHp ?? 1,
      hitDice: data.hitDice || '1d8', // Default to 1d8 if not specified
      hitDiceMax: data.hitDiceMax ?? 1,
      hitDiceCur: data.hitDiceCur ?? data.hitDiceMax ?? 1,
      spellSlots: data.spellSlots || new Map(),
      conditions: data.conditions || [],
      exhaustion: data.exhaustion ?? 0,
    };

    // Ensure current HP doesn't exceed max HP
    newChar.hp = Math.min(newChar.hp, newChar.maxHp);
    // Ensure current hit dice don't exceed max hit dice
    newChar.hitDiceCur = Math.min(newChar.hitDiceCur, newChar.hitDiceMax);

    // Initialize spell slot current values to max if not set
    newChar.spellSlots.forEach((slot, level) => {
      if (slot.cur === undefined) {
        slot.cur = slot.max;
      }
    });

    this.chars.set(newChar.id, newChar);
    return newChar;
  }

  /**
   * 2. Deals damage to a character.
   * @param id The ID of the character.
   * @param amount The amount of damage to deal.
   * @returns An object containing the character's current HP and unconscious status.
   */
  public damage(id: string, amount: number): { hp: number; unconscious: boolean } {
    const char = this.getChar(id);
    char.hp = Math.max(0, char.hp - amount);
    return { hp: char.hp, unconscious: char.hp <= 0 };
  }

  /**
   * 3. Heals a character.
   * @param id The ID of the character.
   * @param amount The amount of HP to heal.
   * @returns An object containing the character's current HP.
   */
  public heal(id: string, amount: number): { hp: number } {
    const char = this.getChar(id);
    char.hp = Math.min(char.maxHp, char.hp + amount);
    return { hp: char.hp };
  }

  /**
   * 4. Initiates a short rest for specified characters.
   * During a short rest, characters can spend hit dice to regain HP.
   * This method automatically spends 1 hit die per character if available.
   * @param ids An array of character IDs to short rest.
   * @returns An array of results, one for each character, detailing hit dice used and HP gained.
   */
  public shortRest(ids: string[]): Array<{ id: string; hitDiceUsed: number; hpGained: number }> {
    const results: Array<{ id: string; hitDiceUsed: number; hpGained: number }> = [];
    for (const id of ids) {
      const char = this.getChar(id);
      let hitDiceUsed = 0;
      let hpGained = 0;

      // Core D&D 5e rule: "At the end of a short rest, a character can spend one or more Hit Dice to regain hit points."
      // For this automated method, we'll spend 1 hit die if available.
      if (char.hitDiceCur > 0) {
        const spendResult = this.spendHitDice(id, 1); // Spend 1 hit die
        hitDiceUsed = 1;
        hpGained = spendResult.healed;
      }

      results.push({ id: char.id, hitDiceUsed, hpGained });
    }
    return results;
  }

  /**
   * 5. Initiates a long rest for specified characters.
   * During a long rest, characters recover full HP, half their hit dice, all spell slots, and 1 level of exhaustion.
   * @param ids An array of character IDs to long rest.
   * @returns An array of results, one for each character, detailing recovery.
   */
  public longRest(ids: string[]): Array<{ id: string; hpRecovered: number; slotsRecovered: number; exhaustionRemoved: number }> {
    const results: Array<{ id: string; hpRecovered: number; slotsRecovered: number; exhaustionRemoved: number }> = [];
    for (const id of ids) {
      const char = this.getChar(id);
      const initialHp = char.hp;
      const initialExhaustion = char.exhaustion;
      let slotsRecoveredCount = 0;

      // Recover full HP
      char.hp = char.maxHp;
      const hpRecovered = char.hp - initialHp;

      // Recover half hit dice (min 1, max hitDiceMax)
      char.hitDiceCur = Math.min(char.hitDiceMax, Math.ceil(char.hitDiceMax / 2) + char.hitDiceCur);
      // Ensure it doesn't exceed max
      char.hitDiceCur = Math.min(char.hitDiceCur, char.hitDiceMax);


      // Recover all spell slots
      char.spellSlots.forEach(slot => {
        if (slot.cur < slot.max) {
          slotsRecoveredCount += (slot.max - slot.cur);
          slot.cur = slot.max;
        }
      });

      // Remove 1 level of exhaustion
      this.removeExhaustion(id);
      const exhaustionRemoved = initialExhaustion - char.exhaustion;

      results.push({
        id: char.id,
        hpRecovered,
        slotsRecovered: slotsRecoveredCount,
        exhaustionRemoved,
      });
    }
    return results;
  }

  /**
   * 6. Spends a specified number of hit dice to regain HP.
   * @param id The ID of the character.
   * @param count The number of hit dice to spend.
   * @returns An object containing the amount healed and remaining hit dice.
   * @throws Error if the character doesn't have enough hit dice.
   */
  public spendHitDice(id: string, count: number): { healed: number; remaining: number } {
    const char = this.getChar(id);
    if (count <= 0) {
      return { healed: 0, remaining: char.hitDiceCur };
    }
    if (char.hitDiceCur < count) {
      throw new Error(`Character '${char.name}' only has ${char.hitDiceCur} hit dice, cannot spend ${count}.`);
    }

    let totalHealed = 0;
    for (let i = 0; i < count; i++) {
      totalHealed += rollDice(char.hitDice); // Assumes hitDice is like "1d8"
    }

    char.hitDiceCur -= count;
    const oldHp = char.hp;
    char.hp = Math.min(char.maxHp, char.hp + totalHealed);
    const actualHealed = char.hp - oldHp; // Only heal up to max HP

    return { healed: actualHealed, remaining: char.hitDiceCur };
  }

  /**
   * 7. Spends a spell slot of a given level.
   * @param id The ID of the character.
   * @param level The level of the spell slot to spend.
   * @returns `true` if the slot was successfully spent, `false` otherwise (e.g., no slots of that level).
   */
  public useSlot(id: string, level: number): boolean {
    const char = this.getChar(id);
    const slot = char.spellSlots.get(level);
    if (slot && slot.cur > 0) {
      slot.cur--;
      return true;
    }
    return false;
  }

  /**
   * 8. Adds a condition to a character.
   * @param id The ID of the character.
   * @param cond The condition string to add.
   */
  public addCondition(id: string, cond: string): void {
    const char = this.getChar(id);
    if (!char.conditions.includes(cond)) {
      char.conditions.push(cond);
    }
  }

  /**
   * 9. Removes a condition from a character.
   * @param id The ID of the character.
   * @param cond The condition string to remove.
   */
  public removeCondition(id: string, cond: string): void {
    const char = this.getChar(id);
    char.conditions = char.conditions.filter(c => c !== cond);
  }

  /**
   * 10. Adds a level of exhaustion to a character.
   * Caps at level 6.
   * @param id The ID of the character.
   */
  public addExhaustion(id: string): void {
    const char = this.getChar(id);
    char.exhaustion = Math.min(6, char.exhaustion + 1);
  }

  /**
   * 11. Removes a level of exhaustion from a character.
   * Floors at level 0.
   * @param id The ID of the character.
   */
  public removeExhaustion(id: string): void {
    const char = this.getChar(id);
    char.exhaustion = Math.max(0, char.exhaustion - 1);
  }

  /**
   * 12. Gets the description of the effect for a given exhaustion level.
   * @param level The exhaustion level (1-6).
   * @returns A string describing the effect, or "No effect" if level is 0 or invalid.
   */
  public getExhaustionEffect(level: number): string {
    if (level <= 0) return "No exhaustion";
    return EXHAUSTION_EFFECTS[level] || `Unknown exhaustion level ${level}`;
  }

  /**
   * 13. Gets a summary status for a group of characters.
   * @param ids An array of character IDs.
   * @returns An array of simplified character status objects.
   */
  public getPartyStatus(ids: string[]): Array<{ id: string; name: string; hp: number; maxHp: number; conditions: string[]; exhaustion: number }> {
    return ids.map(id => {
      const char = this.getChar(id);
      return {
        id: char.id,
        name: char.name,
        hp: char.hp,
        maxHp: char.