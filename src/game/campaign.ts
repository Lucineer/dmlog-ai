// ═══════════════════════════════════════════════════════════════════
// Campaign Lifecycle Manager
// Conception → World Building → Session → Post-Session → Simulation → Prep
// ═══════════════════════════════════════════════════════════════════

export interface CampaignNote {
  id: string;
  text: string;
  ts: number;
  tags: string[];
  canonized: boolean; // promoted from idea to canon
}

export interface WorldIdea {
  id: string;
  category: 'location' | 'npc' | 'plot' | 'encounter' | 'item' | 'faction' | 'lore' | 'hazard';
  description: string;
  details: Record<string, string>;
  connections: string[]; // ids of related ideas
  canonized: boolean;
  source: 'dm' | 'agent' | 'player' | 'simulation';
  confidence: number; // 0-1, how well this fits the campaign
  sessionBorn: number; // which session generated this
}

export interface SessionRecord {
  id: number;
  date: string;
  transcript: string;
  highlights: string[]; // gold moments
  plotHooks: string[]; // unresolved threads
  characterDevelopments: string[];
  npcInteractions: string[];
  combatEncounters: CombatRecord[];
  playerDecisions: string[];
  worldChanges: string[]; // canonized ideas from this session
  duration: number; // minutes
  rating: number; // DM self-rating 1-10
}

export interface CombatRecord {
  enemies: string[];
  environment: string;
  outcome: 'victory' | 'defeat' | 'negotiation' | 'retreat' | 'tpk';
  playerActions: string[];
  balance: 'easy' | 'balanced' | 'hard' | 'deadly';
  lessons: string[];
}

export interface PlayerTwin {
  id: string;
  playerName: string;
  characterName: string;
  fightingStyle: string; // aggressive, tactical, creative, cautious, chaotic
  personality: string; // roleplay style description
  decisionPatterns: string[]; // observed decision tendencies
  preferredApproach: 'combat' | 'diplomacy' | 'stealth' | 'magic' | 'mixed';
  strengths: string[];
  weaknesses: string[];
  memorableMoments: string[];
  transcriptSnippets: string[]; // key quotes/actions
  accuracy: number; // how well the twin matches real behavior (improves over time)
}

export interface SimulationResult {
  id: string;
  type: 'combat' | 'social' | 'exploration' | 'plot';
  scenario: string;
  playerTwinActions: Record<string, string>;
  outcome: string;
  duration: string; // simulated duration
  canonized: boolean;
  lessons: string[];
  confidence: number;
  ts: number;
}

export type CampaignPhase = 'conception' | 'world-building' | 'session' | 'post-session' | 'simulation' | 'prep';

export class CampaignManager {
  private notes: CampaignNote[] = [];
  private worldIdeas: WorldIdea[] = [];
  private sessions: SessionRecord[] = [];
  private playerTwins: PlayerTwin[] = [];
  private simulations: SimulationResult[] = [];
  private phase: CampaignPhase = 'conception';
  private sessionCount = 0;

  // ── Phase Management ──
  getPhase(): CampaignPhase { return this.phase; }
  setPhase(phase: CampaignPhase): void { this.phase = phase; }
  getSessionCount(): number { return this.sessionCount; }

  // ── Conception: Capture raw ideas ──
  addNote(text: string, tags: string[] = []): CampaignNote {
    const note: CampaignNote = { id: crypto.randomUUID(), text, ts: Date.now(), tags, canonized: false };
    this.notes.push(note);
    return note;
  }

  getNotes(): CampaignNote[] { return this.notes; }
  getUncanonizedNotes(): CampaignNote[] { return this.notes.filter(n => !n.canonized); }

  // ── World Building: Generate ideas without canonizing ──
  addWorldIdea(idea: Omit<WorldIdea, 'id' | 'canonized'>): WorldIdea {
    const wi: WorldIdea = { ...idea, id: crypto.randomUUID(), canonized: false };
    this.worldIdeas.push(wi);
    return wi;
  }

  canonizeIdea(ideaId: string): void {
    const idea = this.worldIdeas.find(i => i.id === ideaId);
    if (idea) idea.canonized = true;
  }

  getWorldIdeas(category?: string): WorldIdea[] {
    return category ? this.worldIdeas.filter(i => i.category === category) : this.worldIdeas;
  }

  getUncanonizedIdeas(): WorldIdea[] { return this.worldIdeas.filter(i => !i.canonized); }
  getCanonizedIdeas(): WorldIdea[] { return this.worldIdeas.filter(i => i.canonized); }

  // ── Session Recording ──
  startSession(): number {
    this.sessionCount++;
    this.phase = 'session';
    const session: SessionRecord = {
      id: this.sessionCount, date: new Date().toISOString(), transcript: '',
      highlights: [], plotHooks: [], characterDevelopments: [], npcInteractions: [],
      combatEncounters: [], playerDecisions: [], worldChanges: [], duration: 0, rating: 0
    };
    this.sessions.push(session);
    return session.id;
  }

  getSession(id: number): SessionRecord | undefined { return this.sessions.find(s => s.id === id); }
  getLatestSession(): SessionRecord | undefined { return this.sessions[this.sessions.length - 1]; }
  getAllSessions(): SessionRecord[] { return this.sessions; }

  endSession(id: number, rating: number, duration: number): void {
    const session = this.getSession(id);
    if (session) { session.rating = rating; session.duration = duration; this.phase = 'post-session'; }
  }

  addTranscript(sessionId: number, text: string): void {
    const s = this.getSession(sessionId);
    if (s) s.transcript += text + '\n';
  }

  // ── Post-Session: Sift for gold ──
  addHighlight(sessionId: number, text: string): void {
    const s = this.getSession(sessionId);
    if (s) s.highlights.push(text);
  }

  addPlotHook(sessionId: number, text: string): void {
    const s = this.getSession(sessionId);
    if (s) s.plotHooks.push(text);
  }

  addCombatRecord(sessionId: number, combat: CombatRecord): void {
    const s = this.getSession(sessionId);
    if (s) s.combatEncounters.push(combat);
  }

  // ── Player Twins ──
  createPlayerTwin(data: Omit<PlayerTwin, 'id' | 'accuracy'>): PlayerTwin {
    const twin: PlayerTwin = { ...data, id: crypto.randomUUID(), accuracy: 0.5 };
    this.playerTwins.push(twin);
    return twin;
  }

  getPlayerTwins(): PlayerTwin[] { return this.playerTwins; }
  getPlayerTwin(playerName: string): PlayerTwin | undefined { return this.playerTwins.find(t => t.playerName === playerName); }

  // Build twin from transcript (call after first session)
  buildTwinFromTranscript(sessionId: number, playerName: string, characterName: string): PlayerTwin {
    const session = this.getSession(sessionId);
    const twin = this.createPlayerTwin({
      playerName, characterName,
      fightingStyle: 'mixed', personality: '', decisionPatterns: [],
      preferredApproach: 'mixed', strengths: [], weaknesses: [],
      memorableMoments: [], transcriptSnippets: []
    });
    if (session) {
      twin.transcriptSnippets = session.transcript.split('\n')
        .filter(line => line.toLowerCase().includes(playerName.toLowerCase()) || line.toLowerCase().includes(characterName.toLowerCase()))
        .slice(0, 20);
      twin.memorableMoments = session.highlights.filter(h => h.toLowerCase().includes(playerName.toLowerCase()));
      twin.decisionPatterns = session.playerDecisions.filter(d => d.toLowerCase().includes(playerName.toLowerCase()));
      twin.accuracy = Math.min(0.9, 0.5 + session.transcript.split('\n').length * 0.001);
    }
    return twin;
  }

  // ── Simulation ──
  addSimulation(result: Omit<SimulationResult, 'id' | 'ts'>): SimulationResult {
    const sim: SimulationResult = { ...result, id: crypto.randomUUID(), ts: Date.now() };
    this.simulations.push(sim);
    return sim;
  }

  getSimulations(): SimulationResult[] { return this.simulations; }

  // ── Campaign Summary ──
  getSummary(): object {
    return {
      phase: this.phase,
      sessions: this.sessionCount,
      totalPlayTime: this.sessions.reduce((sum, s) => sum + s.duration, 0),
      worldIdeas: { total: this.worldIdeas.length, canonized: this.getCanonizedIdeas().length, pending: this.getUncanonizedIdeas().length },
      playerTwins: this.playerTwins.length,
      simulations: this.simulations.length,
      averageRating: this.sessions.length ? (this.sessions.reduce((sum, s) => sum + s.rating, 0) / this.sessions.length).toFixed(1) : 'N/A',
      openPlotHooks: this.sessions.flatMap(s => s.plotHooks).length
    };
  }

  // ── Serialize for KV storage ──
  toJSON(): string { return JSON.stringify({ notes: this.notes, worldIdeas: this.worldIdeas, sessions: this.sessions, playerTwins: this.playerTwins, simulations: this.simulations, phase: this.phase, sessionCount: this.sessionCount }); }
  static fromJSON(json: string): CampaignManager { const d = JSON.parse(json); const m = new CampaignManager(); Object.assign(m, d); return m; }
}
