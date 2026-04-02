export interface Trap {
  id: string;
  name: string;
  type: 'mechanical' | 'magical' | 'poison' | 'environmental';
  cr: number;
  detectDC: number;
  disarmDC: number;
  damage: string;
  save: string;
  trigger: string;
  description: string;
  effect: string;
  hint: string;
  resetTime: string;
}

export interface Puzzle {
  id: string;
  name: string;
  type: 'riddle' | 'logic' | 'pattern' | 'physical' | 'magical';
  difficulty: string;
  description: string;
  solution: string;
  hints: string[];
  failureConsequence: string;
  reward: string;
  timeLimit?: number;
}

export class TrapSystem {
  private traps = new Map<string, Trap>();
  private puzzles = new Map<string, Puzzle>();

  constructor() {
    this.initializeDefaults();
  }

  // --- Core Trap Methods ---

  public getTrap(id: string): Trap | undefined {
    return this.traps.get(id);
  }

  public detectTrap(id: string, check: number): { detected: boolean; hint: string } {
    const trap = this.getTrap(id);
    if (!trap) throw new Error(`Trap ${id} not found.`);
    const detected = check >= trap.detectDC;
    return { detected, hint: detected ? trap.hint : 'You notice nothing unusual.' };
  }

  public disarmTrap(id: string, check: number): { success: boolean; damage: string } {
    const trap = this.getTrap(id);
    if (!trap) throw new Error(`Trap ${id} not found.`);
    const success = check >= trap.disarmDC;
    return { success, damage: success ? 'None' : trap.damage };
  }

  public triggerTrap(id: string): { damage: string; effect: string; save: string } {
    const trap = this.getTrap(id);
    if (!trap) throw new Error(`Trap ${id} not found.`);
    return { damage: trap.damage, effect: trap.effect, save: trap.save };
  }

  public searchTraps(cr?: number): Trap[] {
    const allTraps = Array.from(this.traps.values());
    return cr !== undefined ? allTraps.filter(t => t.cr === cr) : allTraps;
  }

  public getRandomTrap(cr?: number): Trap | undefined {
    const list = this.searchTraps(cr);
    if (list.length === 0) return undefined;
    return list[Math.floor(Math.random() * list.length)];
  }

  public getTrapStatBlock(id: string): string {
    const t = this.getTrap(id);
    if (!t) return 'Trap not found.';
    return `[${t.name}] (CR ${t.cr} ${t.type} trap)\n` +
           `Detect: DC ${t.detectDC} | Disarm: DC ${t.disarmDC}\n` +
           `Trigger: ${t.trigger}\n` +
           `Effect: ${t.damage} damage (${t.save}). ${t.effect}\n` +
           `Reset: ${t.resetTime}\n` +
           `Description: ${t.description}`;
  }

  public createTrap(data: Trap): Trap {
    this.traps.set(data.id, data);
    return data;
  }

  // --- Core Puzzle Methods ---

  public getPuzzle(id: string): Puzzle | undefined {
    return this.puzzles.get(id);
  }

  public attemptPuzzle(id: string, answer: string): { correct: boolean; hint: string; consequence: string } {
    const puzzle = this.getPuzzle(id);
    if (!puzzle) throw new Error(`Puzzle ${id} not found.`);
    
    const isCorrect = answer.toLowerCase().trim() === puzzle.solution.toLowerCase().trim();
    if (isCorrect) {
      return { correct: true, hint: '', consequence: puzzle.reward };
    } else {
      return { correct: false, hint: puzzle.hints[0] || 'No hints available.', consequence: puzzle.failureConsequence };
    }
  }

  public getPuzzleHint(id: string, hintNumber: number): string {
    const puzzle = this.getPuzzle(id);
    if (!puzzle) return 'Puzzle not found.';
    const index = hintNumber - 1;
    if (index >= 0 && index < puzzle.hints.length) {
      return puzzle.hints[index];
    }
    return 'No further hints available.';
  }

  public searchPuzzles(difficulty?: string): Puzzle[] {
    const allPuzzles = Array.from(this.puzzles.values());
    return difficulty ? allPuzzles.filter(p => p.difficulty.toLowerCase() === difficulty.toLowerCase()) : allPuzzles;
  }

  public getRandomPuzzle(difficulty?: string): Puzzle | undefined {
    const list = this.searchPuzzles(difficulty);
    if (list.length === 0) return undefined;
    return list[Math.floor(Math.random() * list.length)];
  }

  public getPuzzleDescription(id: string): string {
    const p = this.getPuzzle(id);
    if (!p) return 'Puzzle not found.';
    const timeStr = p.timeLimit ? ` | Time Limit: ${p.timeLimit}s` : '';
    return `[${p.name}] (${p.difficulty} ${p.type} puzzle${timeStr})\n` +
           `Description: ${p.description}\n` +
           `Penalty: ${p.failureConsequence}\n` +
           `Reward: ${p.reward}`;
  }

  public createPuzzle(data: Puzzle): Puzzle {
    this.puzzles.set(data.id, data);
    return data;
  }

  // --- Serialization ---

  public serialize(): string {
    return JSON.stringify({
      traps: Array.from(this.traps.values()),
      puzzles: Array.from(this.puzzles.values())
    });
  }

  public deserialize(data: string): void {
    try {
      const parsed = JSON.parse(data);
      this.traps.clear();
      this.puzzles.clear();
      if (parsed.traps) parsed.traps.forEach((t: Trap) => this.traps.set(t.id, t));
      if (parsed.puzzles) parsed.puzzles.forEach((p: Puzzle) => this.puzzles.set(p.id, p));
    } catch (e) {
      throw new Error('Failed to deserialize trap system data.');
    }
  }

  // --- Pre-population ---

  private initializeDefaults(): void {
    const defaultTraps: Trap[] = [
      { id: 't1', name: 'Poison Needle', type: 'mechanical', cr: 0, detectDC: 12, disarmDC: 12, damage: '1d4 piercing', save: 'DC 10 Con', trigger: 'Opening lock', description: 'A tiny needle springs from the lock.', effect: 'Poisoned for 1 hour', hint: 'Tiny hole near keyhole.', resetTime: 'Manual' },
      { id: 't2', name: 'Swinging Blade', type: 'mechanical', cr: 1, detectDC: 13, disarmDC: 13, damage: '2d10 slashing', save: 'DC 13 Dex', trigger: 'Pressure plate', description: 'A scythe sweeps across the hall.', effect: 'Bleeding (1d4/turn)', hint: 'Grooves in the walls.', resetTime: '1 minute' },
      { id: 't3', name: 'Fire Glyph', type: 'magical', cr: 3, detectDC: 15, disarmDC: 15, damage: '4d6 fire', save: 'DC 14 Dex', trigger: 'Stepping on rune', description: 'Explosion of magical fire.', effect: 'Ignites flammables', hint: 'Faint glowing rune on floor.', resetTime: 'None' },
      { id: 't4', name: 'Pit Trap', type: 'mechanical', cr: 1, detectDC: 10, disarmDC: 12, damage: '2d6 bludgeoning', save: 'DC 12 Dex', trigger: 'Stepping on cover', description: 'Floor gives way to a 20ft drop.', effect: 'Prone', hint: 'Loose floorboards.', resetTime: 'Manual' },
      { id: 't5', name: 'Acid Spray', type: 'mechanical', cr: 2, detectDC: 14, disarmDC: 14, damage: '3d6 acid', save: 'DC 13 Dex', trigger: 'Opening door', description: 'Acid sprays from the ceiling.', effect: 'Corrodes non-magical metal', hint: 'Acid burns on the floor.', resetTime: '1 hour' },
      { id: 't6', name: 'Sleep Gas', type: 'poison', cr: 2, detectDC: 13, disarmDC: 15, damage: '0', save: 'DC 13 Con', trigger: 'Stepping on rug', description: 'Vents release a sweet-smelling gas.', effect: 'Unconscious for 1 hour', hint: 'Faint hissing sound.', resetTime: '10 minutes' },
      { id: 't7', name: 'Lightning Bolt Tile', type: 'magical', cr: 5, detectDC: 16, disarmDC: 16, damage: '8d6 lightning', save: 'DC 15 Dex', trigger: 'Stepping on tile', description: 'Lightning arcs through the corridor.', effect: 'Stunned 1 round', hint: 'Smell of ozone.', resetTime: '1 minute' },
      { id: 't8', name: 'Crushing Ceiling', type: 'mechanical', cr: 4, detectDC: 15, disarmDC: 16, damage: '4d10 bludgeoning', save: 'DC 14 Dex', trigger: 'Grabbing idol', description: 'Ceiling rapidly descends.', effect: 'Restrained', hint: 'Scrape marks on walls.', resetTime: 'Manual' },
      { id: 't9', name: 'Teleportation Circle', type: 'magical', cr: 7, detectDC: 17, disarmDC: 18, damage: '0', save: 'DC 16 Cha', trigger: 'Entering circle', description: 'Teleports victim to a dungeon