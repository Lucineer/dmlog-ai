/**
 * Spell system — D&D 5e inspired.
 *
 * Spell slots by level (1–9), spell preparation (wizards) vs known (sorcerers),
 * spell descriptions with damage/effect/healing, concentration tracking,
 * spell save DC, components (verbal, somatic, material), and 20 starter spells.
 */

import { DiceRoller } from "./dice.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SpellSchool = "abjuration" | "conjuration" | "divination" | "enchantment" | "evocation" | "illusion" | "necromancy" | "transmutation";

export type SpellLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type CastingMode = "prepared" | "known" | "innate";

export type ComponentType = "verbal" | "somatic" | "material";

export type SpellTargetType = "self" | "creature" | "point" | "sphere" | "cone" | "line" | "wall";

export interface SpellComponent {
  type: ComponentType;
  materialCost?: string;     // e.g. "a pearl worth 100gp"
  consumed?: boolean;        // whether the material is consumed
}

export interface SpellDamage {
  dice: string;               // e.g. "8d6"
  type: string;               // e.g. "fire"
  higherLevelDice?: string;   // additional dice per slot level above base
}

export interface Spell {
  id: string;
  name: string;
  level: SpellLevel;
  school: SpellSchool;
  castingTime: string;        // "1 action", "1 bonus action", "1 minute", etc.
  range: string;              // "Touch", "30 feet", "Self (15-foot cone)", etc.
  rangeFeet: number;          // numeric range in feet
  components: SpellComponent[];
  duration: string;           // "Instantaneous", "Concentration, up to 1 minute", etc.
  requiresConcentration: boolean;
  targetType: SpellTargetType;
  areaOfEffect?: number;      // radius/length in feet
  description: string;
  damage?: SpellDamage;
  healing?: { dice: string; bonus: number; higherLevelDice?: string };
  buff?: { effect: string; duration: string };
  saveAbility?: string;       // ability for saving throw, e.g. "dexterity"
  attackRoll?: boolean;       // whether this is a ranged spell attack
  upcast?: boolean;           // whether it benefits from higher-level slots
  ritual?: boolean;           // can be cast as ritual
  classes: string[];          // which classes can learn this spell
}

export interface CasterSpellbook {
  characterId: string;
  mode: CastingMode;
  knownSpells: string[];          // spell IDs the caster knows
  preparedSpells: string[];       // spell IDs currently prepared (wizards)
  spellSlots: SpellSlotInfo;      // current slot usage
  maxSpellSlots: SpellSlotInfo;   // max slots by level
  concentrationSpell: string | null; // currently concentrating on
  concentrationTurnStart: number;   // turn when concentration started
}

export interface SpellSlotInfo {
  [level: string]: { max: number; used: number };
}

export interface CastResult {
  success: boolean;
  spellName: string;
  slotUsed: number;
  damage?: { total: number; rolls: number[]; type: string };
  healing?: { total: number; rolls: number[] };
  saveDC?: number;
  saveResult?: { success: boolean; roll: number };
  concentrationBroken: boolean;
  description: string;
}

// ---------------------------------------------------------------------------
// 20 Starter Spells
// ---------------------------------------------------------------------------

const STARTER_SPELLS: Omit<Spell, "id">[] = [
  // --- Cantrips (Level 0) ---
  {
    name: "Fire Bolt",
    level: 0, school: "evocation", castingTime: "1 action", range: "120 feet", rangeFeet: 120,
    components: [{ type: "verbal" }, { type: "somatic" }],
    duration: "Instantaneous", requiresConcentration: false, targetType: "creature",
    description: "A beam of crackling energy streaks toward a creature. On hit: 1d10 fire damage.",
    damage: { dice: "1d10", type: "fire", higherLevelDice: "1d10" },
    attackRoll: true, upcast: false,
    classes: ["wizard", "sorcerer"],
  },
  {
    name: "Magic Missile",
    level: 1, school: "evocation", castingTime: "1 action", range: "120 feet", rangeFeet: 120,
    components: [{ type: "verbal" }],
    duration: "Instantaneous", requiresConcentration: false, targetType: "creature",
    description: "Three darts of magical force. Each dart deals 1d4+1 force damage. All darts hit simultaneously.",
    damage: { dice: "3d4", type: "force" },
    upcast: true,
    classes: ["wizard", "sorcerer"],
  },
  {
    name: "Healing Word",
    level: 1, school: "evocation", castingTime: "1 bonus action", range: "60 feet", rangeFeet: 60,
    components: [{ type: "verbal" }],
    duration: "Instantaneous", requiresConcentration: false, targetType: "creature",
    description: "A word of healing restores 1d4 + spellcasting modifier HP to a creature you can see.",
    healing: { dice: "1d4", bonus: 3, higherLevelDice: "1d4" },
    upcast: true,
    classes: ["cleric", "bard", "druid"],
  },
  {
    name: "Shield",
    level: 1, school: "abjuration", castingTime: "1 reaction", range: "Self", rangeFeet: 0,
    components: [{ type: "verbal" }, { type: "somatic" }],
    duration: "1 round", requiresConcentration: false, targetType: "self",
    description: "An invisible barrier of magical force grants +5 AC until the start of your next turn, including against the triggering attack.",
    buff: { effect: "+5 AC", duration: "1 round" },
    classes: ["wizard", "sorcerer"],
  },
  {
    name: "Thunderwave",
    level: 1, school: "evocation", castingTime: "1 action", range: "Self (15-foot cube)", rangeFeet: 0,
    components: [{ type: "verbal" }, { type: "somatic" }],
    duration: "Instantaneous", requiresConcentration: false, targetType: "sphere",
    areaOfEffect: 15,
    description: "A wave of thunderous force sweeps out from you. Each creature in a 15-foot cube must make a Constitution save or take 2d8 thunder damage and be pushed 10 feet away.",
    damage: { dice: "2d8", type: "thunder", higherLevelDice: "1d8" },
    saveAbility: "constitution",
    upcast: true,
    classes: ["wizard", "sorcerer", "bard"],
  },
  {
    name: "Sleep",
    level: 1, school: "enchantment", castingTime: "1 action", range: "90 feet", rangeFeet: 90,
    components: [{ type: "verbal" }, { type: "somatic" }, { type: "material", materialCost: "a pinch of fine sand, rose petals, or a cricket", consumed: true }],
    duration: "1 minute", requiresConcentration: false, targetType: "sphere",
    areaOfEffect: 20,
    description: "Creatures in a 20-foot sphere fall unconscious. Roll 5d8 — creatures with HP equal to or less than the roll fall asleep.",
    damage: { dice: "5d8", type: "unconscious" },
    upcast: true,
    classes: ["wizard", "bard", "sorcerer"],
  },
  {
    name: "Detect Magic",
    level: 1, school: "divination", castingTime: "1 action", range: "Self", rangeFeet: 0,
    components: [{ type: "verbal" }, { type: "somatic" }],
    duration: "Concentration, up to 10 minutes", requiresConcentration: true, targetType: "self",
    description: "For the duration, you sense the presence of magic within 30 feet. You can identify the school of magic of any visible magical effect.",
    ritual: true,
    classes: ["wizard", "sorcerer", "bard", "cleric", "druid"],
  },
  {
    name: "Bless",
    level: 1, school: "enchantment", castingTime: "1 action", range: "30 feet", rangeFeet: 30,
    components: [{ type: "verbal" }, { type: "somatic" }, { type: "material", materialCost: "a sprinkling of holy water", consumed: false }],
    duration: "Concentration, up to 1 minute", requiresConcentration: true, targetType: "creature",
    description: "Up to three creatures gain +1d4 to attack rolls and saving throws for the duration.",
    buff: { effect: "+1d4 to attacks and saves", duration: "Concentration, up to 1 minute" },
    classes: ["cleric", "paladin"],
  },
  {
    name: "Hold Person",
    level: 2, school: "enchantment", castingTime: "1 action", range: "60 feet", rangeFeet: 60,
    components: [{ type: "verbal" }, { type: "somatic" }, { type: "material", materialCost: "a small, straight piece of iron", consumed: false }],
    duration: "Concentration, up to 1 minute", requiresConcentration: true, targetType: "creature",
    description: "A humanoid must make a Wisdom save or be paralyzed for the duration. Can repeat save at end of each turn.",
    saveAbility: "wisdom",
    upcast: true,
    classes: ["wizard", "sorcerer", "bard", "cleric", "warlock"],
  },
  {
    name: "Misty Step",
    level: 2, school: "conjuration", castingTime: "1 bonus action", range: "Self", rangeFeet: 0,
    components: [{ type: "verbal" }],
    duration: "Instantaneous", requiresConcentration: false, targetType: "self",
    description: "Teleport up to 30 feet to an unoccupied space you can see.",
    classes: ["wizard", "sorcerer", "warlock", "bard"],
  },
  {
    name: "Fireball",
    level: 3, school: "evocation", castingTime: "1 action", range: "150 feet", rangeFeet: 150,
    components: [{ type: "verbal" }, { type: "somatic" }, { type: "material", materialCost: "a tiny ball of bat guano and sulfur", consumed: true }],
    duration: "Instantaneous", requiresConcentration: false, targetType: "sphere",
    areaOfEffect: 20,
    description: "A bright flash streaks from your pointing finger and detonates. Each creature in a 20-foot sphere must make a Dexterity save, taking 8d6 fire damage on a failed save or half on a success.",
    damage: { dice: "8d6", type: "fire", higherLevelDice: "1d6" },
    saveAbility: "dexterity",
    upcast: true,
    classes: ["wizard", "sorcerer"],
  },
  {
    name: "Lightning Bolt",
    level: 3, school: "evocation", castingTime: "1 action", range: "Self (100-foot line)", rangeFeet: 100,
    components: [{ type: "verbal" }, { type: "somatic" }, { type: "material", materialCost: "a bit of fur and a rod of amber, crystal, or glass", consumed: false }],
    duration: "Instantaneous", requiresConcentration: false, targetType: "line",
    areaOfEffect: 100,
    description: "A stroke of lightning forms a 100-foot line. Each creature in the line must make a Dexterity save, taking 8d6 lightning damage on failure or half on success.",
    damage: { dice: "8d6", type: "lightning", higherLevelDice: "1d6" },
    saveAbility: "dexterity",
    upcast: true,
    classes: ["wizard", "sorcerer"],
  },
  {
    name: "Revivify",
    level: 3, school: "necromancy", castingTime: "1 action", range: "Touch", rangeFeet: 5,
    components: [{ type: "verbal" }, { type: "somatic" }, { type: "material", materialCost: "diamonds worth 300gp", consumed: true }],
    duration: "Instantaneous", requiresConcentration: false, targetType: "creature",
    description: "You touch a creature that has died within the last minute. It returns to life with 1 HP. Cannot revivify creatures that died of old age.",
    classes: ["cleric", "paladin"],
  },
  {
    name: "Greater Invisibility",
    level: 4, school: "illusion", castingTime: "1 action", range: "Touch", rangeFeet: 5,
    components: [{ type: "verbal" }, { type: "somatic" }],
    duration: "Concentration, up to 1 minute", requiresConcentration: true, targetType: "creature",
    description: "You or a creature you touch becomes invisible. Anything the target is carrying is also invisible. The spell ends early if the target attacks or casts a spell.",
    buff: { effect: "invisible (no break on attack/spell)", duration: "Concentration, up to 1 minute" },
    classes: ["wizard", "sorcerer", "bard"],
  },
  {
    name: "Cone of Cold",
    level: 5, school: "evocation", castingTime: "1 action", range: "Self (60-foot cone)", rangeFeet: 60,
    components: [{ type: "verbal" }, { type: "somatic" }, { type: "material", materialCost: "a small crystal or glass cone", consumed: false }],
    duration: "Instantaneous", requiresConcentration: false, targetType: "cone",
    areaOfEffect: 60,
    description: "A blast of cold air erupts from your hands in a 60-foot cone. Each creature must make a Constitution save, taking 8d8 cold damage on failure or half on success.",
    damage: { dice: "8d8", type: "cold", higherLevelDice: "1d8" },
    saveAbility: "constitution",
    upcast: true,
    classes: ["wizard", "sorcerer"],
  },
  {
    name: "Chain Lightning",
    level: 6, school: "evocation", castingTime: "1 action", range: "150 feet", rangeFeet: 150,
    components: [{ type: "verbal" }, { type: "somatic" }, { type: "material", materialCost: "a bit of fur, a piece of amber, and three silver pins", consumed: true }],
    duration: "Instantaneous", requiresConcentration: false, targetType: "creature",
    description: "A bolt of lightning arcs to a target, then arcs to up to 3 additional targets. Primary target: 10d6 lightning (Dex save for half). Secondary targets: 10d6 lightning (Dex save for half).",
    damage: { dice: "10d6", type: "lightning", higherLevelDice: "1d6" },
    saveAbility: "dexterity",
    upcast: true,
    classes: ["wizard", "sorcerer"],
  },
  {
    name: "Teleport",
    level: 7, school: "conjuration", castingTime: "1 action", range: "10 feet", rangeFeet: 10,
    components: [{ type: "verbal" }],
    duration: "Instantaneous", requiresConcentration: false, targetType: "creature",
    description: "You and up to 8 willing creatures within 10 feet, or a single object, are instantly transported to a destination you select on the same plane of existence.",
    classes: ["wizard", "sorcerer", "bard"],
  },
  {
    name: "Sunburst",
    level: 8, school: "evocation", castingTime: "1 action", range: "150 feet", rangeFeet: 150,
    components: [{ type: "verbal" }, { type: "somatic" }, { type: "material", materialCost: "fire and a piece of sunstone", consumed: true }],
    duration: "Instantaneous", requiresConcentration: false, targetType: "sphere",
    areaOfEffect: 60,
    description: "Brilliant sunlight flashes in a 60-foot radius. Each creature makes a Constitution save, taking 12d6 radiant damage on failure (blinded for 1d4 rounds) or half on success.",
    damage: { dice: "12d6", type: "radiant" },
    saveAbility: "constitution",
    classes: ["wizard", "sorcerer", "druid"],
  },
  {
    name: "Meteor Swarm",
    level: 9, school: "evocation", castingTime: "1 action", range: "1 mile", rangeFeet: 5280,
    components: [{ type: "verbal" }, { type: "somatic" }],
    duration: "Instantaneous", requiresConcentration: false, targetType: "point",
    areaOfEffect: 40,
    description: "Blazing orbs of fire plummet to the ground at four points you choose. Each creature in a 40-foot sphere makes a Dexterity save, taking 20d6 fire + 20d6 bludgeoning damage on failure or half on success.",
    damage: { dice: "40d6", type: "fire" },
    saveAbility: "dexterity",
    classes: ["wizard", "sorcerer"],
  },
  {
    name: "Wish",
    level: 9, school: "conjuration", castingTime: "1 action", range: "Self", rangeFeet: 0,
    components: [{ type: "verbal" }],
    duration: "Instantaneous", requiresConcentration: false, targetType: "self",
    description: "The mightiest spell a mortal can cast. You alter the very fabric of reality. You can duplicate any spell of 8th level or lower, or create a greater effect at great cost (33% chance of never casting Wish again).",
    classes: ["wizard", "sorcerer"],
  },
];

// ---------------------------------------------------------------------------
// Spell Slot Tables (full caster)
// ---------------------------------------------------------------------------

const FULL_CASTER_SLOTS: Record<number, number[]> = {
  1:  [2],
  2:  [3],
  3:  [4, 2],
  4:  [4, 3],
  5:  [4, 3, 2],
  6:  [4, 3, 3],
  7:  [4, 3, 3, 1],
  8:  [4, 3, 3, 2],
  9:  [4, 3, 3, 3, 1],
  10: [4, 3, 3, 3, 2],
  11: [4, 3, 3, 3, 2, 1],
  12: [4, 3, 3, 3, 2, 1],
  13: [4, 3, 3, 3, 2, 1, 1],
  14: [4, 3, 3, 3, 2, 1, 1],
  15: [4, 3, 3, 3, 2, 1, 1, 1],
  16: [4, 3, 3, 3, 2, 1, 1, 1],
  17: [4, 3, 3, 3, 2, 1, 1, 1, 1],
  18: [4, 3, 3, 3, 3, 1, 1, 1, 1],
  19: [4, 3, 3, 3, 3, 2, 1, 1, 1],
  20: [4, 3, 3, 3, 3, 2, 2, 1, 1],
};

const HALF_CASTER_SLOTS: Record<number, number[]> = {
  1: [], 2: [2], 3: [2], 4: [2, 1], 5: [2, 2], 6: [2, 2, 1],
  7: [2, 2, 1], 8: [2, 2, 1, 1], 9: [2, 2, 1, 1], 10: [2, 2, 1, 1, 1],
  11: [2, 2, 1, 1, 1], 12: [2, 2, 1, 1, 1, 1], 13: [2, 2, 1, 1, 1, 1],
  14: [2, 2, 1, 1, 1, 1, 1], 15: [2, 2, 1, 1, 1, 1, 1], 16: [2, 2, 1, 1, 1, 1, 1, 1],
  17: [2, 2, 1, 1, 1, 1, 1, 1], 18: [2, 2, 2, 1, 1, 1, 1, 1, 1],
  19: [2, 2, 2, 1, 1, 1, 1, 1, 1], 20: [2, 2, 2, 1, 1, 1, 1, 1, 1],
};

const FULL_CASTERS = ["wizard", "sorcerer", "bard", "cleric", "druid"];
const HALF_CASTERS = ["paladin", "ranger"];
const KNOWN_CASTERS = ["sorcerer", "warlock", "bard"];
const PREPARED_CASTERS = ["wizard", "cleric", "druid", "paladin", "ranger"];

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

let nextSpellId = 1;
function generateSpellId(): string {
  return `spell_${nextSpellId++}_${Date.now().toString(36)}`;
}

// ---------------------------------------------------------------------------
// SpellManager
// ---------------------------------------------------------------------------

export class SpellManager {
  private spellCatalog: Map<string, Spell> = new Map();
  private spellbooks: Map<string, CasterSpellbook> = new Map();
  private dice = new DiceRoller();

  constructor() {
    this.seedStarterSpells();
  }

  // -----------------------------------------------------------------------
  // Catalog
  // -----------------------------------------------------------------------

  private seedStarterSpells(): void {
    for (const template of STARTER_SPELLS) {
      const spell: Spell = { ...template, id: generateSpellId() };
      this.spellCatalog.set(spell.id, spell);
    }
  }

  /** Get a spell by ID. */
  getSpell(id: string): Spell | undefined {
    return this.spellCatalog.get(id);
  }

  /** Find spells by name (case-insensitive partial match). */
  findSpells(name: string): Spell[] {
    const lower = name.toLowerCase();
    return [...this.spellCatalog.values()].filter(s => s.name.toLowerCase().includes(lower));
  }

  /** Get all spells of a given level. */
  getSpellsByLevel(level: SpellLevel): Spell[] {
    return [...this.spellCatalog.values()].filter(s => s.level === level);
  }

  /** Get all spells available to a class. */
  getSpellsForClass(className: string, maxLevel: SpellLevel = 9): Spell[] {
    return [...this.spellCatalog.values()].filter(
      s => s.classes.includes(className) && s.level <= maxLevel,
    );
  }

  /** Create a custom spell. */
  createSpell(template: Omit<Spell, "id">): Spell {
    const spell: Spell = { ...template, id: generateSpellId() };
    this.spellCatalog.set(spell.id, spell);
    return spell;
  }

  // -----------------------------------------------------------------------
  // Spellbook management
  // -----------------------------------------------------------------------

  /** Initialize a spellbook for a character. */
  initSpellbook(characterId: string, className: string, level: number): CasterSpellbook {
    const mode: CastingMode = KNOWN_CASTERS.includes(className) ? "known" : "prepared";

    const slots = this.calculateSlots(className, level);

    const spellbook: CasterSpellbook = {
      characterId,
      mode,
      knownSpells: [],
      preparedSpells: [],
      spellSlots: { ...slots },
      maxSpellSlots: { ...slots },
      concentrationSpell: null,
      concentrationTurnStart: 0,
    };

    // Auto-learn cantrips and level-1 spells for the class
    const available = this.getSpellsForClass(className, Math.min(1, Math.floor(level / 2)));
    for (const spell of available.filter(s => s.level === 0)) {
      spellbook.knownSpells.push(spell.id);
    }
    // Prepare/learn first few level 1 spells
    const lvl1Spells = available.filter(s => s.level === 1).slice(0, 4);
    for (const spell of lvl1Spells) {
      spellbook.knownSpells.push(spell.id);
      if (mode === "prepared") {
        spellbook.preparedSpells.push(spell.id);
      }
    }

    this.spellbooks.set(characterId, spellbook);
    return spellbook;
  }

  /** Calculate spell slots based on class and level. */
  private calculateSlots(className: string, level: number): SpellSlotInfo {
    const slots: SpellSlotInfo = {};
    let table: number[] | undefined;

    if (FULL_CASTERS.includes(className)) {
      table = FULL_CASTER_SLOTS[level];
    } else if (HALF_CASTERS.includes(className)) {
      table = HALF_CASTER_SLOTS[level];
    }

    if (table) {
      table.forEach((max, i) => {
        slots[(i + 1).toString()] = { max, used: 0 };
      });
    }

    return slots;
  }

  /** Learn a new spell. */
  learnSpell(characterId: string, spellId: string): boolean {
    const spellbook = this.spellbooks.get(characterId);
    if (!spellbook || !this.spellCatalog.has(spellId)) return false;

    if (spellbook.knownSpells.includes(spellId)) return false;
    spellbook.knownSpells.push(spellId);
    return true;
  }

  /** Prepare a spell (wizards/clerics/druids). */
  prepareSpell(characterId: string, spellId: string): boolean {
    const spellbook = this.spellbooks.get(characterId);
    if (!spellbook || spellbook.mode !== "prepared") return false;
    if (!spellbook.knownSpells.includes(spellId)) return false;

    const spell = this.spellCatalog.get(spellId);
    if (!spell) return false;

    // Can only prepare spells of levels for which you have slots
    const levelKey = spell.level.toString();
    if (spell.level > 0 && !spellbook.maxSpellSlots[levelKey]) return false;

    if (!spellbook.preparedSpells.includes(spellId)) {
      spellbook.preparedSpells.push(spellId);
    }
    return true;
  }

  /** Unprepare a spell. */
  unprepareSpell(characterId: string, spellId: string): boolean {
    const spellbook = this.spellbooks.get(characterId);
    if (!spellbook) return false;
    const idx = spellbook.preparedSpells.indexOf(spellId);
    if (idx === -1) return false;
    spellbook.preparedSpells.splice(idx, 1);
    return true;
  }

  // -----------------------------------------------------------------------
  // Casting
  // -----------------------------------------------------------------------

  /**
   * Cast a spell, consuming a spell slot.
   * Returns the full result including damage/healing rolls.
   */
  cast(
    characterId: string,
    spellId: string,
    castingLevel?: number, // for upcasting
    targetSaveRoll?: number, // if target makes a save
    spellcastingModifier = 3, // default +3
    proficiencyBonus = 2,
  ): CastResult {
    const spellbook = this.spellbooks.get(characterId);
    const spell = this.spellCatalog.get(spellId);

    if (!spellbook || !spell) {
      return { success: false, spellName: spell?.name ?? "Unknown", slotUsed: 0, concentrationBroken: false, description: "Cannot cast." };
    }

    // Check if spell is available (known/prepared)
    const isKnown = spellbook.knownSpells.includes(spellId);
    const isPrepared = spellbook.preparedSpells.includes(spellId);
    if (!isKnown || (spellbook.mode === "prepared" && !isPrepared && spell.level > 0)) {
      return { success: false, spellName: spell.name, slotUsed: 0, concentrationBroken: false, description: "Spell not prepared." };
    }

    const effectiveLevel = castingLevel ?? spell.level;

    // Cantrips don't use slots
    if (spell.level > 0) {
      const levelKey = effectiveLevel.toString();
      const slotInfo = spellbook.spellSlots[levelKey];
      if (!slotInfo || slotInfo.used >= slotInfo.max) {
        return { success: false, spellName: spell.name, slotUsed: 0, concentrationBroken: false, description: "No spell slots available." };
      }
      slotInfo.used++;
    }

    // Handle concentration
    let concentrationBroken = false;
    if (spell.requiresConcentration) {
      if (spellbook.concentrationSpell) {
        // Break existing concentration
        concentrationBroken = true;
        spellbook.concentrationSpell = null;
      }
      spellbook.concentrationSpell = spellId;
    }

    // Calculate spell save DC
    const saveDC = 8 + proficiencyBonus + spellcastingModifier;

    // Roll damage/healing
    let damageResult: CastResult["damage"];
    let healingResult: CastResult["healing"];

    if (spell.damage) {
      let dice = spell.damage.dice;
      // Handle upcasting
      if (spell.upcast && effectiveLevel > spell.level && spell.damage.higherLevelDice) {
        const extraLevels = effectiveLevel - spell.level;
        for (let i = 0; i < extraLevels; i++) {
          dice += "+" + spell.damage.higherLevelDice;
        }
      }
      // Parse and roll
      const parts = dice.split("+");
      let total = 0;
      const allRolls: number[] = [];
      for (const part of parts) {
        const roll = this.dice.roll(part.trim());
        total += roll.total;
        allRolls.push(...roll.rolls);
      }

      // Halve damage on successful save
      if (spell.saveAbility && targetSaveRoll !== undefined && targetSaveRoll >= saveDC) {
        total = Math.floor(total / 2);
      }

      damageResult = { total, rolls: allRolls, type: spell.damage.type };
    }

    if (spell.healing) {
      const roll = this.dice.roll(spell.healing.dice);
      let total = roll.total + spell.healing.bonus;
      const allRolls = [...roll.rolls];

      if (spell.healing.higherLevelDice && effectiveLevel > spell.level) {
        const extraLevels = effectiveLevel - spell.level;
        for (let i = 0; i < extraLevels; i++) {
          const extraRoll = this.dice.roll(spell.healing.higherLevelDice);
          total += extraRoll.total;
          allRolls.push(...extraRoll.rolls);
        }
      }

      healingResult = { total, rolls: allRolls };
    }

    // Build description
    let description = `Casts ${spell.name}`;
    if (effectiveLevel > spell.level) description += ` at level ${effectiveLevel}`;
    description += ". ";
    if (damageResult) description += `Deals ${damageResult.total} ${spell.damage?.type ?? ""} damage.`;
    if (healingResult) description += `Heals ${healingResult.total} HP.`;
    if (spell.saveAbility && targetSaveRoll !== undefined) {
      description += targetSaveRoll >= saveDC ? " Save succeeded!" : " Save failed!";
    }

    return {
      success: true,
      spellName: spell.name,
      slotUsed: effectiveLevel,
      damage: damageResult,
      healing: healingResult,
      saveDC: spell.saveAbility ? saveDC : undefined,
      saveResult: spell.saveAbility && targetSaveRoll !== undefined
        ? { success: targetSaveRoll >= saveDC, roll: targetSaveRoll }
        : undefined,
      concentrationBroken,
      description,
    };
  }

  // -----------------------------------------------------------------------
  // Concentration
  // -----------------------------------------------------------------------

  /** Check concentration — call when a concentrating caster takes damage. */
  concentrationCheck(
    characterId: string,
    damageTaken: number,
    constitutionModifier: number,
  ): { maintained: boolean; spellLost: string | null } {
    const spellbook = this.spellbooks.get(characterId);
    if (!spellbook || !spellbook.concentrationSpell) {
      return { maintained: true, spellLost: null };
    }

    // DC = 10 or half the damage taken, whichever is higher
    const dc = Math.max(10, Math.floor(damageTaken / 2));
    const roll = this.dice.roll("1d20");
    const total = roll.total + constitutionModifier;
    const maintained = total >= dc;

    if (!maintained) {
      const spellName = this.spellCatalog.get(spellbook.concentrationSpell)?.name ?? "Unknown spell";
      spellbook.concentrationSpell = null;
      return { maintained: false, spellLost: spellName };
    }

    return { maintained: true, spellLost: null };
  }

  // -----------------------------------------------------------------------
  // Rest / Recovery
  // -----------------------------------------------------------------------

  /** Recover spell slots on a short rest (recover nothing by default, sorcerers can use sorcery points). */
  shortRest(characterId: string): { slotsRecovered: number[] } {
    return { slotsRecovered: [] };
  }

  /** Recover all spell slots on a long rest. */
  longRest(characterId: string): { slotsRecovered: number[] } {
    const spellbook = this.spellbooks.get(characterId);
    if (!spellbook) return { slotsRecovered: [] };

    const recovered: number[] = [];
    for (const [level, info] of Object.entries(spellbook.spellSlots)) {
      if (info.used > 0) {
        recovered.push(parseInt(level));
      }
      info.used = 0;
    }

    // Concentration ends
    spellbook.concentrationSpell = null;

    return { slotsRecovered: recovered };
  }

  // -----------------------------------------------------------------------
  // Queries
  // -----------------------------------------------------------------------

  /** Get a character's spellbook. */
  getSpellbook(characterId: string): CasterSpellbook | undefined {
    return this.spellbooks.get(characterId);
  }

  /** Get spells available to cast right now. */
  getAvailableSpells(characterId: string): Spell[] {
    const spellbook = this.spellbooks.get(characterId);
    if (!spellbook) return [];

    const available: Spell[] = [];
    for (const spellId of spellbook.knownSpells) {
      const spell = this.spellCatalog.get(spellId);
      if (!spell) continue;

      // Cantrips always available
      if (spell.level === 0) {
        available.push(spell);
        continue;
      }

      // Must be prepared (for prepared casters)
      if (spellbook.mode === "prepared" && !spellbook.preparedSpells.includes(spellId)) continue;

      // Must have available slot
      const levelKey = spell.level.toString();
      const slotInfo = spellbook.spellSlots[levelKey];
      if (slotInfo && slotInfo.used < slotInfo.max) {
        available.push(spell);
      }
    }
    return available;
  }

  /** Get all cantrips known. */
  getCantrips(characterId: string): Spell[] {
    const spellbook = this.spellbooks.get(characterId);
    if (!spellbook) return [];
    return spellbook.knownSpells
      .map(id => this.spellCatalog.get(id))
      .filter((s): s is Spell => s !== undefined && s.level === 0);
  }

  /** Get spell slot usage summary. */
  getSlotSummary(characterId: string): string {
    const spellbook = this.spellbooks.get(characterId);
    if (!spellbook) return "No spellbook.";

    const lines: string[] = [];
    for (const [level, info] of Object.entries(spellbook.spellSlots)) {
      const remaining = info.max - info.used;
      const boxes = "▪".repeat(remaining) + "▫".repeat(info.used);
      lines.push(`  Level ${level}: ${boxes} (${remaining}/${info.max})`);
    }

    const concentrating = spellbook.concentrationSpell
      ? `\n  Concentrating: ${this.spellCatalog.get(spellbook.concentrationSpell)?.name ?? "Unknown"}`
      : "";

    return `Spell Slots:\n${lines.join("\n")}${concentrating}`;
  }

  // -----------------------------------------------------------------------
  // Serialization
  // -----------------------------------------------------------------------

  serialize(): string {
    return JSON.stringify({
      spellCatalog: Array.from(this.spellCatalog.entries()),
      spellbooks: Array.from(this.spellbooks.entries()),
      nextSpellId,
    });
  }

  deserialize(data: string): void {
    const parsed = JSON.parse(data);
    this.spellCatalog = new Map(parsed.spellCatalog);
    this.spellbooks = new Map(parsed.spellbooks);
    nextSpellId = parsed.nextSpellId ?? this.spellCatalog.size + 1;
  }
}
