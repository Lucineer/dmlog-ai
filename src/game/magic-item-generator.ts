/**
 * src/game/magic-item-generator.ts
 * DMLog.ai - Procedural Magic Item Generation
 */

export interface MagicItem {
  id: string;
  name: string;
  type: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'very-rare' | 'legendary';
  attunement: boolean;
  properties: string[];
  lore: string;
  value: number;
  weight: number;
  description: string;
  bonus: number;
  curse?: string;
}

export class MagicItemGenerator {
  private items = new Map<string, MagicItem>();
  
  private prefixes = ['Flaming', 'Frost', 'Thundering', 'Vorpal', 'Lucky', 'Cursed', 'Ancient', 'Blessed', 'Shadow', 'Radiant', 'Spectral', 'Infernal', 'Celestial', 'Void', 'Crystal'];
  private suffixes = ['of the Bear', 'of Lightning', 'of the Phoenix', 'of Shadows', 'of the Dawn', 'of the Deep', 'of Stars', 'of the Storm', 'of the Void', 'of Eternity', 'of the Dragon', 'of the Vampire'];
  private types = ['Longsword', 'Dagger', 'Staff', 'Wand', 'Ring', 'Amulet', 'Shield', 'Armor', 'Bow', 'Crossbow', 'Potion', 'Scroll', 'Cloak', 'Boots', 'Gauntlets', 'Helmet', 'Belt', 'Robe'];

  private propertiesList = [
    'Emits dim light in a 10-foot radius when drawn.',
    'Grants advantage on initiative rolls.',
    'Deals an extra 1d6 elemental damage on a hit.',
    'Allows the user to cast Light at will.',
    'Whispers warnings of danger to the wielder.',
    'Floats on water and other liquids.',
    'Never gets dirty or stained.',
    'Can be used as a compass pointing North.',
    'Grants resistance to a random damage type.',
    'Increases movement speed by 5 feet.'
  ];

  private cursesList = [
    'User becomes fiercely possessive of the item.',
    'Attracts hostile undead within 1 mile.',
    'User takes 1d4 psychic damage when unequipped.',
    'Causes vivid, exhausting nightmares.',
    'Food tastes like ash to the user.',
    'User\'s shadow acts independently and maliciously.',
    'Animals are hostile toward the user.',
    'User cannot speak lies, but struggles to tell the whole truth.'
  ];

  constructor() {
    this.prePopulateItems();
  }

  /**
   * Pre-populates 20 specific legendary/standard items
   */
  private prePopulateItems(): void {
    const initialItems: Partial<MagicItem>[] = [
      { name: 'Holy Avenger', type: 'Longsword', rarity: 'very-rare', attunement: true, bonus: 3, value: 50000, description: 'A glowing blade of divine power.' },
      { name: 'Staff of Magi', type: 'Staff', rarity: 'legendary', attunement: true, bonus: 3, value: 100000, description: 'Contains immense arcane power and spells.' },
      { name: 'Vorpal Sword', type: 'Longsword', rarity: 'legendary', attunement: true, bonus: 3, value: 75000, description: 'Snickersnack! Severs heads on a natural 20.' },
      { name: 'Cloak of Invisibility', type: 'Cloak', rarity: 'legendary', attunement: true, bonus: 0, value: 50000, description: 'Renders the wearer completely invisible.' },
      { name: 'Ring of Three Wishes', type: 'Ring', rarity: 'legendary', attunement: false, bonus: 0, value: 150000, description: 'Contains the power to alter reality three times.' },
      { name: 'Deck of Many Things', type: 'Misc', rarity: 'legendary', attunement: false, bonus: 0, value: 50000, description: 'A deck of cards that brings ruin or unimaginable wealth.' },
      { name: 'Bag of Holding', type: 'Misc', rarity: 'uncommon', attunement: false, bonus: 0, value: 500, description: 'An extradimensional space for storing items.' },
      { name: 'Cloak of Elvenkind', type: 'Cloak', rarity: 'uncommon', attunement: true, bonus: 0, value: 500, description: 'Grants advantage on Stealth checks.' },
      { name: 'Boots of Speed', type: 'Boots', rarity: 'rare', attunement: true, bonus: 0, value: 4000, description: 'Doubles walking speed for up to 10 minutes.' },
      { name: 'Gauntlets of Ogre Power', type: 'Gauntlets', rarity: 'uncommon', attunement: true, bonus: 0, value: 500, description: 'Sets Strength score to 19.' },
      { name: 'Helm of Telepathy', type: 'Helmet', rarity: 'rare', attunement: true, bonus: 0, value: 4000, description: 'Allows the wearer to read thoughts and communicate telepathically.' },
      { name: 'Wand of Fireballs', type: 'Wand', rarity: 'rare', attunement: true, bonus: 0, value: 4000, description: 'Casts Fireball up to 7 times per day.' },
      { name: 'Ring of Protection', type: 'Ring', rarity: 'uncommon', attunement: true, bonus: 1, value: 3500, description: 'Grants +1 to AC and saving throws.' },
      { name: 'Amulet of Health', type: 'Amulet', rarity: 'rare', attunement: true, bonus: 0, value: 4000, description: 'Sets Constitution score to 19.' },
      { name: 'Potion of Healing', type: 'Potion', rarity: 'common', attunement: false, bonus: 0, value: 50, description: 'Restores 2d4+2 hit points.' },
      { name: 'Scroll of Fireball (3rd)', type: 'Scroll', rarity: 'uncommon', attunement: false, bonus: 0, value: 300, description: 'A magical scroll containing the Fireball spell.' },
      { name: 'Shield +1', type: 'Shield', rarity: 'uncommon', attunement: false, bonus: 1, value: 1500, description: 'A sturdy shield enhanced with basic magic.' },
      { name: 'Dragon Scale Mail', type: 'Armor', rarity: 'very-rare', attunement: true, bonus: 1, value: 25000, description: 'Armor made from the scales of a mighty dragon.' },
      { name: 'Sun Blade', type: 'Longsword', rarity: 'legendary', attunement: true, bonus: 2, value: 60000, description: 'A hilt that emits a blade of pure sunlight.' },
      { name: 'Sphere of Annihilation', type: 'Misc', rarity: 'legendary', attunement: false, bonus: 0, value: 100000, description: 'A hole in the multiverse that destroys anything it touches.' }
    ];

    initialItems.forEach(item => {
      this.addItem(this.buildItem(item));
    });
  }

  // --- 1. Procedural Generation ---
  public generate(rarity?: MagicItem['rarity']): MagicItem {
    const r = rarity || this.randomRarity();
    const type = this.rand(this.types);
    const prefix = Math.random() > 0.5 ? this.rand(this.prefixes) : '';
    const suffix = Math.random() > 0.5 ? this.rand(this.suffixes) : '';
    
    let name = type;
    if (prefix && suffix) name = `${prefix} ${type} ${suffix}`;
    else if (prefix) name = `${prefix} ${type}`;
    else if (suffix) name = `${type} ${suffix}`;
    else name = `Magic ${type}`;

    return this.buildItem({ name, type, rarity: r });
  }

  // --- 2. Generate Named ---
  public generateNamed(prefix: string, baseType: string, suffix: string): MagicItem {
    const name = `${prefix} ${baseType} ${suffix}`.trim();
    return this.buildItem({ name, type: baseType, rarity: this.randomRarity() });
  }

  // --- 3. Generate By Type ---
  public generateByType(type: string): MagicItem {
    const prefix = this.rand(this.prefixes);
    const suffix = this.rand(this.suffixes);
    return this.buildItem({ name: `${prefix} ${type} ${suffix}`, type, rarity: this.randomRarity() });
  }

  // --- 4. Generate Treasure Hoard ---
  public generateTreasureHoard(cr: number): MagicItem[] {
    const items: MagicItem[] = [];
    const count = Math.max(1, Math.floor(Math.random() * 3) + Math.floor(cr / 4));
    
    for (let i = 0; i < count; i++) {
      let r: MagicItem['rarity'] = 'common';
      if (cr >= 17) r = this.rand(['rare', 'very-rare', 'legendary']);
      else if (cr >= 11) r = this.rand(['uncommon', 'rare', 'very-rare']);
      else if (cr >= 5) r = this.rand(['common', 'uncommon', 'rare']);
      else r = this.rand(['common', 'uncommon']);
      
      items.push(this.generate(r));
    }
    return items;
  }

  // --- 5. Get Item ---
  public getItem(id: string): MagicItem | undefined {
    return this.items.get(id);
  }

  // --- 6. Search ---
  public search(query: string): MagicItem[] {
    const q = query.toLowerCase();
    return this.getAll().filter(item => 
      item.name.toLowerCase().includes(q) || 
      item.description.toLowerCase().includes(q) ||
      item.lore.toLowerCase().includes(q)
    );
  }

  // --- 7. Get By Rarity ---
  public getByRarity(rarity: MagicItem['rarity']): MagicItem[] {
    return this.getAll().filter(item => item.rarity === rarity);
  }

  // --- 8. Get By Type ---
  public getByType(type: string): MagicItem[] {
    return this.getAll().filter(item => item.type.toLowerCase() === type.toLowerCase());
  }

  // --- 9. Get Attuned Items ---
  public getAttunedItems(): MagicItem[] {
    return this.getAll().filter(item => item.attunement);
  }

  // --- 10. Get Attuned Count ---
  public getAttunedCount(): number {
    return this.getAttunedItems().length;
  }

  // --- 11. Add Item ---
  public addItem(item: MagicItem): void {
    this.items.set(item.id, item);
  }

  // --- 12. Remove Item ---
  public removeItem(id: string): void {
    this.items.delete(id);
  }

  // --- 13. Get Inventory Value ---
  public getInventoryValue(): number {
    return this.getAll().reduce((sum, item) => sum + item.value, 0);
  }

  // --- 14. Get Item Description ---
  public getItemDescription(id: string): string {
    const item = this.getItem(id);
    if (!item) return 'Item not found.';

    let desc = `**${item.name}**\n`;
    desc += `*${item.type}, ${item.rarity}${item.attunement ? ' (requires attunement)' : ''}*\n\n`;
    desc += `${item.description}\n\n`;
    
    if (item.properties.length > 0) {
      desc += `**Properties:**\n- ${item.properties.join('\n- ')}\n\n`;
    }
    if (item.curse) {
      desc += `**Curse:** ${item.curse}\n\n`;
    }
    
    desc += `*Lore:* ${item.lore}\n`;
    desc += `**Value:** ${item.value} gp | **Weight:** ${item.weight} lbs | **Bonus:** +${item.bonus}`;
    
    return desc;
  }

  // --- 15. Roll Random Property ---
  public rollRandomProperty(): string {
    return this.rand(this.propertiesList);
  }

  // --- 16. Roll Curse ---
  public rollCurse(): string {
    return this.rand(this.cursesList);
  }

  // --- 17. Generate Potion ---
  public generatePotion(): MagicItem {
    const potionTypes = ['Healing', 'Invisibility', 'Flying', 'Giant Strength', 'Water Breathing', 'Fire Breath'];
    const type = this.rand(potionTypes);
    const rarity = type === 'Healing' ? 'common' : 'uncommon';
    return this.buildItem({
      name: `Potion of ${type}`,
      type: 'Potion',
      rarity,
      attunement: false,
      description: `A magical draught that grants the effects of ${type}.`
    });
  }

  // --- 18. Generate Scroll ---
  public generateScroll(level: number): MagicItem {
    let rarity: MagicItem['rarity'] = 'common';
    if (level >= 9) rarity = 'legendary';
    else if (level >= 6) rarity = 'very-rare';
    else if (level >= 4) rarity = 'rare';
    else if (level >= 2) rarity = 'uncommon';

    return this.buildItem({
      name: `Spell Scroll (Level ${level})`,
      type: 'Scroll',
      rarity,
      attunement: false,
      description: `A scroll bearing a magical incantation of level ${level}.`
    });
  }

  // --- 19. Get All ---
  public getAll(): MagicItem[] {
    return Array.from(this.items.values());
  }

  // --- 20. Serialize / Deserialize ---
  public serialize(): string {
    return JSON.stringify(this.getAll());
  }

  public deserialize(data: string): void {
    try {
      const parsed: MagicItem[] = JSON.parse(data);
      this.items.clear();
      parsed.forEach(item => this.addItem(item));
    } catch (e) {
      console.error('Failed to deserialize magic items', e);
    }
  }

  // --- Internal Helpers ---
  private buildItem(overrides: Partial<MagicItem>): MagicItem {
    const rarity = overrides.rarity || 'common';
    const isCursed = Math.random() < 0.1;
    
    const propsCount = rarity === 'legendary' ? 3 : rarity === 'very-rare' ? 2 : rarity === 'rare' ? 1 : 0;
    const properties: string[] = [];
    for (let i = 0; i < propsCount; i++) {
      properties.push(this.rollRandomProperty());
    }

    const baseValue = this.getBaseValue(rarity);
    const bonus = this.getBonus(rarity);

    return {
      id: overrides.id || this.generateId(),
      name: overrides.name || 'Unknown Item',
      type: overrides.type || 'Misc',
      rarity,
      attunement: overrides.attunement ?? ['rare', 'very-rare', 'legendary'].includes(rarity),
      properties: overrides.properties || properties,
      lore: overrides.lore || `An ancient item forged in a forgotten era.`,
      value: overrides.value || Math.floor(baseValue + (Math.random() * baseValue * 0.2)),
      weight: overrides.weight || Math.floor(Math.random() * 10) + 1,
      description: overrides.description || `A ${rarity} magical ${overrides.type || 'item'}.`,
      bonus: overrides.bonus ?? bonus,
      curse: overrides.curse || (isCursed ? this.rollCurse() : undefined)
    };
  }

  private rand<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 11);
  }

  private randomRarity(): MagicItem['rarity'] {
    const roll = Math.random();
    if (roll < 0.40) return 'common';
    if (roll < 0.70) return 'uncommon';
    if (roll < 0.90) return 'rare';
    if (roll < 0.98) return 'very-rare';
    return 'legendary';
  }

  private getBaseValue(rarity: MagicItem['rarity']): number {
    switch (rarity) {
      case 'common': return 50;
      case 'uncommon': return 250;
      case 'rare': return 2500;
      case 'very-rare': return 25000;
      case 'legendary': return 100000;
      default: return 10;
    }
  }

  private getBonus(rarity: MagicItem['rarity']): number {
    switch (rarity) {
      case 'uncommon': return 1;
      case 'rare': return 2;
      case 'very-rare': return 3;
      case 'legendary': return 3;
      default: return 0;
    }
  }
}