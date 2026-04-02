export interface SpellEntry {
  id: string;
  name: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
  components: string;
  duration: string;
  description: string;
  damage?: string;
  save?: string;
  source: string;
  learnedAt: number;
  prepared: boolean;
  customNotes: string;
}

/**
 * Spellbook management and spell research system for DMLog.ai
 */
export class Spellbook {
  private spells = new Map<string, SpellEntry>();
  private prepared = new Set<string>();

  constructor() {
    this.prePopulateSpells();
  }

  /**
   * 1. learnSpell
   * Adds a new spell to the spellbook.
   */
  public learnSpell(spell: SpellEntry): void {
    this.spells.set(spell.id, spell);
    if (spell.prepared || spell.level === 0) {
      this.prepared.add(spell.id);
      spell.prepared = true;
    }
  }

  /**
   * 2. forgetSpell
   * Removes a spell entirely from the spellbook.
   */
  public forgetSpell(id: string): void {
    this.spells.delete(id);
    this.prepared.delete(id);
  }

  /**
   * 3. prepareSpell
   * Marks a known spell as prepared for casting.
   */
  public prepareSpell(id: string): void {
    const spell = this.spells.get(id);
    if (spell) {
      this.prepared.add(id);
      spell.prepared = true;
    }
  }

  /**
   * 4. unprepareSpell
   * Removes a spell from the prepared list (cantrips usually remain prepared).
   */
  public unprepareSpell(id: string): void {
    const spell = this.spells.get(id);
    if (spell && spell.level > 0) {
      this.prepared.delete(id);
      spell.prepared = false;
    }
  }

  /**
   * 5. getPreparedSpells
   * Returns an array of all currently prepared spells.
   */
  public getPreparedSpells(): SpellEntry[] {
    return Array.from(this.prepared)
      .map((id) => this.spells.get(id)!)
      .filter(Boolean);
  }

  /**
   * 6. getSpellById
   * Retrieves a specific spell by its unique identifier.
   */
  public getSpellById(id: string): SpellEntry | undefined {
    return this.spells.get(id);
  }

  /**
   * 7. searchByName
   * Performs a case-insensitive search for spells by name.
   */
  public searchByName(query: string): SpellEntry[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.spells.values()).filter((spell) =>
      spell.name.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * 8. getBySchool
   * Retrieves all spells belonging to a specific school of magic.
   */
  public getBySchool(school: string): SpellEntry[] {
    const lowerSchool = school.toLowerCase();
    return Array.from(this.spells.values()).filter(
      (spell) => spell.school.toLowerCase() === lowerSchool
    );
  }

  /**
   * 9. getByLevel
   * Retrieves all spells of an exact level.
   */
  public getByLevel(level: number): SpellEntry[] {
    return Array.from(this.spells.values()).filter((spell) => spell.level === level);
  }

  /**
   * 10. getByLevelRange
   * Retrieves spells within a specific level range (inclusive).
   */
  public getByLevelRange(min: number, max: number): SpellEntry[] {
    return Array.from(this.spells.values()).filter(
      (spell) => spell.level >= min && spell.level <= max
    );
  }

  /**
   * 11. getSpellsKnown
   * Returns the total number of spells in the spellbook.
   */
  public getSpellsKnown(): number {
    return this.spells.size;
  }

  /**
   * 12. getSpellsByPrepared
   * Returns spells based on their preparation status.
   */
  public getSpellsByPrepared(prepared: boolean): SpellEntry[] {
    return Array.from(this.spells.values()).filter((spell) => spell.prepared === prepared);
  }

  /**
   * 13. castSpell
   * Generates a narrative description of casting the spell.
   */
  public castSpell(id: string): string {
    const spell = this.spells.get(id);
    if (!spell) return `You attempt to cast a spell, but the incantation escapes your mind.`;
    
    if (spell.level > 0 && !this.prepared.has(id)) {
      return `You begin the gestures for ${spell.name}, but realize you haven't prepared it today!`;
    }

    let narrative = `You channel arcane energy, casting **${spell.name}**! `;
    narrative += `(${spell.school} Level ${spell.level})\n`;
    narrative += `*Casting Time:* ${spell.castingTime} | *Range:* ${spell.range}\n`;
    narrative += `> ${spell.description}`;

    if (spell.damage) narrative += `\n**Damage/Effect:** ${spell.damage}`;
    if (spell.save) narrative += `\n**Saving Throw:** ${spell.save}`;

    return narrative;
  }

  /**
   * 14. getCantrips
   * Retrieves all level 0 spells (cantrips).
   */
  public getCantrips(): SpellEntry[] {
    return this.getByLevel(0);
  }

  /**
   * 15. getHighestSpellLevel
   * Finds the highest level spell currently in the spellbook.
   */
  public getHighestSpellLevel(): number {
    let max = 0;
    for (const spell of this.spells.values()) {
      if (spell.level > max) max = spell.level;
    }
    return max;
  }

  /**
   * 16. getSpellSchools
   * Returns a unique list of all magic schools present in the spellbook.
   */
  public getSpellSchools(): string[] {
    const schools = new Set<string>();
    for (const spell of this.spells.values()) {
      schools.add(spell.school);
    }
    return Array.from(schools).sort();
  }

  /**
   * 17. addCustomNote
   * Appends or updates custom notes for a specific spell.
   */
  public addCustomNote(id: string, note: string): void {
    const spell = this.spells.get(id);
    if (spell) {
      spell.customNotes = spell.customNotes ? `${spell.customNotes}\n${note}` : note;
    }
  }

  /**
   * 18. getSpellDescription
   * Returns just the description text of a spell.
   */
  public getSpellDescription(id: string): string {
    const spell = this.spells.get(id);
    return spell ? spell.description : 'Spell description not found.';
  }

  /**
   * 19. getSpellsByComponent
   * Finds spells that require a specific component (V, S, or M).
   */
  public getSpellsByComponent(component: string): SpellEntry[] {
    const upperComp = component.toUpperCase();
    return Array.from(this.spells.values()).filter((spell) =>
      spell.components.toUpperCase().includes(upperComp)
    );
  }

  /**
   * 20a. serialize
   * Converts the spellbook state into a JSON string.
   */
  public serialize(): string {
    const data = {
      spells: Array.from(this.spells.entries()),
      prepared: Array.from(this.prepared),
    };
    return JSON.stringify(data);
  }

  /**
   * 20b. deserialize
   * Restores the spellbook state from a JSON string.
   */
  public deserialize(data: string): void {
    try {
      const parsed = JSON.parse(data);
      this.spells = new Map(parsed.spells);
      this.prepared = new Set(parsed.prepared);
    } catch (error) {
      console.error('Failed to deserialize spellbook data:', error);
    }
  }

  /**
   * Pre-populates the spellbook with 48 standard spells across all schools and levels.
   */
  private prePopulateSpells(): void {
    const now = Date.now();
    const add = (
      id: string, name: string, level: number, school: string, 
      castingTime: string, range: string, components: string, duration: string, 
      description: string, damage?: string, save?: string
    ) => {
      this.learnSpell({
        id, name, level, school, castingTime, range, components, duration, description,
        damage, save, source: 'Basic Rules', learnedAt: now, prepared: level === 0, customNotes: ''
      });
    };

    // Level 0 (Cantrips)
    add('fire-bolt', 'Fire Bolt', 0, 'Evocation', '1 action', '120 ft', 'V, S', 'Instantaneous', 'You hurl a mote of fire at a creature or object.', '1d10 fire');
    add('mage-hand', 'Mage Hand', 0, 'Conjuration', '1 action', '30 ft', 'V, S', '1 minute', 'A spectral, floating hand appears at a point you choose.');
    add('prestidigitation', 'Prestidigitation', 0, 'Transmutation', '1 action', '10 ft', 'V, S', '1 hour', 'You create a minor magical trick or illusion.');
    add('light', 'Light', 0, 'Evocation', '1 action', 'Touch', 'V, M', '1 hour', 'You touch an object and it sheds bright light.', undefined, 'Dexterity');
    add('guidance', 'Guidance', 0, 'Divination', '1 action', 'Touch', 'V, S', 'Concentration, up to 1 min', 'The target can roll a d4 and add the number rolled to one ability check.');
    add('resistance', 'Resistance', 0, 'Abjuration', '1 action', 'Touch', 'V, S, M', 'Concentration, up to 1 min', 'The target can roll a d4 and add the number rolled to one saving throw.');
    add('thorn-whip', 'Thorn Whip', 0, 'Transmutation', '1 action', '30 ft', 'V, S, M', 'Instantaneous', 'You create a long, vine-like whip covered in thorns.', '1d6 piercing');
    add('message', 'Message', 0, 'Transmutation', '1 action', '120 ft', 'V, S, M', '1 round', 'You point your finger toward a creature and whisper a message.');

    // Level 1
    add('shield', 'Shield', 1, 'Abjuration', '1 reaction', 'Self', 'V, S', '1 round', 'An invisible barrier of magical force appears and protects you.');
    add('magic-missile', 'Magic Missile', 1, 'Evocation', '1 action', '120 ft', 'V, S', 'Instantaneous', 'You create three glowing darts of magical force.', '3d4+3 force');
    add('healing-word', 'Healing Word', 1, 'Evocation', '1 bonus action', '60 ft', 'V', 'Instantaneous', 'A creature of your choice regains hit points.', '1d4 + mod healing');
    add('detect-magic', 'Detect Magic', 1, 'Divination', '1 action', 'Self', 'V, S', 'Concentration, up to 10 min', 'You sense the presence of magic within 30 feet of you.');
    add('charm-person', 'Charm Person', 1, 'Enchantment', '1 action', '30 ft', 'V, S', '1 hour', 'You attempt to charm a humanoid you can see.', undefined, 'Wisdom');
    add('sleep', 'Sleep', 1, 'Enchantment', '1 action', '90 ft', 'V, S, M', '1 minute', 'This spell sends creatures into a magical slumber.');
    add('thunderwave', 'Thunderwave', 1, 'Evocation', '1 action', 'Self (15ft cube)', 'V, S', 'Instantaneous', 'A wave of thunderous force sweeps out from you.', '2d8 thunder', 'Constitution');
    add('faerie-fire', 'Faerie Fire', 1, 'Evocation', '1 action', '60 ft', 'V', 'Concentration, up to 1 min', 'Objects and creatures in a 20-foot cube are outlined in light.', undefined, 'Dexterity');

    // Level 2
    add('misty-step', 'Misty Step', 2, 'Conjuration', '1 bonus action', 'Self', 'V', 'Instantaneous', 'Briefly surrounded by silvery mist, you teleport up to 30 feet.');
    add('invisibility', 'Invisibility', 2, 'Illusion', '1 action', 'Touch', 'V, S, M', 'Concentration, up to 1 hour', 'A creature you touch becomes invisible until it attacks or casts a spell.');
    add('web', 'Web', 2, 'Conjuration', '1 action', '60 ft', 'V, S, M', 'Concentration, up to 1 hour', 'You conjure a mass of thick, sticky webbing.', undefined, 'Dexterity');
    add('scorching-ray', 'Scorching Ray', 2, 'Evocation', '1 action', '120 ft', 'V, S', 'Instantaneous', 'You create three rays of fire and hurl them at targets.', '2d6 fire per ray');
    add('hold-person', 'Hold Person', 2, 'Enchantment', '1 action', '60 ft', 'V, S, M', 'Concentration, up to 1 min', 'Choose a humanoid that you can see to paralyze them.', undefined, 'Wisdom');
    add('silence', 'Silence', 2, 'Illusion', '1 action', '120 ft', 'V, S', 'Concentration, up to 10 min', 'No sound can be created within or pass through a 20-foot-radius sphere.');
    add('see-invisibility', 'See Invisibility', 2, 'Divination', '1 action', 'Self', 'V, S, M', '1 hour', 'You see invisible creatures and objects as if they were visible.');
    add('mirror-image', 'Mirror Image', 2, 'Illusion', '1 action', 'Self', 'V, S', '1 minute', 'Three illusory duplicates of yourself appear in your space.');

    // Level 3
    add('fireball', 'Fireball', 3, 'Evocation', '1 action', '150 ft', 'V, S, M', 'Instantaneous', 'A bright streak flashes from your pointing finger and blossoms into an explosion.', '8d6 fire', 'Dexterity');
    add('counterspell', 'Counterspell', 3, 'Abjuration', '1 reaction', '60 ft', 'S', 'Instantaneous', 'You attempt to interrupt a creature in the process of casting a spell.');
    add('dispel-magic', 'Dispel Magic', 3, 'Abjuration', '1 action', '120 ft', 'V, S', 'Instantaneous', 'Choose one creature, object, or magical effect to end spells on it.');
    add('fly', 'Fly', 3, 'Transmutation', '1 action', 'Touch', 'V, S, M', 'Concentration, up to 10 min', 'You touch a willing creature, granting them a flying speed of 60 feet.');
    add('lightning-bolt', 'Lightning Bolt', 3, 'Evocation', '1 action', 'Self (100ft line)', 'V, S, M', 'Instantaneous', 'A stroke of lightning blasts forward in a line.', '8d6 lightning', 'Dexterity');
    add('revivify', 'Revivify', 3, 'Necromancy', '1 action', 'Touch', 'V, S, M', 'Instantaneous', 'You touch a creature that has died within the last minute and return it to life.');
    add('spirit-guardians', 'Spirit Guardians', 3, 'Conjuration', '1 action', 'Self (15ft radius)', 'V, S, M', 'Concentration, up to 10 min', 'Spirits flit around you to a distance of 15 feet.', '3d8 radiant/necrotic', 'Wisdom');
    add('haste', 'Haste', 3, 'Transmutation', '1 action', 'Touch', 'V, S, M', 'Concentration, up to 1 min', 'Choose a willing creature. Its speed is doubled, it gains +2 AC, and an extra action.');

    // Level 4
    add('polymorph', 'Polymorph', 4, 'Transmutation', '1 action', '60 ft', 'V, S, M', 'Concentration, up to 1 hour', 'This spell transforms a creature that you can see into a new form.', undefined, 'Wisdom');
    add('dimension-door', 'Dimension Door', 4, 'Conjuration', '1 action', '500 ft', 'V', 'Instantaneous', 'You teleport yourself to any other spot within range.');
    add('greater-invisibility', 'Greater Invisibility', 4, 'Illusion', '1 action', 'Touch', 'V, S', 'Concentration, up to 1 min', 'You or a creature you touch becomes invisible, even when attacking or casting.');
    add('ice-storm', 'Ice Storm', 4, 'Evocation', '1 action', '300 ft', 'V, S, M', 'Instantaneous', 'A hail of rock-hard ice pounds to the ground in a 20-foot-radius.', '2d8 bludgeoning + 4d6 cold', 'Dexterity');
    add('banishment', 'Banishment', 4, 'Abjuration', '1 action', '60 ft', 'V, S, M', 'Concentration, up to 1 min', 'You attempt to send one creature to another plane of existence.', undefined, 'Charisma');
    add('wall-of-fire', 'Wall of Fire', 4, 'Evocation', '1 action', '120 ft', 'V, S, M', 'Concentration, up to 1 min', 'You create a wall of fire on a solid surface within range.', '5d8 fire', 'Dexterity');

    // Level 5
    add('cone-of-cold', 'Cone of Cold', 5, 'Evocation', '1 action', 'Self (60ft cone)', 'V, S, M', 'Instantaneous', 'A blast of cold air erupts from your hands.', '8d8 cold', 'Constitution');
    add('teleport', 'Teleport', 5, 'Conjuration', '1 action', '10 ft', 'V', 'Instantaneous', 'This spell instantly transports you and up to eight willing creatures to a destination you select.');
    add('greater-restoration', 'Greater Restoration', 5, 'Abjuration', '1 action', 'Touch', 'V, S, M', 'Instantaneous', 'You imbue a creature with positive energy to undo a debilitating effect.');
    add('hold-monster', 'Hold Monster', 5, 'Enchantment', '1 action', '90 ft', 'V, S, M', 'Concentration, up to 1 min', 'Choose a creature that you can see to paralyze them.', undefined, 'Wisdom');
    add('scrying', 'Scrying', 5, 'Divination', '10 minutes', 'Self', 'V, S, M', 'Concentration, up to 10 min', 'You can see and hear a particular creature you choose that is on the same plane.', undefined, 'Wisdom');
    add('wall-of-force', 'Wall of Force', 5, 'Evocation', '1 action', '120 ft', 'V, S, M', 'Concentration, up to 10 min', 'An invisible wall of force springs into existence at a point you choose.');

    // Levels 6-9
    add('chain-lightning', 'Chain Lightning', 6, 'Evocation', '1 action', '150 ft', 'V, S, M', 'Instantaneous', 'You create a bolt of lightning that arcs toward a target and then leaps to others.', '10d8 lightning', 'Dexterity');
    add('sunburst', 'Sunburst', 8, 'Evocation', '1 action', '150 ft', 'V, S, M', 'Instantaneous', 'Brilliant sunlight flashes in a 60-foot radius centered on a point you choose.', '12d6 radiant', 'Constitution');
    add('meteor-swarm', 'Meteor Swarm', 9, 'Evocation', '1 action', '1 mile', 'V, S', 'Instantaneous', 'Blazing orbs of fire plummet to the ground at four different points you can see.', '20d6 fire + 20d6 bludgeoning', 'Dexterity');
    add('wish', 'Wish', 9, 'Conjuration', '1 action', 'Self', 'V', 'Instantaneous', 'Wish is the mightiest spell a mortal creature can cast. By simply speaking aloud, you can alter the very foundations of reality.');
  }
}