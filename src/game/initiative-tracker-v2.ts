/**
 * src/game/initiative-tracker-v2.ts
 * Enhanced initiative tracking with conditions and effects for DMLog.ai
 */

export interface Combatant {
  id: string;
  name: string;
  initiative: number;
  hp: {
    current: number;
    max: number;
    temp: number;
  };
  ac: number;
  speed: number;
  conditions: string[];
  concentration: string;
  legendaryActions: number;
  legendaryActionsMax: number;
  notes: string;
  isPlayer: boolean;
  deathSaves: {
    successes: number;
    failures: number;
  };
}

export class InitiativeTrackerV2 {
  private combatants = new Map<string, Combatant>();
  private turnOrder: string[] = [];
  private round = 0;
  private currentTurn = 0;
  private log: string[] = [];

  private logEvent(message: string): void {
    const timestamp = new Date().toISOString().substring(11, 19);
    this.log.push(`[${timestamp}] ${message}`);
  }

  // 1. addCombatant
  public addCombatant(data: Partial<Combatant> & { name: string }): Combatant {
    const id = data.id || Math.random().toString(36).substring(2, 11);
    const combatant: Combatant = {
      id,
      name: data.name,
      initiative: data.initiative || 0,
      hp: {
        current: data.hp?.current ?? 10,
        max: data.hp?.max ?? 10,
        temp: data.hp?.temp ?? 0,
      },
      ac: data.ac ?? 10,
      speed: data.speed ?? 30,
      conditions: data.conditions ? [...data.conditions] : [],
      concentration: data.concentration || "",
      legendaryActions: data.legendaryActions ?? 0,
      legendaryActionsMax: data.legendaryActionsMax ?? 0,
      notes: data.notes || "",
      isPlayer: data.isPlayer ?? false,
      deathSaves: {
        successes: data.deathSaves?.successes ?? 0,
        failures: data.deathSaves?.failures ?? 0,
      },
    };

    this.combatants.set(id, combatant);
    if (!this.turnOrder.includes(id)) {
      this.turnOrder.push(id);
    }
    
    this.logEvent(`${combatant.name} joined the combat.`);
    return combatant;
  }

  // 2. removeCombatant
  public removeCombatant(id: string): void {
    const combatant = this.combatants.get(id);
    if (!combatant) return;

    this.combatants.delete(id);
    const index = this.turnOrder.indexOf(id);
    if (index !== -1) {
      this.turnOrder.splice(index, 1);
      // Adjust current turn if we removed someone before or at the current turn
      if (this.currentTurn >= index && this.currentTurn > 0) {
        this.currentTurn--;
      }
    }
    this.logEvent(`${combatant.name} was removed from combat.`);
  }

  // 3. rollInitiative
  public rollInitiative(id: string, dexModifier: number = 0): number {
    const combatant = this.combatants.get(id);
    if (!combatant) return 0;

    const roll = Math.floor(Math.random() * 20) + 1;
    combatant.initiative = roll + dexModifier;
    this.logEvent(`${combatant.name} rolled initiative: ${combatant.initiative} (1d20: ${roll} + ${dexModifier}).`);
    return combatant.initiative;
  }

  // 4. rollAllInitiative
  public rollAllInitiative(dexModifiers: Record<string, number> = {}): void {
    for (const id of this.turnOrder) {
      this.rollInitiative(id, dexModifiers[id] || 0);
    }
    this.sortInitiative();
  }

  // 5. sortInitiative
  public sortInitiative(): void {
    this.turnOrder.sort((a, b) => {
      const cA = this.combatants.get(a)!;
      const cB = this.combatants.get(b)!;
      return cB.initiative - cA.initiative;
    });
    this.currentTurn = 0;
    this.logEvent(`Initiative order sorted.`);
  }

  // 6. nextTurn
  public nextTurn(): Combatant | null {
    if (this.turnOrder.length === 0) return null;

    if (this.round === 0) {
      this.round = 1;
      this.currentTurn = 0;
      this.logEvent(`--- Round ${this.round} begins ---`);
    } else {
      this.currentTurn++;
      if (this.currentTurn >= this.turnOrder.length) {
        this.currentTurn = 0;
        this.round++;
        this.resetLegendaryActions();
        this.logEvent(`--- Round ${this.round} begins ---`);
      }
    }

    const current = this.getCurrentCombatant();
    if (current) {
      this.logEvent(`It is now ${current.name}'s turn.`);
    }
    return current;
  }

  // 7. getCurrentCombatant
  public getCurrentCombatant(): Combatant | null {
    if (this.turnOrder.length === 0) return null;
    return this.combatants.get(this.turnOrder[this.currentTurn]) || null;
  }

  // 8. getTurnOrder
  public getTurnOrder(): Combatant[] {
    return this.turnOrder
      .map(id => this.combatants.get(id)!)
      .filter(Boolean);
  }

  // 9. applyDamage
  public applyDamage(id: string, damage: number): void {
    const combatant = this.combatants.get(id);
    if (!combatant || damage <= 0) return;

    let remainingDamage = damage;

    // Deduct from Temp HP first
    if (combatant.hp.temp > 0) {
      if (combatant.hp.temp >= remainingDamage) {
        combatant.hp.temp -= remainingDamage;
        remainingDamage = 0;
      } else {
        remainingDamage -= combatant.hp.temp;
        combatant.hp.temp = 0;
      }
    }

    // Deduct from Current HP
    if (remainingDamage > 0) {
      combatant.hp.current = Math.max(0, combatant.hp.current - remainingDamage);
    }

    this.logEvent(`${combatant.name} takes ${damage} damage. HP: ${combatant.hp.current}/${combatant.hp.max}`);

    if (combatant.hp.current === 0) {
      this.logEvent(`${combatant.name} has been reduced to 0 HP!`);
    }
  }

  // 10. applyHealing
  public applyHealing(id: string, healing: number): void {
    const combatant = this.combatants.get(id);
    if (!combatant || healing <= 0) return;

    if (!this.isAlive(id)) {
      this.logEvent(`Cannot heal ${combatant.name}, they are dead.`);
      return;
    }

    if (combatant.hp.current === 0 && healing > 0) {
      combatant.deathSaves = { successes: 0, failures: 0 };
      this.logEvent(`${combatant.name} is stabilized and wakes up.`);
    }

    combatant.hp.current = Math.min(combatant.hp.max, combatant.hp.current + healing);
    this.logEvent(`${combatant.name} heals for ${healing} HP. HP: ${combatant.hp.current}/${combatant.hp.max}`);
  }

  // 11. addCondition
  public addCondition(id: string, condition: string): void {
    const combatant = this.combatants.get(id);
    if (combatant && !combatant.conditions.includes(condition)) {
      combatant.conditions.push(condition);
      this.logEvent(`${combatant.name} is now ${condition}.`);
    }
  }

  // 12. removeCondition
  public removeCondition(id: string, condition: string): void {
    const combatant = this.combatants.get(id);
    if (combatant) {
      combatant.conditions = combatant.conditions.filter(c => c !== condition);
      this.logEvent(`${combatant.name} is no longer ${condition}.`);
    }
  }

  // 13. getConditions
  public getConditions(id: string): string[] {
    return this.combatants.get(id)?.conditions || [];
  }

  // 14. addTempHP
  public addTempHP(id: string, amount: number): void {
    const combatant = this.combatants.get(id);
    if (combatant && amount > combatant.hp.temp) {
      combatant.hp.temp = amount;
      this.logEvent(`${combatant.name} gains ${amount} temporary HP.`);
    }
  }

  // 15. setConcentration
  public setConcentration(id: string, spell: string): void {
    const combatant = this.combatants.get(id);
    if (combatant) {
      combatant.concentration = spell;
      this.logEvent(`${combatant.name} is concentrating on ${spell}.`);
    }
  }

  // 16. breakConcentration
  public breakConcentration(id: string): void {
    const combatant = this.combatants.get(id);
    if (combatant && combatant.concentration) {
      this.logEvent(`${combatant.name} lost concentration on ${combatant.concentration}.`);
      combatant.concentration = "";
    }
  }

  // 17. useLegendaryAction
  public useLegendaryAction(id: string): void {
    const combatant = this.combatants.get(id);
    if (combatant && combatant.legendaryActions > 0) {
      combatant.legendaryActions--;
      this.logEvent(`${combatant.name} used a legendary action (${combatant.legendaryActions}/${combatant.legendaryActionsMax} remaining).`);
    }
  }

  // 18. resetLegendaryActions
  public resetLegendaryActions(): void {
    for (const combatant of this.combatants.values()) {
      if (combatant.legendaryActionsMax > 0) {
        combatant.legendaryActions = combatant.legendaryActionsMax;
      }
    }
  }

  // 19. addDeathSaveSuccess
  public addDeathSaveSuccess(id: string): void {
    const combatant = this.combatants.get(id);
    if (combatant && combatant.hp.current === 0 && combatant.deathSaves.failures