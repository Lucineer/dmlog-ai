export interface Encounter {
  id: string;
  name: string;
  type: 'combat' | 'social' | 'exploration' | 'trap' | 'event' | 'mystery';
  cr: number;
  description: string;
  monsters?: string[];
  loot?: string[];
  xp: number;
  reaction: string;
  followUp?: string;
}

export interface EncounterTable {
  id: string;
  name: string;
  terrain: string;
  levelRange: { min: number; max: number };
  encounters: Encounter[];
  description: string;
}

export class RandomEncounters {
  private tables = new Map<string, EncounterTable>();

  constructor() {
    this.initializeDefaultTables();
  }

  // 1. Roll an encounter based on terrain and level
  public rollEncounter(terrain: string, level: number): Encounter | null {
    const validTables = Array.from(this.tables.values()).filter(
      (t) => t.terrain.toLowerCase() === terrain.toLowerCase() && level >= t.levelRange.min && level <= t.levelRange.max
    );
    if (validTables.length === 0) return null;
    const selectedTable = validTables[Math.floor(Math.random() * validTables.length)];
    return this.rollOnTable(selectedTable.id);
  }

  // 2. Get a table by terrain (returns the first match)
  public getTable(terrain: string): EncounterTable | undefined {
    return Array.from(this.tables.values()).find((t) => t.terrain.toLowerCase() === terrain.toLowerCase());
  }

  // 3. Get all tables
  public getAllTables(): EncounterTable[] {
    return Array.from(this.tables.values());
  }

  // 4. Add an encounter to a specific table
  public addEncounter(tableId: string, encounter: Encounter): void {
    const table = this.tables.get(tableId);
    if (table) table.encounters.push(encounter);
  }

  // 5. Get encounters by type within a table
  public getEncountersByType(tableId: string, type: Encounter['type']): Encounter[] {
    return this.tables.get(tableId)?.encounters.filter((e) => e.type === type) || [];
  }

  // 6. Get encounters by CR within a table
  public getEncountersByCR(tableId: string, cr: number): Encounter[] {
    return this.tables.get(tableId)?.encounters.filter((e) => e.cr === cr) || [];
  }

  // 7. Roll on a specific table
  public rollOnTable(tableId: string): Encounter | null {
    const table = this.tables.get(tableId);
    if (!table || table.encounters.length === 0) return null;
    return table.encounters[Math.floor(Math.random() * table.encounters.length)];
  }

  // 8. Create a custom table
  public createCustomTable(name: string, terrain: string, levelRange: { min: number; max: number }): EncounterTable {
    const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
    const newTable: EncounterTable = {
      id,
      name,
      terrain,
      levelRange,
      encounters: [],
      description: `Custom encounter table for ${terrain}`,
    };
    this.tables.set(id, newTable);
    return newTable;
  }

  // 9. Get narrative description of an encounter
  public getEncounterDetails(id: string): string {
    const enc = this.findEncounterById(id);
    return enc ? `${enc.name}: ${enc.description}` : 'Encounter not found.';
  }

  // 10. Get loot for an encounter
  public getLootForEncounter(id: string): string[] {
    return this.findEncounterById(id)?.loot || [];
  }

  // 11. Get XP award for an encounter
  public getXPAward(id: string): number {
    return this.findEncounterById(id)?.xp || 0;
  }

  // 12. Calculate encounter difficulty
  public getEncounterDifficulty(encounter: Encounter, partyLevel: number): 'easy' | 'medium' | 'hard' | 'deadly' {
    const diff = encounter.cr - partyLevel;
    if (diff <= -2) return 'easy';
    if (diff <= 0) return 'medium';
    if (diff <= 2) return 'hard';
    return 'deadly';
  }

  // 13. Get daily encounter count based on terrain danger
  public getDailyEncounterCount(terrain: string): number {
    const t = terrain.toLowerCase();
    if (['underdark', 'dungeon'].includes(t)) return Math.floor(Math.random() * 3) + 3; // 3-5 encounters
    if (['city', 'forest', 'coast'].includes(t)) return Math.floor(Math.random() * 2) + 1; // 1-2 encounters
    return Math.floor(Math.random() * 3) + 1; // 1-3 encounters for others
  }

  // 14. Generate a full day of encounters
  public generateDayOfEncounters(terrain: string, partyLevel: number, travelHours: number): Encounter[] {
    const baseCount = this.getDailyEncounterCount(terrain);
    const actualCount = Math.max(0, Math.round(baseCount * (travelHours / 24)));
    const encounters: Encounter[] = [];
    
    for (let i = 0; i < actualCount; i++) {
      const enc = this.rollEncounter(terrain, partyLevel);
      if (enc) encounters.push(enc);
    }
    return encounters;
  }

  // 15. Serialize and Deserialize
  public serialize(): string {
    return JSON.stringify(Array.from(this.tables.entries()));
  }

  public deserialize(data: string): void {
    try {
      const parsed = JSON.parse(data);
      this.tables = new Map(parsed);
    } catch (e) {
      console.error('Failed to deserialize encounter tables', e);
    }
  }

  // Helper to find an encounter across all tables
  private findEncounterById(id: string): Encounter | undefined {
    for (const table of this.tables.values()) {
      const enc = table.encounters.find((e) => e.id === id);
      if (enc) return enc;
    }
    return undefined;
  }

  // Pre-populate 8 terrain tables with 6 encounters each
  private initializeDefaultTables(): void {
    const defaults: EncounterTable[] = [
      {
        id: 'tbl_forest_1', name: 'Forest Encounters', terrain: 'Forest', levelRange: { min: 1, max: 20 }, description: 'Woodland encounters',
        encounters: [
          { id: 'f1', name: 'Wolf Pack', type: 'combat', cr: 2, description: 'A pack of hungry wolves surrounds the party.', xp: 100, reaction: 'hostile', monsters: ['Wolf', 'Dire Wolf'], loot: ['Wolf Pelt'] },
          { id: 'f2', name: 'Lost Traveler', type: 'social', cr: 0, description: 'A merchant who lost their way in the thicket.', xp: 25, reaction: 'friendly', followUp: 'Escort quest to nearby town' },
          { id: 'f3', name: 'Fairy Ring', type: 'mystery', cr: 1, description: 'A circle of glowing mushrooms humming with fey magic.', xp: 50, reaction: 'neutral', loot: ['Fey Dust'] },
          { id: 'f4', name: 'Bandit Ambush', type: 'combat', cr: 3, description: 'Bandits drop from the trees demanding a toll.', xp: 150, reaction: 'hostile', monsters: ['Bandit', 'Bandit Captain'], loot: ['Stolen Gold', 'Shortsword'] },
          { id: 'f5', name: 'Ancient Tree Spirit', type: 'event', cr: 5, description: 'An ancient treant awakens to judge the party.', xp: 300, reaction: 'cautious' },
          { id: 'f6', name: 'Mushroom Circle', type: 'exploration', cr: 0, description: 'A patch of rare, giant edible mushrooms.', xp: 10, reaction: 'neutral', loot: ['Rations'] }
        ]
      },
      {
        id: 'tbl_desert_1', name: 'Desert Encounters', terrain: 'Desert', levelRange: { min: 1, max: 20 }, description: 'Arid wasteland encounters',
        encounters: [
          { id: 'd1', name: 'Sand Storm', type: 'event', cr: 2, description: 'A blinding wall of sand approaches rapidly.', xp: 50, reaction: 'neutral' },
          { id: 'd2', name: 'Giant Scorpion', type: 'combat', cr: 3, description: 'A massive scorpion erupts from beneath the dunes.', xp: 700, reaction: 'hostile', monsters: ['Giant Scorpion'], loot: ['Scorpion Venom'] },
          { id: 'd3', name: 'Mirage Oasis', type: 'exploration', cr: 0, description: 'Shimmering water that vanishes upon approach.', xp: 10, reaction: 'neutral' },
          { id: 'd4', name: 'Buried Treasure', type: 'exploration', cr: 1, description: 'The tip of a gilded chest pokes through the sand.', xp: 50, reaction: 'neutral', loot: ['Gold Coins', 'Gemstone'] },
          { id: 'd5', name: 'Dust Devil', type: 'event', cr: 1, description: 'A localized whirlwind scatters the party\'s gear.', xp: 25, reaction: 'neutral' },
          { id: 'd6', name: 'Nomad Traders', type: 'social', cr: 0, description: 'A caravan of camel-riding merchants offers exotic goods.', xp: 50, reaction: 'friendly', loot: ['Spices', 'Silks'] }
        ]
      },
      {
        id: 'tbl_mountain_1', name: 'Mountain Encounters', terrain: 'Mountain', levelRange: { min: 1, max: 20 }, description: 'High altitude encounters',
        encounters: [
          { id: 'm1', name: 'Rockslide', type: 'trap', cr: 3, description: 'Boulders tumble down the sheer cliff face.', xp: 100, reaction: 'neutral' },
          { id: 'm2', name: 'Giant Eagle Nest', type: 'exploration', cr: 2, description: 'A massive nest perched on a precarious ledge.', xp: 50, reaction: 'cautious', loot: ['Giant Eagle Feather'] },
          { id: 'm3', name: 'Dwarven Patrol', type: 'social', cr: 3, description: 'Heavily armored dwarves guarding a mountain pass.', xp: 150, reaction: 'cautious', followUp: 'Invitation to dwarven hold' },
          { id: 'm4', name: 'Cliff Troll', type: 'combat', cr: 5, description: 'A troll ambushes the party on a narrow bridge.', xp: 1800, reaction: 'hostile', monsters: ['Troll'], loot: ['Troll Blood'] },
          { id: 'm5', name: 'Avalanche Warning', type: 'event', cr: 4, description: 'The snowpack groans, threatening to give way.', xp: 200, reaction: 'neutral' },
          { id: 'm6', name: 'Dragon Sighting', type: 'mystery', cr: 10, description: 'A massive winged shadow passes over the sun.', xp: 500, reaction: 'neutral' }
        ]
      },
      {
        id: 'tbl_swamp_1', name: 'Swamp Encounters', terrain: 'Swamp', levelRange: { min: 1, max: 20 }, description: 'Marsh and bog encounters',
        encounters: [
          { id: 's1', name: 'Will-o-Wisp', type: 'mystery', cr: 2, description: 'Bobbing lights attempt to lead the party astray.', xp: 450, reaction: 'hostile', monsters: ['Will-o-Wisp'] },
          { id: 's2', name: 'Bog Monster', type: 'combat', cr: 4, description: 'A mound of rotting vegetation rises from the muck.', xp: 1100, reaction: 'hostile', monsters: ['Shambling Mound'] },
          { id: 's3', name: 'Witch Hut', type: 'social', cr: 3, description: 'A rickety shack on stilts, smelling of strange brews.', xp: 200, reaction: 'neutral', loot: ['Healing Potion'] },
          { id: 's4', name: 'Sinking Mud', type: 'trap', cr: 1, description: 'The ground gives way to deep, suffocating quicksand.', xp: 50, reaction: 'neutral' },
          { id: 's5', name: 'Alligator', type: 'combat', cr: 1, description: 'A large reptile snaps its jaws from the shallows.', xp: 100, reaction: 'hostile', monsters: ['Crocodile'], loot: ['Reptile Leather'] },
          { id: 's6', name: 'Ghost Ship', type: 'exploration', cr: 4, description: 'The rotting hull of a ship stranded in the deep swamp.', xp: 300, reaction: 'neutral', loot: ['Waterlogged Chest'] }
        ]
      },
      {
        id: 'tbl_d