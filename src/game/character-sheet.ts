// src/game/character-sheet.ts

/**
 * Represents the structure of a D&D 5e character sheet.
 */
interface CharacterSheet {
  id: string;
  name: string;
  race: string;
  cls: string; // 'class' is a reserved keyword, using 'cls'
  level: number;
  xp: number;
  stats: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  hp: {
    current: number;
    max: number;
    temp: number;
  };
  ac: number;
  speed: number;
  proficiency: number; // Calculated based on level, but stored
  skills: Record<string, boolean>; // true if proficient
  savingThrows: Record<string, boolean>; // true if proficient
  equipment: string[];
  features: string[];
  backstory: string;
  personality: string;
  ideals: string;
  bonds: string;
  flaws: string;
}

// --- Constants ---

/**
 * XP thresholds for each level (index 0 is for level 1, index 1 for level 2, etc.).
 * A character reaches level N when their XP is >= LEVEL_THRESHOLDS[N-1].
 */
const LEVEL_THRESHOLDS = [
  0, // Level 1 (0 XP)
  300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000,
  120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000, // Up to Level 20
];

/**
 * A list of all standard D&D 5e skills.
 */
const ALL_SKILLS = [
  "Acrobatics", "Animal Handling", "Arcana", "Athletics", "Deception",
  "History", "Insight", "Intimidation", "Investigation", "Medicine", "Nature",
  "Perception", "Performance", "Persuasion", "Religion", "Sleight of Hand",
  "Stealth", "Survival",
] as const;
type SkillName = typeof ALL_SKILLS[number];

/**
 * A list of all standard D&D 5e ability scores (stats).
 */
const ALL_STATS = ["str", "dex", "con", "int", "wis", "cha"] as const;
type StatName = typeof ALL_STATS[number];

/**
 * Maps skills to their primary governing ability score.
 */
const SKILL_TO_STAT_MAP: Record<SkillName, StatName> = {
  "Acrobatics": "dex",
  "Animal Handling": "wis",
  "Arcana": "int",
  "Athletics": "str",
  "Deception": "cha",
  "History": "int",
  "Insight": "wis",
  "Intimidation": "cha",
  "Investigation": "int",
  "Medicine": "wis",
  "Nature": "int",
  "Perception": "wis",
  "Performance": "cha",
  "