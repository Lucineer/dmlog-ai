// src/game/rest-manager.ts

export interface RestConfig {
  shortRestDuration: number;
  longRestDuration: number;
  hitDiceRecovery: 'all' | 'half';
  features: RestFeature[];
}

export interface RestFeature {
  name: string;
  resetsOn: 'short' | 'long';
  uses: number;
  currentUses: number;
}

export interface CharacterResources {
  hp: number;
  maxHp: number;
  conMod: number; // Added for hit dice calculation
  hitDice: number;
  hitDiceMax: number;
  spellSlots: Record<number, number>;
  maxSpellSlots: Record<number, number>; // Added for long rest recovery
  featureUses: Record<string, number>;
}

export interface RestResult {
  type: 'short' | 'long';
  hpRecovered: number;
  hitDiceUsed: number;
  spellSlotsRecovered: Record<number, number>;
  featuresRecovered: string[];
  duration: number;
}

export class RestManager {
  private config: RestConfig;

  constructor(config: RestConfig) {
    this.config = config;
  }

  /**
   * 1. Executes a short rest. Allows spending hit dice and recovers short-rest features.
   */
  public shortRest(resources: CharacterResources, hitDiceToSpend: number = 0): RestResult {
    if (!this.canShortRest(resources)) {
      throw new Error("Cannot short rest: Missing resources or already at full capacity.");
    }

    let hpRecovered = 0;
    if (hitDiceToSpend > 0) {
      hpRecovered = this.spendHitDice(resources, hitDiceToSpend);
    }

    const featuresRecovered = this.resetAllFeatures(this.config.features, 'short');
    featuresRecovered.forEach(f => {
      resources.featureUses[f] = this.config.features.find(ft => ft.name === f)!.uses;
    });

    return {
      type: 'short',
      hpRecovered,
      hitDiceUsed: hitDiceToSpend,
      spellSlotsRecovered: {}, // No spell slot recovery on short rest
      featuresRecovered,
      duration: this.config.shortRestDuration
    };
  }

  /**
   * 2. Executes a long rest. Recovers full HP, half hit dice, all spell slots, all features.
   */
  public longRest(resources: CharacterResources): RestResult {
    const hpRecovered = resources.maxHp - resources.hp;
    resources.hp = resources.maxHp;

    // Recover Hit Dice
    let diceToRecover = Math.max(1, Math.floor(resources.hitDiceMax / 2));
    if (this.config.hitDiceRecovery === 'all') diceToRecover = resources.hitDiceMax;
    resources.hitDice = Math.min(resources.hitDiceMax, resources.hitDice + diceToRecover);

    // Recover Spell Slots
    const spellSlotsRecovered: Record<number, number> = {};
    for (const level in resources.maxSpellSlots) {
      const missing = resources.maxSpellSlots[level] - (resources.spellSlots[level] || 0);
      if (missing > 0) {
        spellSlotsRecovered[level] = missing;
        resources.spellSlots[level] = resources.maxSpellSlots[level];
      }
    }

    // Recover Features
    const featuresRecovered = this.resetAllFeatures(this.config.features, 'long');
    featuresRecovered.forEach(f => {
      resources.featureUses[f] = this.config.features.find(ft => ft.name === f)!.uses;
    });

    return {
      type: 'long',
      hpRecovered,
      hitDiceUsed: 0,
      spellSlotsRecovered,
      featuresRecovered,
      duration: this.config.longRestDuration
    };
  }

  /**
   * 3. Spends hit dice to recover HP. Simulates rolling and adds CON mod.
   * Returns the amount of HP recovered.
   */
  public spendHitDice(resources: CharacterResources, count: number): number {
    const actualSpend = Math.min(count, resources.hitDice);
    if (actualSpend <= 0) return 0;

    // Simulate average roll (half of hit die type, e.g. d8 = 4.5 ~ 4) + CON mod
    const averageDieRoll = 4; 
    let totalRecovered = 0;

    for (let i = 0; i < actualSpend; i++) {
      totalRecovered += averageDieRoll + resources.conMod;
    }

    resources.hitDice -= actualSpend;
    const actualHpRecovered = Math.min(totalRecovered, resources.maxHp - resources.hp);
    resources.hp += actualHpRecovered;

    return actualHpRecovered;
  }

  /**
   * 4. Recovers a specific spell slot level up to a maximum.
   */
  public recoverSpellSlots(resources: CharacterResources, level: number, amount: number): number {
    const current = resources.spellSlots[level] || 0;
    const max = resources.maxSpellSlots[level] || 0;
    const recovered = Math.min(amount, max - current);
    
    resources.spellSlots[level] = current + recovered;
    return recovered;
  }

  /**
   * 5. Uses a feature if uses remain. Decrements the resource.
   */
  public useFeature(resources: CharacterResources, featureName: string): boolean {
    const feature = this.config.features.find(f => f.name === featureName);
    if (!feature) return false;

    if ((resources.featureUses[featureName] ?? 0) > 0) {
      resources.featureUses[featureName]--;
      return true;
    }
    return false;
  }

  /**
   * 6. Resets all features of a specific rest type. Returns array of names reset.
   */
  public resetAllFeatures(features: RestFeature[], type: 'short' | 'long'): string[] {
    const recovered: string[] = [];
    features.forEach(f => {
      // Long rest resets everything, short rest only resets short
      if (f.resetsOn === type || (type === 'long' && f.resetsOn === 'short')) {
        recovered.push(f.name);
      }
    });
    return recovered;
  }

  /**
   * 7. Gets a formatted string of the remaining resources.
   */
  public getRemainingResources(resources: CharacterResources): string {
    const slotStrings = Object.entries(resources.spellSlots)
      .map(([lvl, cnt]) => `Lvl ${lvl}: ${cnt}/${resources.maxSpellSlots[lvl] || 0}`)
      .join(', ');

    const featureStrings = this.config.features
      .map(f => `${f.name}: ${resources.featureUses[f.name] ?? 0}/${f.uses}`)
      .join(', ');

    return `HP: ${resources.hp}/${resources.maxHp} | HD: ${resources.hitDice}/${resources.hitDiceMax}\n` +
           `Spell Slots: [${slotStrings}]\n` +
           `Features: [${featureStrings}]`;
  }

  /**
   * 8. Checks if a short rest would be beneficial.
   */
  public canShortRest(resources: CharacterResources): boolean {
    const hasMissingHp = resources.hp < resources.maxHp;
    const hasHitDice = resources.hitDice > 0;
    const hasShortRestFeatures = this.config.features.some(f => 
      f.resetsOn === 'short' && (resources.featureUses[f.name] ?? 0) < f.uses
    );
    
    return (hasMissingHp && hasHitDice) || hasShortRestFeatures;
  }

  /**
   * 9. Suggests the best type of rest based on remaining percentage of total resources.
   */
  public suggestedRest(resources: CharacterResources): 'short' | 'long' | 'none' {
    const hpPercent = resources.hp / resources.maxHp;
    const hdPercent = resources.hitDice / resources.hitDiceMax;
    
    let totalMissingPercent = (1 - hpPercent) + (1 - hdPercent);
    
    // Factor in missing spell slots
    let totalSlots = 0, missingSlots = 0;
    for (const lvl in resources.maxSpellSlots) {
      totalSlots += resources.maxSpellSlots[lvl];
      missingSlots += resources.maxSpellSlots[lvl] - (resources.spellSlots[lvl] || 0);
    }
    if (totalSlots > 0) totalMissingPercent += (missingSlots / totalSlots);

    const averageRemaining = (1 - (totalMissingPercent / 3));

    if (averageRemaining >= 0.8) return 'none';
    if (averageRemaining >= 0.4) return 'short';
    return 'long';
  }

  /**
   * 10. Generates narrative flavor text for the rest.
   */
  public restNarrative(
    type: 'short' | 'long', 
    location: string = 'an unknown location', 
    events: string[] = []
  ): string {
    const eventStr = events.length > 0 ? `During the rest: ${events.join(', ')}.` : 'The rest passes uneventfully.';
    
    if (type === 'short') {
      return `The party takes a moment to catch their breath at ${location}. Tending to immediate wounds and sharing a quick drink, they gather their resolve. ${eventStr}`;
    } else {
      return `The party makes camp at ${location}, the flames of a campfire pushing back the shadows. After securing the perimeter and resting for the night, they wake fully restored and ready to face what lies ahead. ${eventStr}`;
    }
  }
}