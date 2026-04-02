/**
 * DMLog.ai - D&D 5e Ability Score Generation and Management
 * Handles rolling, point buy, racial bonuses, and class suggestions.
 */

export interface AbilityScores {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export interface RacialBonus {
  race: string;
  bonuses: Partial<AbilityScores>;
  traits: string[];
}

export class AbilityScoreGenerator {
  private racialBonuses = new Map<string, RacialBonus>();

  constructor() {
    this.initializeRaces();
  }

  /**
   * Pre-populates the 10 standard D&D races with their bonuses and traits.
   */
  private initializeRaces(): void {
    this.racialBonuses.set('Human', {
      race: 'Human',
      bonuses: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
      traits: []
    });
    this.racialBonuses.set('Elf', {
      race: 'Elf',
      bonuses: { dex: 2 },
      traits: ['darkvision']
    });
    this.racialBonuses.set('Dwarf', {
      race: 'Dwarf',
      bonuses: { con: 2 },
      traits: ['darkvision', 'poison res']
    });
    this.racialBonuses.set('Halfling', {
      race: 'Halfling',
      bonuses: { dex: 2 },
      traits: ['lucky']
    });
    this.racialBonuses.set('Dragonborn', {
      race: 'Dragonborn',
      bonuses: { str: 2, cha: 1 },
      traits: ['breath weapon']
    });
    this.racialBonuses.set('Gnome', {
      race: 'Gnome',
      bonuses: { int: 2 },
      traits: []
    });
    this.racialBonuses.set('Half-Orc', {
      race: 'Half-Orc',
      bonuses: { str: 2, con: 1 },
      traits: []
    });
    this.racialBonuses.set('Tiefling', {
      race: 'Tiefling',
      bonuses: { cha: 2, int: 1 },
      traits: []
    });
    this.racialBonuses.set('Half-Elf', {
      race: 'Half-Elf',
      bonuses: { cha: 2, dex: 1, int: 1 }, // +1 to two others simplified for automation
      traits: []
    });
    this.racialBonuses.set('Orc', {
      race: 'Orc',
      bonuses: { str: 2, con: 1 },
      traits: ['aggressive']
    });
  }

  /** 1. Standard ability score roll (4d6 drop lowest) */
  public roll4d6drop1(): number {
    const rolls = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1);
    rolls.sort((a, b) => a - b);
    return rolls[1] + rolls[2] + rolls[3];
  }

  /** 2. Generates a randomized standard array */
  public rollStandardArray(): AbilityScores {
    const arr = [15, 14, 13, 12, 10, 8];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return { str: arr[0], dex: arr[1], con: arr[2], int: arr[3], wis: arr[4], cha: arr[5] };