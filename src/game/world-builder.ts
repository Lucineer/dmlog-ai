// src/game/world-builder.ts

export interface Region {
  id: string;
  name: string;
  type: 'forest' | 'mountain' | 'desert' | 'swamp' | 'plains' | 'coast' | 'tundra' | 'volcanic' | 'underground' | 'urban';
  level: number;
  danger: number;
  description: string;
  connections: string[];
  poi: PointOfInterest[];
  encounters: string[];
  resources: string[];
  weather: string;
  population: number;
}

export interface PointOfInterest {
  id: string;
  name: string;
  type: 'town' | 'dungeon' | 'temple' | 'ruins' | 'cave' | 'fortress' | 'camp' | 'landmark';
  description: string;
  level: number;
  secrets: string[];
  npcs: string[];
}

export interface WorldMap {
  id: string;
  name: string;
  seed: number;
  regions: Region[];
  factions: Faction[];
  history: string[];
  currentDay: number;
}

export interface Faction {
  id: string;
  name: string;
  alignment: string;
  territory: string[];
  relations: Map<string, string>;
  power: number;
  leader: string;
  goals: string[];
}

// Simple Seeded PRNG
class PRNG {
  constructor(private seed: number) {}
  next(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
  range(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  choice<T>(arr: T[]): T {
    return arr[this.range(0, arr.length - 1)];
  }
}

const REGION_TYPES: Region['type'][] = ['forest', 'mountain', 'desert', 'swamp', 'plains', 'coast', 'tundra', 'volcanic', 'underground', 'urban'];
const WEATHERS = ['Clear', 'Overcast', 'Raining', 'Storming', 'Foggy', 'Windy', 'Snowing'];

const NAME_PARTS: Record<string, { adj: string[], noun: string[] }> = {
  forest: { adj: ['Whispering', 'Emerald', 'Dark', 'Ancient', 'Silent'], noun: ['Woods', 'Thicket', 'Grove', 'Wilds', 'Canopy'] },
  mountain: { adj: ['Shattered', 'Iron', 'Cloud-piercing', 'Frozen', 'Jagged'], noun: ['Peaks', 'Spire', 'Crags', 'Ridge', 'Summit'] },
  desert: { adj: ['Scorched', 'Endless', 'Golden', 'Crimson', 'Shifting'], noun: ['Sands', 'Dunes', 'Wastes', 'Expanse', 'Basin'] },
  swamp: { adj: ['Fetid', 'Murky', 'Sunken', 'Poisoned', 'Tangled'], noun: ['Mire', 'Bog', 'Marsh', 'Slough', 'Fen'] },
  plains: { adj: ['Windswept', 'Endless', 'Verdant', 'Rolling', 'Golden'], noun: ['Steppe', 'Fields', 'Meadows', 'Plains', 'Prairie'] },
  coast: { adj: ['Stormy', 'Azure', 'Crashing', 'Salt-kissed', 'Jagged'], noun: ['Shores', 'Cliffs', 'Bay', 'Cove', 'Strand'] },
  tundra: { adj: ['Howling', 'Bleak', 'Frostbitten', 'Pale', 'Barren'], noun: ['Wastes', 'Tundra', 'Icefield', 'Drifts', 'Reach'] },
  volcanic: { adj: ['Burning', 'Ashen', 'Molten', 'Obsidian', 'Smoldering'], noun: ['Caldera', 'Peaks', 'Fields', 'Fissures', 'Crater'] },
  underground: { adj: ['Echoing', 'Gleaming', 'Shadowy', 'Deep', 'Hollow'], noun: ['Caverns', 'Deeps', 'Grotto', 'Abyss', 'Tunnels'] },
  urban: { adj: ['Bustling', 'Ruined', 'Grand', 'Decaying', 'Gilded'], noun: ['City', 'Metropolis', 'Sprawl', 'Citadel', 'Slums'] }
};

export class WorldBuilder {
  private worlds = new Map<string, WorldMap>();

  // 1. generateWorld
  generateWorld(name: string, seed: number, size: number): WorldMap {
    const prng = new PRNG(seed);
    const worldId = `world_${Date.now()}_${prng.range(1000, 9999)}`;
    
    const world: WorldMap = {
      id: worldId,
      name,
      seed,
      regions: [],
      factions: [],
      history: [`The world of ${name} was formed.`],
      currentDay: 1
    };

    // Generate Regions
    for (let i = 0; i < size; i++) {
      const type = prng.choice(REGION_TYPES);
      const parts = NAME_PARTS[type] || NAME_PARTS['plains'];
      const regionName = `The ${prng.choice(parts.adj)} ${prng.choice(parts.noun)}`;
      const level = Math.floor(i / 3) + 1;

      const region: Region = {
        id: `reg_${i}`,
        name: regionName,
        type,
        level,
        danger: Math.max(1, level + prng.range(-1, 1)),
        description: `A ${type} region known as ${regionName}.`,
        connections: [],
        poi: [],
        encounters: ['Bandits', 'Wild Beasts', 'Undead', 'Elementals'],
        resources: ['Wood', 'Stone', 'Herbs', 'Ore'].filter(() => prng.next() > 0.5),
        weather: prng.choice(WEATHERS),
        population: prng.range(0, 10000)
      };
      world.regions.push(region);
    }

    // Connect Regions (Ensure connected graph + random edges)
    for (let i = 1; i < size; i++) {
      this.connectRegionsInternal(world, `reg_${i}`, `reg_${i - 1}`);
      if (i > 2 && prng.next() > 0.6) {
        this.connectRegionsInternal(world, `reg_${i}`, `reg_${prng.range(0, i - 2)}`);
      }
    }

    // Add Factions
    const alignments = ['Lawful Good', 'Chaotic Neutral', 'Lawful Evil', 'True Neutral'];
    for (let i = 0; i < 3; i++) {
      world.factions.push({
        id: `fac_${i}`,
        name: `Faction ${i + 1}`,
        alignment: prng.choice(alignments),
        territory: [prng.choice(world.regions).id],
        relations: new Map(),
        power: prng.range(10, 100),
        leader: `Leader ${i + 1}`,
        goals: ['Expand territory', 'Gather wealth']
      });
    }

    this.worlds.set(worldId, world);
    return world;
  }

  // 2. addRegion
  addRegion(worldId: string, region: Region): void {
    const world = this.getWorldMap(worldId);
    if (world.regions.some(r => r.id === region.id)) throw new Error('Region ID exists');
    world.regions.push(region);
  }

  // 3. connectRegions
  connectRegions(worldId: string, id1: string, id2: string): void {
    const world = this.getWorldMap(worldId);
    this.connectRegionsInternal(world, id1, id2);
  }

  private connectRegionsInternal(world: WorldMap, id1: string, id2: string) {
    const r1 = world.regions.find(r => r.id === id1);
    const r2 = world.regions.find(r => r.id === id2);
    if (r1 && r2) {
      if (!r1.connections.includes(id2)) r1.connections.push(id2);
      if (!r2.connections.includes(id1)) r2.connections.push(id1);
    }
  }

  // 4. addPOI
  addPOI(worldId: string, regionId: string, poi: PointOfInterest): void {
    const region = this.getRegion(worldId, regionId);
    region.poi.push(poi);
  }

  // 5. addFaction
  addFaction(worldId: string, faction: Faction): void {
    const world = this.getWorldMap(worldId);
    world.factions.push(faction);
  }

  // 6. getRegion
  getRegion(worldId: string, regionId: string): Region {
    const world = this.getWorldMap(worldId);
    const region = world.regions.find(r => r.id === regionId);
    if (!region) throw new Error(`Region ${regionId} not found`);
    return region;
  }

  // 7. getPath - BFS
  getPath(worldId: string, from: string, to: string): string[] {
    const world = this.getWorldMap(worldId);
    const queue: string[][] = [[from]];
    const visited = new Set<string>([from]);

    while (queue.length > 0) {
      const path = queue.shift()!;
      const current = path[path.length - 1];

      if (current === to) return path;

      const region = world.regions.find(r => r.id === current);
      if (!region) continue;

      for (const neighbor of region.connections) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push([...path, neighbor]);
        }
      }
    }
    return [];
  }

  // 8. getAdjacentRegions
  getAdjacentRegions(worldId: string, regionId: string): Region[] {
    const region = this.getRegion(worldId, regionId);
    return region.connections.map(id => this.getRegion(worldId, id));
  }

  // 9. getRegionByLevel
  getRegionByLevel(worldId: string, level: number): Region[] {
    return this.getWorldMap(worldId).regions.filter(r => r.level === level);
  }

  // 10. getRegionByType
  getRegionByType(worldId: string, type: Region['type']): Region[] {
    return this.getWorldMap(worldId).regions.filter(r => r.type === type);
  }

  // 11. generateEncounter
  generateEncounter(worldId: string, regionId: string, partyLevel: number): string {
    const region = this.getRegion(worldId, regionId);
    const diff = region.danger - partyLevel;
    let severity = 'moderate';
    if (diff >= 2) severity = 'deadly';
    else if (diff <= -2) severity = 'trivial';

    const type = region.encounters[Math.floor(Math.random() * region.encounters.length)] || 'unknown entities';
    return `A ${severity} encounter with ${type} in ${region.name}. Weather conditions: ${region.weather}.`;
  }

  // 12. advanceDay
  advanceDay(worldId: string): void {
    const world = this.getWorldMap(worldId);
    world.currentDay++;
    
    for (const faction of world.factions) {
      const change = Math.floor(Math.random() * 5) - 2;
      faction.power = Math.max(0, faction.power + change);
    }

    for (const region of world.regions) {
      if (Math.random() > 0.7) {
        region.weather = WEATHERS[Math.floor(Math.random() * WEATHERS.length)];
      }
    }
    world.history.push(`Day ${world.currentDay} dawned.`);
  }

  // 13. getWorldDescription
  getWorldDescription(worldId: string): string {
    const world = this.getWorldMap(worldId);
    return `World: ${world.name} (Day ${world.currentDay})\n` +
           `Regions: ${world.regions.length}\n` +
           `Factions: ${world.factions.map(f => `${f.name} (Power: ${f.power})`).join(', ')}`;
  }

  // 14. getRegionDescription
  getRegionDescription(worldId: string, regionId: string): string {
    const region = this.getRegion(worldId, regionId);
    const pois = region.poi.map(p => p.name).join(', ') || 'None';
    const conns = region.connections.map(c => this.getRegion(worldId, c).name).join(', ');
    return `${region.name} [Level ${region.level} ${region.type}]\n` +
           `Danger: ${region.danger} | Weather: ${region.weather}\n` +
           `Description: ${region.description}\n` +
           `POIs: ${pois}\n` +
           `Connections: ${conns}`;
  }

  // 15. getFactionRelations
  getFactionRelations(worldId: string, factionId: string): Map<string, string> {
    const world = this.getWorldMap(worldId);
    const faction = world.factions.find(f => f.id === factionId);
    if (!faction) throw new Error(`Faction ${factionId} not found`);
    return faction.relations;
  }

  // 16. getTravelDescription
  getTravelDescription(worldId: string, from: string, to: string): string {
    const path = this.getPath(worldId, from, to);
    if (path.length === 0) return `No known route exists between these regions.`;
    if (path.length === 1) return `You are already in ${this.getRegion(worldId, from).name}.`;

    const names = path.map(id => this.getRegion(worldId, id).name);
    const days = path.length - 1;
    return `Journey from ${names[0]} to ${names[names.length - 1]}:\n` +
           `Route: ${names.join(' -> ')}\n` +
           `Estimated travel time: ${days} day(s).`;
  }

  // 17. getWorldMap
  getWorldMap(worldId: string): WorldMap {
    const world = this.worlds.get(worldId);
    if (!world) throw new Error(`World ${worldId} not found`);
    return world;
  }

  // 18. serialize / deserialize
  serialize(): string {
    const data = Array.from(this.worlds.entries()).map(([id, world]) => {
      const serializedWorld = {
        ...world,
        factions: world.factions.map(f => ({
          ...f,
          relations: Array.from(f.relations.entries())
        }))
      };
      return [id, serializedWorld];
    });
    return JSON.stringify(data);
  }

  deserialize(json: string): void {
    const data = JSON.parse(json);
    this.worlds.clear();
    for (const [id, worldData] of data) {
      const world: WorldMap = {
        ...worldData,
        factions: worldData.factions.map((f: any) => ({
          ...f,
          relations: new Map(f.relations)
        }))
      };
      this.worlds.set(id, world);
    }
  }
}