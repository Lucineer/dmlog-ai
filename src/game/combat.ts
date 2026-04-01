/**
 * Combat system — D&D 5e inspired with initiative, HP, conditions.
 *
 * Initiative rolling, attack resolution, damage calculation, critical hits,
 * condition tracking, death saves, multi-target attacks, and combat log
 * for narration.
 */

import { DiceRoller, RollResult } from "./dice.js";
import { getModifier } from "./character.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConditionName =
  | "blinded" | "charmed" | "deafened" | "exhaustion"
  | "frightened" | "grappled" | "incapacitated" | "invisible"
  | "paralyzed" | "petrified" | "poisoned" | "prone"
  | "restrained" | "stunned" | "unconscious"
  | "bleeding" | "blessed" | "shielded" | "hasted"
  | "slowed" | "concentrating" | "raging";

export type CombatantType = "player" | "npc" | "monster";

export interface Condition {
  name: ConditionName;
  duration: number;        // turns remaining; -1 = indefinite
  source: string;          // what caused the condition
}

export interface CombatAction {
  name: string;
  description: string;
  attackBonus: number;
  damageDice: string;
  damageType: string;
  damageBonus: number;
  range: number;           // feet
  isSavingThrow: boolean;
  saveAbility: string;     // e.g., "dexterity"
  saveDC: number;
  areaOfEffect?: number;   // radius in feet (0 = single target)
  healing?: boolean;
}

export interface Combatant {
  id: string;
  name: string;
  type: CombatantType;
  hp: number;
  maxHp: number;
  temporaryHp: number;
  ac: number;
  initiative: number;
  dexterityScore: number;
  conditions: Condition[];
  actions: CombatAction[];
  isAlive: boolean;
  /** Death saves (player characters only). */
  deathSaves: { successes: number; failures: number };
  /** Reference to external entity (character ID, NPC ID, or monster name). */
  ref: string;
  /** Bonus to initiative rolls. */
  initiativeBonus: number;
  /** Concentration tracking. */
  concentrating: string | null;  // name of spell/concentrating on
}

export interface AttackResult {
  attacker: string;
  target: string;
  attackRoll: number;
  attackTotal: number;
  targetAC: number;
  hit: boolean;
  critical: boolean;
  damage: number;
  damageType: string;
  damageRolls: number[];
  damageBonus: number;
  killed: boolean;
}

export interface CombatLogEntry {
  round: number;
  turn: number;
  combatantId: string;
  combatantName: string;
  action: string;
  result: string;
  details: string;
  timestamp: number;
}

export interface CombatEncounter {
  id: string;
  combatants: Map<string, Combatant>;
  initiativeOrder: string[];  // combatant IDs in initiative order
  currentTurnIndex: number;
  round: number;
  isActive: boolean;
  log: CombatLogEntry[];
}

export interface DamageResult {
  targetId: string;
  damage: number;
  hpRemaining: number;
  tempHpAbsorbed: number;
  knockedOut: boolean;
  killed: boolean;
  conditionsApplied: ConditionName[];
}

// ---------------------------------------------------------------------------
// Condition effects
// ---------------------------------------------------------------------------

const CONDITION_EFFECTS: Record<ConditionName, { attackDisadvantage: boolean; acModifier: number; speedModifier: number; noActions: boolean }> = {
  blinded:      { attackDisadvantage: true,  acModifier: 0,  speedModifier: 0,   noActions: false },
  charmed:      { attackDisadvantage: false, acModifier: 0,  speedModifier: 0,   noActions: false },
  deafened:     { attackDisadvantage: false, acModifier: 0,  speedModifier: 0,   noActions: false },
  exhaustion:   { attackDisadvantage: false, acModifier: 0,  speedModifier: 0,   noActions: false },
  frightened:   { attackDisadvantage: true,  acModifier: 0,  speedModifier: 0,   noActions: false },
  grappled:     { attackDisadvantage: false, acModifier: 0,  speedModifier: -1,  noActions: false },
  incapacitated:{ attackDisadvantage: false, acModifier: 0,  speedModifier: 0,   noActions: true },
  invisible:    { attackDisadvantage: false, acModifier: 2,  speedModifier: 0,   noActions: false },
  paralyzed:    { attackDisadvantage: false, acModifier: 0,  speedModifier: 0,   noActions: true },
  petrified:    { attackDisadvantage: false, acModifier: 0,  speedModifier: 0,   noActions: true },
  poisoned:     { attackDisadvantage: true,  acModifier: 0,  speedModifier: 0,   noActions: false },
  prone:        { attackDisadvantage: true,  acModifier: 0,  speedModifier: 0,   noActions: false },
  restrained:   { attackDisadvantage: true,  acModifier: 0,  speedModifier: -1,  noActions: false },
  stunned:      { attackDisadvantage: false, acModifier: 0,  speedModifier: 0,   noActions: true },
  unconscious:  { attackDisadvantage: false, acModifier: 0,  speedModifier: 0,   noActions: true },
  bleeding:     { attackDisadvantage: false, acModifier: 0,  speedModifier: 0,   noActions: false },
  blessed:      { attackDisadvantage: false, acModifier: 0,  speedModifier: 0,   noActions: false },
  shielded:     { attackDisadvantage: false, acModifier: 2,  speedModifier: 0,   noActions: false },
  hasted:       { attackDisadvantage: false, acModifier: 0,  speedModifier: 1,   noActions: false },
  slowed:       { attackDisadvantage: false, acModifier: 0,  speedModifier: -1,  noActions: false },
  concentrating:{ attackDisadvantage: false, acModifier: 0,  speedModifier: 0,   noActions: false },
  raging:       { attackDisadvantage: false, acModifier: 0,  speedModifier: 0,   noActions: false },
};

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

let nextEncounterId = 1;

// ---------------------------------------------------------------------------
// CombatManager
// ---------------------------------------------------------------------------

export class CombatManager {
  private encounters: Map<string, CombatEncounter> = new Map();
  private dice = new DiceRoller();

  // -----------------------------------------------------------------------
  // Encounter lifecycle
  // -----------------------------------------------------------------------

  /**
   * Start a new combat encounter.
   * Rolls initiative for all combatants and sorts by initiative order.
   */
  startEncounter(combatants: Omit<Combatant, "initiative" | "isAlive" | "deathSaves" | "concentrating">[]): CombatEncounter {
    const id = `combat_${nextEncounterId++}_${Date.now().toString(36)}`;
    const combatantMap = new Map<string, Combatant>();
    const initiativeRolls: { id: string; initiative: number }[] = [];

    for (const c of combatants) {
      const dexMod = getModifier(c.dexterityScore);
      const initRoll = this.dice.roll("1d20");
      const initiative = initRoll.total + dexMod + c.initiativeBonus;

      const combatant: Combatant = {
        ...c,
        initiative,
        isAlive: true,
        deathSaves: { successes: 0, failures: 0 },
        concentrating: null,
      };

      combatantMap.set(c.id, combatant);
      initiativeRolls.push({ id: c.id, initiative });
    }

    // Sort by initiative (highest first), dexterity score as tiebreaker
    initiativeRolls.sort((a, b) => {
      if (b.initiative !== a.initiative) return b.initiative - a.initiative;
      const aDex = combatantMap.get(a.id)?.dexterityScore ?? 10;
      const bDex = combatantMap.get(b.id)?.dexterityScore ?? 10;
      return bDex - aDex;
    });

    const encounter: CombatEncounter = {
      id,
      combatants: combatantMap,
      initiativeOrder: initiativeRolls.map((r) => r.id),
      currentTurnIndex: 0,
      round: 1,
      isActive: true,
      log: [],
    };

    this.addLog(encounter, "", "", "Combat Start", `Round 1 begins. Initiative order: ${initiativeRolls.map((r) => `${combatantMap.get(r.id)?.name} (${r.initiative})`).join(", ")}.`);

    this.encounters.set(id, encounter);
    return encounter;
  }

  /** End an encounter. */
  endEncounter(encounterId: string): boolean {
    const encounter = this.encounters.get(encounterId);
    if (!encounter) return false;

    encounter.isActive = false;
    this.addLog(encounter, "", "", "Combat End", "The encounter has ended.");
    return true;
  }

  // -----------------------------------------------------------------------
  // Turn management
  // -----------------------------------------------------------------------

  /** Get the current combatant. */
  getCurrentCombatant(encounterId: string): Combatant | null {
    const encounter = this.encounters.get(encounterId);
    if (!encounter || !encounter.isActive) return null;

    const id = encounter.initiativeOrder[encounter.currentTurnIndex];
    return encounter.combatants.get(id) ?? null;
  }

  /** Advance to the next turn. Handles condition durations and round tracking. */
  nextTurn(encounterId: string): { combatant: Combatant; newRound: boolean } | null {
    const encounter = this.encounters.get(encounterId);
    if (!encounter || !encounter.isActive) return null;

    const previousId = encounter.initiativeOrder[encounter.currentTurnIndex];

    // Decrease condition durations for the combatant whose turn just ended
    const previousCombatant = encounter.combatants.get(previousId);
    if (previousCombatant) {
      this.tickConditions(previousCombatant);
    }

    // Advance turn
    encounter.currentTurnIndex++;
    let newRound = false;

    if (encounter.currentTurnIndex >= encounter.initiativeOrder.length) {
      encounter.currentTurnIndex = 0;
      encounter.round++;
      newRound = true;
    }

    // Skip dead combatants
    let current = encounter.initiativeOrder[encounter.currentTurnIndex];
    const combatant = encounter.combatants.get(current);
    if (!combatant || !combatant.isAlive) {
      return this.nextTurn(encounterId);
    }

    if (newRound) {
      this.addLog(encounter, current, combatant.name, "New Round", `Round ${encounter.round} begins.`);
    }

    return { combatant, newRound };
  }

  private tickConditions(combatant: Combatant): void {
    for (let i = combatant.conditions.length - 1; i >= 0; i--) {
      const cond = combatant.conditions[i];
      if (cond.duration > 0) {
        cond.duration--;
        if (cond.duration <= 0) {
          combatant.conditions.splice(i, 1);
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Attacks and damage
  // -----------------------------------------------------------------------

  /**
   * Perform an attack from one combatant to another.
   */
  attack(encounterId: string, attackerId: string, targetId: string, actionIndex = 0): AttackResult {
    const encounter = this.encounters.get(encounterId);
    if (!encounter) throw new Error("Encounter not found");

    const attacker = encounter.combatants.get(attackerId);
    const target = encounter.combatants.get(targetId);
    if (!attacker || !target) throw new Error("Combatant not found");

    const action = attacker.actions[actionIndex];
    if (!action) throw new Error(`Action index ${actionIndex} not found for ${attacker.name}`);

    // Roll attack
    let attackRoll = this.dice.roll("1d20");
    let attackTotal = attackRoll.total + action.attackBonus;

    // Check if attacker has disadvantage from conditions
    const hasDisadvantage = attacker.conditions.some(
      (c) => CONDITION_EFFECTS[c.name]?.attackDisadvantage
    );

    if (hasDisadvantage) {
      const disadvRoll = this.dice.roll("1d20");
      attackTotal = Math.min(attackRoll.total, disadvRoll.total) + action.attackBonus;
    }

    // Determine hit/miss
    const isCritical = attackRoll.total === 20;
    const isCriticalMiss = attackRoll.total === 1;
    const hit = !isCriticalMiss && (isCritical || attackTotal >= target.ac);

    let damage = 0;
    let damageRolls: number[] = [];

    if (hit) {
      if (isCritical) {
        // Critical hit: double the dice
        const critRoll = this.dice.roll(action.damageDice);
        const normalRoll = this.dice.roll(action.damageDice);
        damageRolls = [...critRoll.rolls, ...normalRoll.rolls];
        damage = critRoll.total + normalRoll.total + action.damageBonus;
      } else {
        const damageRoll = this.dice.roll(action.damageDice);
        damageRolls = damageRoll.rolls;
        damage = damageRoll.total + action.damageBonus;
      }

      this.applyDamage(encounterId, targetId, damage);
    }

    const result: AttackResult = {
      attacker: attackerId,
      target: targetId,
      attackRoll: attackRoll.total,
      attackTotal,
      targetAC: target.ac,
      hit,
      critical: isCritical,
      damage,
      damageType: action.damageType,
      damageRolls,
      damageBonus: action.damageBonus,
      killed: hit && target.hp <= 0,
    };

    // Generate log
    const hitText = result.critical ? "CRITICAL HIT!" : result.hit ? "hits" : "misses";
    this.addLog(encounter, attackerId, attacker.name, "Attack",
      `${attacker.name} attacks ${target.name} with ${action.name}: ${hitText} (${attackTotal} vs AC ${target.ac})${result.hit ? ` for ${damage} ${action.damageType} damage.` : "."}`);

    return result;
  }

  /**
   * Apply raw damage to a combatant.
   */
  applyDamage(encounterId: string, targetId: string, damage: number): DamageResult {
    const encounter = this.encounters.get(encounterId);
    if (!encounter) throw new Error("Encounter not found");

    const target = encounter.combatants.get(targetId);
    if (!target) throw new Error("Combatant not found");

    let remaining = damage;
    let tempHpAbsorbed = 0;

    // Absorb with temporary HP first
    if (target.temporaryHp > 0) {
      tempHpAbsorbed = Math.min(target.temporaryHp, remaining);
      target.temporaryHp -= tempHpAbsorbed;
      remaining -= tempHpAbsorbed;
    }

    target.hp -= remaining;
    const knockedOut = target.hp <= 0;

    if (knockedOut) {
      target.isAlive = false;
      // Apply unconscious condition to players
      if (target.type === "player") {
        this.addCondition(target, { name: "unconscious", duration: -1, source: "damage" });
      }
    }

    const conditionsApplied: ConditionName[] = [];
    // Paralyzed targets that take damage get a death save failure (if player)
    if (target.type === "player" && knockedOut) {
      target.deathSaves.failures++;
      if (target.deathSaves.failures >= 3) {
        this.addLog(encounter, targetId, target.name, "Death", `${target.name} has died!`);
      }
    }

    return {
      targetId,
      damage,
      hpRemaining: target.hp,
      tempHpAbsorbed,
      knockedOut,
      killed: target.type === "player" ? target.deathSaves.failures >= 3 : knockedOut,
      conditionsApplied,
    };
  }

  /** Heal a combatant. */
  heal(encounterId: string, targetId: string, amount: number): { hp: number; revived: boolean } {
    const encounter = this.encounters.get(encounterId);
    if (!encounter) throw new Error("Encounter not found");

    const target = encounter.combatants.get(targetId);
    if (!target) throw new Error("Combatant not found");

    const wasDown = !target.isAlive;
    target.hp = Math.min(target.maxHp, target.hp + amount);

    if (wasDown && target.hp > 0) {
      target.isAlive = true;
      this.removeCondition(target, "unconscious");
      target.deathSaves = { successes: 0, failures: 0 };
    }

    this.addLog(encounter, targetId, target.name, "Heal", `${target.name} heals for ${amount} HP. (${target.hp}/${target.maxHp})`);

    return { hp: target.hp, revived: wasDown };
  }

  // -----------------------------------------------------------------------
  // Multi-target and AoE
  // -----------------------------------------------------------------------

  /**
   * Perform an area-of-effect attack against multiple targets.
   * Each target makes a saving throw.
   */
  areaAttack(
    encounterId: string,
    attackerId: string,
    targetIds: string[],
    actionIndex: number,
    saveResults: Map<string, number>  // targetId -> saving throw result
  ): AttackResult[] {
    const results: AttackResult[] = [];
    const encounter = this.encounters.get(encounterId);
    if (!encounter) return results;

    const attacker = encounter.combatants.get(attackerId);
    if (!attacker) return results;

    const action = attacker.actions[actionIndex];
    if (!action) return results;

    for (const targetId of targetIds) {
      const target = encounter.combatants.get(targetId);
      if (!target) continue;

      const saveRoll = saveResults.get(targetId) ?? 10;
      const succeeded = saveRoll >= action.saveDC;
      const damageRoll = this.dice.roll(action.damageDice);
      const damage = succeeded
        ? Math.floor((damageRoll.total + action.damageBonus) / 2)
        : damageRoll.total + action.damageBonus;

      this.applyDamage(encounterId, targetId, damage);

      results.push({
        attacker: attackerId,
        target: targetId,
        attackRoll: 0,
        attackTotal: 0,
        targetAC: target.ac,
        hit: true,
        critical: false,
        damage,
        damageType: action.damageType,
        damageRolls: damageRoll.rolls,
        damageBonus: action.damageBonus,
        killed: target.hp <= 0,
      });
    }

    this.addLog(encounter, attackerId, attacker.name, "Area Attack",
      `${attacker.name} uses ${action.name}, hitting ${targetIds.length} targets for ${results.reduce((s, r) => s + r.damage, 0)} total damage.`);

    return results;
  }

  // -----------------------------------------------------------------------
  // Conditions
  // -----------------------------------------------------------------------

  /** Add a condition to a combatant. */
  addCondition(combatant: Combatant, condition: Condition): void {
    // Check if condition already exists
    const existing = combatant.conditions.find((c) => c.name === condition.name);
    if (existing) {
      // Refresh duration if new duration is longer or indefinite
      if (condition.duration === -1 || condition.duration > existing.duration) {
        existing.duration = condition.duration;
      }
      return;
    }
    combatant.conditions.push(condition);
  }

  /** Remove a condition from a combatant. */
  removeCondition(combatant: Combatant, conditionName: ConditionName): boolean {
    const idx = combatant.conditions.findIndex((c) => c.name === conditionName);
    if (idx === -1) return false;
    combatant.conditions.splice(idx, 1);
    return true;
  }

  /** Get effective AC for a combatant including condition modifiers. */
  getEffectiveAC(combatant: Combatant): number {
    let ac = combatant.ac;
    for (const cond of combatant.conditions) {
      const effect = CONDITION_EFFECTS[cond.name];
      if (effect) {
        ac += effect.acModifier;
      }
    }
    return ac;
  }

  /** Check if a combatant can take actions. */
  canAct(combatant: Combatant): boolean {
    return combatant.isAlive && !combatant.conditions.some(
      (c) => CONDITION_EFFECTS[c.name]?.noActions
    );
  }

  // -----------------------------------------------------------------------
  // Death saves
  // -----------------------------------------------------------------------

  /** Make a death saving throw for a player character. */
  deathSave(encounterId: string, targetId: string): { roll: number; success: boolean; stabilised: boolean; dead: boolean } {
    const encounter = this.encounters.get(encounterId);
    if (!encounter) throw new Error("Encounter not found");

    const combatant = encounter.combatants.get(targetId);
    if (!combatant || combatant.type !== "player") throw new Error("Invalid death save target");

    const rollResult = this.dice.roll("1d20");
    const success = rollResult.total >= 10;
    const isCritical = rollResult.total === 20;
    const isCriticalFail = rollResult.total === 1;

    if (isCritical) {
      // Nat 20: regain 1 HP
      combatant.hp = 1;
      combatant.isAlive = true;
      combatant.deathSaves = { successes: 0, failures: 0 };
      this.removeCondition(combatant, "unconscious");
      this.addLog(encounter, targetId, combatant.name, "Death Save", `${combatant.name} rolls a natural 20 and springs back to consciousness with 1 HP!`);
      return { roll: rollResult.total, success: true, stabilised: true, dead: false };
    }

    if (isCriticalFail) {
      // Nat 1: counts as 2 failures
      combatant.deathSaves.failures += 2;
    } else if (success) {
      combatant.deathSaves.successes++;
    } else {
      combatant.deathSaves.failures++;
    }

    const stabilised = combatant.deathSaves.successes >= 3;
    const dead = combatant.deathSaves.failures >= 3;

    if (stabilised) {
      this.removeCondition(combatant, "unconscious");
      combatant.deathSaves = { successes: 0, failures: 0 };
      this.addLog(encounter, targetId, combatant.name, "Death Save", `${combatant.name} stabilises!`);
    } else if (dead) {
      this.addLog(encounter, targetId, combatant.name, "Death", `${combatant.name} has died from their wounds!`);
    }

    return { roll: rollResult.total, success, stabilised, dead };
  }

  // -----------------------------------------------------------------------
  // Short/Long rest in combat context
  // -----------------------------------------------------------------------

  /** Apply short rest healing to a combatant (hit dice). */
  shortRestHeal(combatant: Combatant, hitDieType: string, hitDiceToSpend: number): number {
    if (!combatant.isAlive) return 0;

    let totalHealed = 0;
    for (let i = 0; i < hitDiceToSpend; i++) {
      const roll = this.dice.roll(`1${hitDieType}`);
      const conMod = getModifier(combatant.dexterityScore); // approximate
      const healed = Math.max(1, roll.total + conMod);
      totalHealed += healed;
    }

    combatant.hp = Math.min(combatant.maxHp, combatant.hp + totalHealed);
    return totalHealed;
  }

  /** Apply long rest: full heal, remove conditions. */
  longRestHeal(combatant: Combatant): void {
    combatant.hp = combatant.maxHp;
    combatant.temporaryHp = 0;
    combatant.isAlive = true;
    combatant.deathSaves = { successes: 0, failures: 0 };
    this.removeCondition(combatant, "unconscious");
    this.removeCondition(combatant, "exhaustion");
  }

  // -----------------------------------------------------------------------
  // Combat state queries
  // -----------------------------------------------------------------------

  /** Check if combat is over (one side eliminated). */
  isCombatOver(encounterId: string): { over: boolean; winner: "players" | "enemies" | "none" } {
    const encounter = this.encounters.get(encounterId);
    if (!encounter) return { over: true, winner: "none" };

    const alivePlayers = [...encounter.combatants.values()].filter(
      (c) => c.isAlive && c.type === "player"
    );
    const aliveEnemies = [...encounter.combatants.values()].filter(
      (c) => c.isAlive && (c.type === "npc" || c.type === "monster")
    );

    if (alivePlayers.length === 0 && aliveEnemies.length === 0) {
      return { over: true, winner: "none" };
    }
    if (alivePlayers.length === 0) {
      return { over: true, winner: "enemies" };
    }
    if (aliveEnemies.length === 0) {
      return { over: true, winner: "players" };
    }

    return { over: false, winner: "none" };
  }

  /** Get all alive combatants. */
  getAliveCombatants(encounterId: string): Combatant[] {
    const encounter = this.encounters.get(encounterId);
    if (!encounter) return [];
    return [...encounter.combatants.values()].filter((c) => c.isAlive);
  }

  /** Get the combat log. */
  getCombatLog(encounterId: string): CombatLogEntry[] {
    const encounter = this.encounters.get(encounterId);
    if (!encounter) return [];
    return [...encounter.log];
  }

  /** Get encounter summary for narration. */
  getEncounterSummary(encounterId: string): string {
    const encounter = this.encounters.get(encounterId);
    if (!encounter) return "No encounter found.";

    const combatants = [...encounter.combatants.values()];
    const alive = combatants.filter((c) => c.isAlive);
    const dead = combatants.filter((c) => !c.isAlive);
    const current = encounter.initiativeOrder[encounter.currentTurnIndex];
    const currentName = encounter.combatants.get(current)?.name ?? "Unknown";

    return [
      `Round ${encounter.round}, ${currentName}'s turn.`,
      `Alive: ${alive.map((c) => `${c.name} (${c.hp}/${c.maxHp} HP)`).join(", ")}.`,
      dead.length > 0 ? `Fallen: ${dead.map((c) => c.name).join(", ")}.` : "",
    ].filter(Boolean).join(" ");
  }

  // -----------------------------------------------------------------------
  // Logging
  // -----------------------------------------------------------------------

  private addLog(
    encounter: CombatEncounter,
    combatantId: string,
    combatantName: string,
    action: string,
    result: string
  ): void {
    encounter.log.push({
      round: encounter.round,
      turn: encounter.currentTurnIndex + 1,
      combatantId,
      combatantName,
      action,
      result,
      details: result,
      timestamp: Date.now(),
    });
  }

  // -----------------------------------------------------------------------
  // Saving Throws
  // -----------------------------------------------------------------------

  /**
   * Perform a saving throw for a combatant.
   * Uses ability modifier + proficiency if proficient.
   */
  savingThrow(
    encounterId: string,
    combatantId: string,
    ability: "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma",
    proficient: boolean,
    proficiencyBonus: number,
    dc: number,
  ): { roll: number; total: number; modifier: number; success: boolean } {
    const encounter = this.encounters.get(encounterId);
    if (!encounter) throw new Error("Encounter not found");

    const combatant = encounter.combatants.get(combatantId);
    if (!combatant) throw new Error("Combatant not found");

    const rollResult = this.dice.roll("1d20");
    const abilityMod = getModifier(combatant.dexterityScore + (ability === "dexterity" ? 0 : ability === "strength" ? -2 : ability === "constitution" ? 0 : ability === "wisdom" ? 2 : 0)); // approximate from dex
    const prof = proficient ? proficiencyBonus : 0;
    const total = rollResult.total + abilityMod + prof;
    const success = total >= dc;

    this.addLog(encounter, combatantId, combatant.name, "Saving Throw",
      `${combatant.name} rolls ${ability} save: ${total} vs DC ${dc} — ${success ? "SUCCESS" : "FAILURE"}`);

    return { roll: rollResult.total, total, modifier: abilityMod + prof, success };
  }

  /**
   * Convenience: Fortitude save (CON-based).
   */
  fortitudeSave(encounterId: string, combatantId: string, proficiencyBonus: number, proficient: boolean, dc: number) {
    return this.savingThrow(encounterId, combatantId, "constitution", proficient, proficiencyBonus, dc);
  }

  /**
   * Convenience: Reflex save (DEX-based).
   */
  reflexSave(encounterId: string, combatantId: string, proficiencyBonus: number, proficient: boolean, dc: number) {
    return this.savingThrow(encounterId, combatantId, "dexterity", proficient, proficiencyBonus, dc);
  }

  /**
   * Convenience: Will save (WIS-based).
   */
  willSave(encounterId: string, combatantId: string, proficiencyBonus: number, proficient: boolean, dc: number) {
    return this.savingThrow(encounterId, combatantId, "wisdom", proficient, proficiencyBonus, dc);
  }

  // -----------------------------------------------------------------------
  // Critical Miss Effects
  // -----------------------------------------------------------------------

  /**
   * Resolve a critical miss (natural 1). Returns a dramatic effect:
   * either hitting an ally or dropping a weapon.
   */
  resolveCriticalMiss(
    encounterId: string,
    attackerId: string,
  ): { effect: "hit_ally" | "drop_weapon" | "stumble"; description: string; allyDamage?: number } {
    const encounter = this.encounters.get(encounterId);
    if (!encounter) return { effect: "stumble", description: "The attack goes wide." };

    const attacker = encounter.combatants.get(attackerId);
    if (!attacker) return { effect: "stumble", description: "The attack goes wide." };

    const roll = this.dice.roll("1d6");

    // Find adjacent allies
    const allies = [...encounter.combatants.values()].filter(
      c => c.isAlive && c.id !== attackerId && c.type === attacker.type,
    );

    if (roll.total <= 2 && allies.length > 0) {
      // Hit an ally
      const target = allies[Math.floor(Math.random() * allies.length)];
      const dmgRoll = this.dice.roll("1d4");
      const damage = dmgRoll.total;
      this.applyDamage(encounterId, target.id, damage);
      const desc = `Critical miss! ${attacker.name}'s swing goes wide and strikes ${target.name} for ${damage} damage!`;
      this.addLog(encounter, attackerId, attacker.name, "Critical Miss", desc);
      return { effect: "hit_ally", description: desc, allyDamage: damage };
    } else if (roll.total <= 4) {
      // Drop weapon
      const desc = `Critical miss! ${attacker.name} fumbles and drops their weapon! It takes an action to recover.`;
      this.addLog(encounter, attackerId, attacker.name, "Critical Miss", desc);
      return { effect: "drop_weapon", description: desc };
    } else {
      // Stumble — lose next action advantage
      const desc = `Critical miss! ${attacker.name} stumbles badly, leaving an opening.`;
      this.addLog(encounter, attackerId, attacker.name, "Critical Miss", desc);
      return { effect: "stumble", description: desc };
    }
  }

  // -----------------------------------------------------------------------
  // XP and Encounter Rewards
  // -----------------------------------------------------------------------

  /**
   * Calculate XP reward when an encounter ends.
   * Based on monster CR approximation: challengeRating ~ (maxHp + ac) / 15
   */
  calculateXPReward(encounterId: string): number {
    const encounter = this.encounters.get(encounterId);
    if (!encounter) return 0;

    let totalXP = 0;
    for (const combatant of encounter.combatants.values()) {
      if (combatant.type !== "player") {
        // Approximate CR from stats
        const cr = Math.max(0.25, (combatant.maxHp + combatant.ac) / 15);
        const xpTable: Record<string, number> = {
          "0.25": 50, "0.5": 100, "1": 200, "2": 450, "3": 700,
          "4": 1100, "5": 1800, "6": 2300, "7": 2900, "8": 3900,
          "9": 5000, "10": 5900, "11": 7200, "12": 8400,
        };
        const crKey = cr <= 0.5 ? String(cr) : String(Math.min(12, Math.floor(cr)));
        totalXP += xpTable[crKey] ?? Math.floor(cr * 200);
      }
    }
    return totalXP;
  }

  /**
   * End an encounter and distribute XP to surviving players.
   */
  endEncounterWithRewards(encounterId: string): { xp: number; survivors: string[] } {
    const encounter = this.encounters.get(encounterId);
    if (!encounter) return { xp: 0, survivors: [] };

    encounter.isActive = false;
    const xp = this.calculateXPReward(encounterId);
    const survivors = [...encounter.combatants.values()]
      .filter(c => c.isAlive && c.type === "player")
      .map(c => c.id);

    this.addLog(encounter, "", "", "Combat End",
      `Encounter ended. ${xp} XP earned. Survivors: ${survivors.length}.`);
    return { xp, survivors };
  }

  // -----------------------------------------------------------------------
  // Bleeding / Status Tick
  // -----------------------------------------------------------------------

  /**
   * Process start-of-turn effects: bleeding damage, etc.
   */
  processStartOfTurn(encounterId: string, combatantId: string): { bleedingDamage: number; conditionsExpired: string[] } {
    const encounter = this.encounters.get(encounterId);
    if (!encounter) return { bleedingDamage: 0, conditionsExpired: [] };

    const combatant = encounter.combatants.get(combatantId);
    if (!combatant) return { bleedingDamage: 0, conditionsExpired: [] };

    let bleedingDamage = 0;
    const bleeding = combatant.conditions.find(c => c.name === "bleeding");
    if (bleeding) {
      bleedingDamage = this.dice.roll("1d4").total;
      combatant.hp -= bleedingDamage;
      if (combatant.hp <= 0) {
        combatant.isAlive = false;
        if (combatant.type === "player") {
          this.addCondition(combatant, { name: "unconscious", duration: -1, source: "bleeding" });
        }
      }
    }

    return { bleedingDamage, conditionsExpired: [] };
  }

  // -----------------------------------------------------------------------
  // Serialization
  // -----------------------------------------------------------------------

  serialize(): string {
    return JSON.stringify({
      encounters: Array.from(this.encounters.entries()).map(([k, v]) => [
        k,
        { ...v, combatants: Array.from(v.combatants.entries()) },
      ]),
      nextEncounterId,
    });
  }

  deserialize(data: string): void {
    const parsed = JSON.parse(data);
    this.encounters = new Map(
      parsed.encounters.map(([k, v]: [string, any]) => [
        k,
        { ...v, combatants: new Map(v.combatants) },
      ])
    );
    nextEncounterId = parsed.nextEncounterId ?? this.encounters.size + 1;
  }
}
