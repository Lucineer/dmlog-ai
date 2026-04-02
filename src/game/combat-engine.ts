/**
 * src/game/combat-engine.ts
 *
 * Turn-based D&D 5e combat engine for DMLog.ai.
 * Manages combat state, turn order, actions, and logging without external dependencies.
 */

// --- INTERFACES ---

export interface Combatant {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  ac: number;
  initiative: number;
  speed: number;
  conditions: string[];
  isPlayer: boolean;
  stats: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  actions: number;
  bonusActions: number;
  reactions: number;
}

export interface CombatAction {
  id: string;
  type: 'attack' | 'spell' | 'skill' | 'item' | 'move' | 'dash' | 'dodge' | 'help' | 'hide';
  name: string;
  damage?: Array<{ dice: string; type: string; damageType: string }>;
  save?: { stat: string; dc: number; halfOnSuccess: boolean };
  range?: number;
  description: string;
}

export interface CombatRoundAction {
  combatantId: string;
  action: CombatAction;
  targetId?: string;
  result: string;
  damage: number;
}

export interface CombatRound {
  round: number;
  turnOrder: string[];
  actions: CombatRoundAction[];
}

export interface Combat {
  id: string;
  name: string;
  combatants: Map<string, Combatant>;
  round: number;
  turnIndex: number;
  isActive: boolean;
  turnOrder: string[];
  rounds: CombatRound[];
  log: string[];
}

export interface CombatResult {
  xp: number;
  loot: string[];
  summary: string;
}

// --- COMBAT ENGINE CLASS ---

export class CombatEngine {
  private combats = new Map<string, Combat>();

  // --- PRIVATE HELPERS ---

  private _generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private _getCombat(combatId: string): Combat {
    const combat = this.combats.get(combatId);
    if (!combat) throw new Error(`Combat with ID "${combatId}" not found.`);
    return combat;
  }

  private _getCombatant(combat: Combat, combatantId: string): Combatant {
    const combatant = combat.combatants.get(combatantId);
    if (!combatant) throw new Error(`Combatant with ID "${combatantId}" not found.`);
    return combatant;
  }

  private _getModifier(stat: number): number {
    return Math.floor((stat - 10) / 2);
  }

  private _rollDie(sides: number): number {
    return Math.floor(Math.random() * sides) + 1;
  }

  private _parseAndRollDice(
    diceString: string,
    options: { advantage?: boolean; disadvantage?: boolean; isCritical?: boolean } = {}
  ): number {
    if (options.advantage && options.disadvantage) {
      // Advantage and disadvantage cancel each other out
      options.advantage = false;
      options.disadvantage = false;
    }

    const rollExpression = () => {
      const match = diceString.match(/(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?/);
      if (!match) return parseInt(diceString, 10) || 0;

      const numDice = options.isCritical ? parseInt(match[1], 10) * 2 : parseInt(match[1], 10);
      const sides = parseInt(match[2], 10);
      const operator = match[3];
      const modifier = match[4] ? parseInt(match[4], 10) : 0;

      let total = 0;
      for (let i = 0; i < numDice; i++) {
        total += this._rollDie(sides);
      }

      return operator === '+' ? total + modifier : operator === '-' ? total - modifier : total;
    };

    if (options.advantage) {
      return Math.max(rollExpression(), rollExpression());
    } else if (options.disadvantage) {
      return Math.min(rollExpression(), rollExpression());
    }
    return rollExpression();
  }

  private _log(combat: Combat, message: string): void {
    combat.log.push(`[R${combat.round}] ${message}`);
  }

  // --- PUBLIC API ---

  /** 1. Creates a new combat encounter. */
  createCombat(name: string): Combat {
    const combat: Combat = {
      id: this._generateId(),
      name,
      combatants: new Map(),
      round: 0,
      turnIndex: -1,
      isActive: false,
      turnOrder: [],
      rounds: [],
      log: [],
    };
    this.combats.set(combat.id, combat);
    return combat;
  }

  /** 2. Adds a combatant to an encounter. */
  addCombatant(combatId: string, data: Partial<Omit<Combatant, 'id'>> & { name: string }): void {
    const combat = this._getCombat(combatId);
    const combatant: Combatant = {
      id: this._generateId(),
      name: data.name,
      hp: data.maxHp ?? 10,
      maxHp: data.maxHp ?? 10,
      ac: data.ac ?? 10,
      initiative: data.initiative ?? 0,
      speed: data.speed ?? 30,
      conditions: data.conditions ?? [],
      isPlayer: data.isPlayer ?? false,
      stats: data.stats ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      actions: 1,
      bonusActions: 1,
      reactions: 1,
      ...data,
    };
    combat.combatants.set(combatant.id, combatant);
  }

  /** 3. Removes a combatant from an encounter. */
  removeCombatant(combatId: string, combatantId: string): void {
    const combat = this._getCombat(combatId);
    combat.combatants.delete(combatantId);
    combat.turnOrder = combat.turnOrder.filter(id => id !== combatantId);
  }

  /** 4. Rolls initiative for all combatants and sets the turn order. */
  rollInitiative(combatId: string): string[] {
    const combat = this._getCombat(combatId);
    const initiatives = Array.from(combat.combatants.values()).map(c => {
      c.initiative = this._rollDie(20) + this._getModifier(c.stats.dex);
      return { id: c.id, roll: c.initiative };
    });

    initiatives.sort((a, b) => b.roll - a.roll);
    combat.turnOrder = initiatives.map(i => i.id);
    this._log(combat, `Initiative rolled: ${this.getTurnOrder(combatId).map(c => c.name).join(', ')}`);
    return combat.turnOrder;
  }

  /** 5. Starts the combat. */
  startCombat(combatId: string): void {
    const combat = this._getCombat(combatId);
    if (combat.isActive) return;

    combat.isActive = true;
    combat.round = 1;
    combat.turnIndex = -1;
    this.rollInitiative(combatId);
    this._log(combat, `Combat started: "${combat.name}"`);
    combat.rounds.push({ round: 1, turnOrder: combat.turnOrder, actions: [] });
  }

  /** 6. Advances to the next turn. */
  nextTurn(combatId: string): { combatant: Combatant; round: number; isFirst: boolean } {
    const combat = this._getCombat(combatId);
    if (!combat.isActive || combat.turnOrder.length === 0) {
      throw new Error("Combat is not active or has no combatants.");
    }

    combat.turnIndex++;
    let isNewRound = false;

    if (combat.turnIndex >= combat.turnOrder.length) {
      combat.turnIndex = 0;
      combat.round++;
      isNewRound = true;
      this._log(combat, `--- Round ${combat