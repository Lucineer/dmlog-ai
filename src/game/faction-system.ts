export type Alignment = 
  | 'lawful-good' | 'neutral-good' | 'chaotic-good' 
  | 'lawful-neutral' | 'true-neutral' | 'chaotic-neutral' 
  | 'lawful-evil' | 'neutral-evil' | 'chaotic-evil';

export interface Faction {
  id: string;
  name: string;
  alignment: Alignment;
  leader: string;
  headquarters: string;
  territory: string[];
  members: number;
  power: number;
  resources: { gold: number; military: number; influence: number };
  allies: string[];
  enemies: string[];
  goals: string[];
  laws: string[];
  secrets: string[];
}

export interface FactionEvent {
  id: string;
  type: 'war' | 'treaty' | 'trade' | 'betrayal' | 'alliance' | 'coup' | 'crisis';
  factionId: string;
  targetFactionId?: string;
  description: string;
  date: number;
  effects: string[];
}

export class FactionSystem {
  private factions = new Map<string, Faction>();
  private events: FactionEvent[] = [];
  private reputation = new Map<string, Map<string, number>>(); // factionId -> (playerId -> reputation)

  constructor() {
    this.initializeDefaultFactions();
  }

  // --- 1-3. CRUD Operations ---

  public createFaction(data: Partial<Faction> & { name: string; alignment: Alignment }): Faction {
    const id = data.id || `faction-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const faction: Faction = {
      id,
      name: data.name,
      alignment: data.alignment,
      leader: data.leader || 'Unknown Leader',
      headquarters: data.headquarters || 'Unknown Location',
      territory: data.territory || [],
      members: data.members || 100,
      power: data.power || 50,
      resources: data.resources || { gold: 1000, military: 500, influence: 50 },
      allies: data.allies || [],
      enemies: data.enemies || [],
      goals: data.goals || [],
      laws: data.laws || [],
      secrets: data.secrets || []
    };
    this.factions.set(id, faction);
    return faction;
  }

  public getFaction(id: string): Faction {
    const faction = this.factions.get(id);
    if (!faction) throw new Error(`Faction with ID ${id} not found.`);
    return faction;
  }

  public updateFaction(id: string, data: Partial<Faction>): Faction {
    const faction = this.getFaction(id);
    const updated = { ...faction, ...data, resources: { ...faction.resources, ...data.resources } };
    this.factions.set(id, updated);
    return updated;
  }

  // --- 4-6. Search & Ranking ---

  public searchFactions(query: string): Faction[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.factions.values()).filter(f => 
      f.name.toLowerCase().includes(lowerQuery) || 
      f.leader.toLowerCase().includes(lowerQuery) ||
      f.headquarters.toLowerCase().includes(lowerQuery)
    );
  }

  public getFactionsByAlignment(alignment: Alignment): Faction[] {
    return Array.from(this.factions.values()).filter(f => f.alignment === alignment);
  }

  public getPowerRanking(): Faction[] {
    return Array.from(this.factions.values()).sort((a, b) => b.power - a.power);
  }

  // --- 7-8. Relationships ---

  public addAlly(factionId: string, allyId: string): void {
    const f1 = this.getFaction(factionId);
    const f2 = this.getFaction(allyId);
    
    if (!f1.allies.includes(allyId)) f1.allies.push(allyId);
    if (!f2.allies.includes(factionId)) f2.allies.push(factionId);
    
    f1.enemies = f1.enemies.filter(id => id !== allyId);
    f2.enemies = f2.enemies.filter(id => id !== factionId);
  }

  public addEnemy(factionId: string, enemyId: string): void {
    const f1 = this.getFaction(factionId);
    const f2 = this.getFaction(enemyId);
    
    if (!f1.enemies.includes(enemyId)) f1.enemies.push(enemyId);
    if (!f2.enemies.includes(factionId)) f2.enemies.push(factionId);
    
    f1.allies = f1.allies.filter(id => id !== enemyId);
    f2.allies = f2.allies.filter(id => id !== factionId);
  }

  // --- 9-12. Diplomacy & Events ---

  private createEvent(type: FactionEvent['type'], factionId: string, targetId: string | undefined, description: string, effects: string[]): FactionEvent {
    const event: FactionEvent = {
      id: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type, factionId, targetFactionId: targetId, description, date: Date.now(), effects
    };
    this.events.push(event);
    return event;
  }

  public declareWar(factionId: string, targetId: string): FactionEvent {
    this.addEnemy(factionId, targetId);
    const f1 = this.getFaction(factionId);
    const f2 = this.getFaction(targetId);
    return this.createEvent('war', factionId, targetId, 
      `${f1.name} has declared war on ${f2.name}!`, 
      [`${f1.name} and ${f2.name} are now enemies.`, `Trade between territories halted.`]
    );
  }

  public proposeTreaty(factionId: string, targetId: string): FactionEvent {
    this.addAlly(factionId, targetId);
    const f1 = this.getFaction(factionId);
    const f2 = this.getFaction(targetId);
    return this.createEvent('treaty', factionId, targetId, 
      `${f1.name} and ${f2.name} have signed a peace treaty.`, 
      [`${f1.name} and ${f2.name} are now allies.`, `Hostilities ceased.`]
    );
  }

  public tradeAgreement(factionId: string, targetId: string): FactionEvent {
    const f1 = this.getFaction(factionId);
    const f2 = this.getFaction(targetId);
    f1.resources.gold += 500;
    f2.resources.gold += 500;
    return this.createEvent('trade', factionId, targetId, 
      `${f1.name} and ${f2.name} established a lucrative trade route.`, 
      [`Both factions gained 500 gold.`, `Economic ties strengthened.`]
    );
  }

  public betray(factionId: string, targetId: string): FactionEvent {
    this.addEnemy(factionId, targetId);
    const f1 = this.getFaction(factionId);
    const f2 = this.getFaction(targetId);
    f2.power = Math.max(0, f2.power - 10);
    f2.resources.influence = Math.max(0, f2.resources.influence - 20);
    return this.createEvent('betrayal', factionId, targetId, 
      `${f1.name} has brutally betrayed ${f2.name}!`, 
      [`${f2.name} lost 10 power and 20 influence.`, `Alliance broken.`]
    );
  }

  // --- 13-15. Reputation ---

  public getReputation(factionId: string, playerId: string): number {
    if (!this.reputation.has(factionId)) return 0;
    return this.reputation.get(factionId)!.get(playerId) || 0;
  }

  public changeReputation(factionId: string, playerId: string, amount: number, reason: string): void {
    if (!this.reputation.has(factionId)) {
      this.reputation.set(factionId, new Map<string, number>());
    }
    const current = this.getReputation(factionId, playerId);
    this.reputation.get(factionId)!.set(playerId, current + amount);
    // Reason is acknowledged but not stored in this lightweight implementation
  }

  public getRank(factionId: string, playerId: string): string {
    const rep = this.getReputation(factionId, playerId);
    if (rep <= -3000) return 'Hated';
    if (rep <= -1000) return 'Hostile';
    if (rep < 0) return 'Unfriendly';
    if (rep < 1000) return 'Neutral';
    if (rep < 3000) return 'Friendly';
    if (rep < 5000) return 'Honored';
    return 'Exalted';
  }

  // --- 16-19. World State & Simulation ---

  public getFactionEvents(factionId: string): FactionEvent[] {
    return this.events.filter(e => e.factionId === factionId || e.targetFactionId === factionId);
  }

  public getWorldPolitics(): string {
    const ranked = this.getPowerRanking();
    const topPowers = ranked.slice(0, 3).map(f => f.name).join(', ');
    const wars = this.events.filter(e => e.type === 'war').slice(-5);
    
    let report = `=== WORLD POLITICS ===\n`;
    report += `Dominant Powers: ${topPowers}\n\n`;
    report += `Recent Conflicts:\n`;
    wars.forEach(w => report += `- ${w.description}\n`);
    if (wars.length === 0) report += `- The realm is relatively peaceful.\n`;
    
    return report;
  }

  public getFactionDescription(id: string): string {
    const f = this.getFaction(id);
    return `${f.name} is a ${f.alignment} faction led by ${f.leader}, operating out of ${f.headquarters}. ` +
           `They command ${f.members} members with a power rating of ${f.power}. ` +
           `Known for: ${f.goals.join(', ')}.`;
  }

  public simulateConflict(id1: string, id2: string): { winner: string; losses: Record<string, number> } {
    const f1 = this.getFaction(id1);
    const f2 = this.getFaction(id2);

    const score1 = (f1.power * 0.6) + (f1.resources.military * 0.1) + (Math.random() * 50);
    const score2 = (f2.power * 0.6) + (f2.resources.military * 0.1) + (Math.random() * 50);

    const winner = score1 > score2 ? f1 : f2;
    const loser = score1 > score2 ? f2 : f1;

    const winnerLoss = Math.floor(Math.random() * 10) + 5;
    const loserLoss = Math.floor(Math.random() * 25) + 15;

    winner.resources.military = Math.max(0, winner.resources.military - winnerLoss * 10);
    loser.resources.military = Math.max(0, loser.resources.military - loserLoss * 10);
    loser.power = Math.max(0, loser.power - Math.floor(loserLoss / 2));

    this.createEvent('crisis', winner.id, loser.id, 
      `${winner.name} defeated ${loser.name} in a major skirmish.`, 
      [`${loser.name} suffered heavy military losses.`]
    );

    return {
      winner: winner.id,
      losses: { [winner.id]: winnerLoss, [loser.id]: loserLoss }
    };
  }

  // --- 20. Serialization ---

  public serialize(): string {
    const data = {
      factions: Array.from(this.factions.entries()),
      events: this.events,
      reputation: Array.from(this.reputation.entries()).map(([fId, pMap]) => [fId, Array.from(pMap.entries())])
    };
    return JSON.stringify(data);
  }

  public deserialize(json: string): void {
    const data = JSON.parse(json);
    this.factions = new Map(data.factions);
    this.events = data.events;
    this.reputation = new Map(
      data.reputation.map(([fId, pArr]: [string, any]) => [fId, new Map(pArr)])
    );
  }

  // --- Pre-population ---

  private initializeDefaultFactions(): void {
    this.createFaction({
      id: 'iron-covenant', name: 'The Iron Covenant', alignment: 'lawful-good',
      leader: 'High Paladin Kael', headquarters: 'Citadel of Light',
      territory: ['The Sunlit Plains', 'Silver Peak'], members: 5000, power: 85,
      resources: { gold: 15000, military: 8000, influence: 90 },
      goals: ['Eradicate evil', 'Protect the innocent'], laws: ['No dark magic', 'Defend the weak'], secrets: ['The High Paladin is cursed']
    });

    this.createFaction({
      id: 'shadow-syndicate', name: 'The Shadow Syndicate', alignment: 'chaotic-evil',
      leader: 'The Whisperer', headquarters: 'The Undercity',
      territory: ['Rogue\'s Quarter', 'The Black Docks'], members: 2500, power: 70,
      resources: { gold: 25000, military: 3000, influence: 85 },
      goals: ['Control all trade', 'Sow chaos'], laws: ['Never betray the guild', 'Pay your dues'], secrets: ['They control the city guard']
    });

    this.createFaction({
      id: 'emerald-circle', name: 'The Emerald Circle', alignment: 'neutral-good',
      leader: 'Archdruid Vael', headquarters: 'The Great Tree',
      territory: ['Whispering Woods', 'Verdant Valley'], members: 1200, power: 65,
      resources: { gold: 2000, military: 4000, influence: 75 },
      goals: ['Protect nature', 'Maintain balance'], laws: ['Do not harm the ancient trees'], secrets: ['Guarding a sleeping primordial']
    });

    this.createFaction({
      id: 'crimson-blade', name: 'The Crimson Blade', alignment: 'lawful-neutral',
      leader: 'Commander Thorne', headquarters: 'Fortress of Iron',
      territory: ['The Scarred Wastes'], members: 3000, power: 80,
      resources: { gold: 12000, military: 9000, influence: 60 },
      goals: ['Fulfill contracts', 'Gain wealth'], laws: ['A contract is absolute'], secrets: ['Funding a rebellion']
    });

    this.createFaction({
      id: 'silver-scholars', name: 'The Silver Scholars', alignment: 'true-neutral',
      leader: 'Archmage Solis', headquarters: 'The Spire of Stars',
      territory: ['The Arcane Ward'], members: 800, power: 90,
      resources: { gold: 18000, military: 2000, influence: 95 },
      goals: ['Hoard knowledge', 'Master magic'], laws: ['Knowledge above all'], secrets: ['Possess a world-ending artifact']
    });

    this.createFaction({
      id: 'black-hand', name: 'The Black Hand', alignment: 'chaotic-neutral',
      leader: 'Unknown', headquarters: 'The Shadows',
      territory: ['The Slums'], members: 1500, power: 55,
      resources: { gold: 8000, military: 2500, influence: 40 },
      goals: ['Freedom from oppression', 'Anarchy'], laws: ['Survive'], secrets: ['Leader is a noble in disguise']
    });

    this.createFaction({
      id: 'golden-throne', name: 'The Golden Throne', alignment: 'lawful-evil',
      leader: 'Emperor Valerius', headquarters: 'The Imperial Capital',
      territory: ['The Crownlands', 'The Iron Coast'], members: 10000, power: 95,
      resources: { gold: 50000, military: 12000, influence: 100 },
      goals: ['Total domination', 'Crush dissent'], laws: ['The Emperor\'s word is law'], secrets: ['The Emperor is a vampire']
    });

    this.createFaction({
      id: 'free-traders', name: 'The Free Traders', alignment: 'true-neutral',
      leader: 'Guildmaster Silas', headquarters: 'The Grand Bazaar',
      territory: ['The Merchant District', 'The Golden Road'], members: 4000, power: 60,
      resources: { gold: 40000, military: 1500, influence: 80 },
      goals: ['Maximize profit', 'Free trade'], laws: ['Honor the deal'], secrets: ['Smuggling illegal artifacts']
    });
  }
}