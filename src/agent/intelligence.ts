/**
 * CampaignIntelligence: manages campaign knowledge and learning
 * Learns: player preferences, effective encounters, story arcs
 * Suggests: encounter balance, plot twists, NPC developments
 * Exports: CampaignIntelligence class with learn(), suggest(), analyze()
 */

// --- Types ---

interface SessionRecord {
  sessionId: string;
  date: number;
  durationMinutes: number;
  encounters: number;
  roleplayScenes: number;
  explorationScenes: number;
  combatScenes: number;
  playerCasualties: number;
  enemyCasualties: number;
  questsAdvanced: number;
  playerSatisfaction?: number; // 1-5, optional feedback
}

interface PlayerProfile {
  playerId: string;
  name: string;
  totalSessions: number;
  combatRatio: number;       // 0-1, fraction of time in combat
  roleplayRatio: number;     // 0-1
  explorationRatio: number;  // 0-1
  preferredPlayStyle: 'combat' | 'roleplay' | 'exploration' | 'balanced';
  characterArchetypes: string[];
  notableChoices: string[];
  lastActive: number;
}

interface NPCRecord {
  npcName: string;
  timesEncountered: number;
  playerSentiment: 'positive' | 'neutral' | 'negative' | 'mixed';
  developmentArc: string;
  lastInteraction: number;
}

interface EncounterSuggestion {
  type: 'combat' | 'roleplay' | 'exploration' | 'puzzle';
  difficulty: 'easy' | 'medium' | 'hard' | 'deadly';
  description: string;
  reasoning: string;
}

interface PlotSuggestion {
  type: 'twist' | 'revelation' | 'complication' | 'resolution';
  description: string;
  affectedNPCs: string[];
  affectedQuests: string[];
  reasoning: string;
}

interface CampaignHealth {
  score: number;            // 0-100
  engagement: number;       // 0-100
  storyProgress: number;    // 0-100
  pacing: 'too_slow' | 'good' | 'too_fast';
  recommendations: string[];
}

interface CampaignKnowledge {
  campaignId: string;
  sessions: SessionRecord[];
  players: Map<string, PlayerProfile>;
  npcs: Map<string, NPCRecord>;
  storyArcs: string[];
  themes: string[];
  createdAt: number;
  updatedAt: number;
}

// --- Intelligence Engine ---

export class CampaignIntelligence {
  private readonly knowledge: CampaignKnowledge;
  private readonly maxSessions = 100;
  private readonly maxPlayers = 10;
  private readonly maxNpcs = 50;

  constructor(campaignId: string) {
    this.knowledge = {
      campaignId,
      sessions: [],
      players: new Map(),
      npcs: new Map(),
      storyArcs: [],
      themes: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Learn from a completed session. Updates player profiles and campaign metrics.
   */
  learn(session: SessionRecord): void {
    this.knowledge.sessions.push(session);
    if (this.knowledge.sessions.length > this.maxSessions) {
      this.knowledge.sessions.shift();
    }
    this.knowledge.updatedAt = Date.now();
    this.deriveThemes();
  }

  /**
   * Learn about a player's behavior and preferences.
   */
  learnPlayer(profile: PlayerProfile): void {
    this.knowledge.players.set(profile.playerId, profile);
    if (this.knowledge.players.size > this.maxPlayers) {
      const oldest = this.findOldestPlayer();
      if (oldest) this.knowledge.players.delete(oldest);
    }
  }

  /**
   * Learn about an NPC based on player interactions.
   */
  learnNPC(record: NPCRecord): void {
    this.knowledge.npcs.set(record.npcName, record);
    if (this.knowledge.npcs.size > this.maxNpcs) {
      const oldest = this.findOldestNPC();
      if (oldest) this.knowledge.npcs.delete(oldest);
    }
  }

  /**
   * Suggest an encounter based on learned campaign state.
   */
  suggest(): EncounterSuggestion[] {
    const suggestions: EncounterSuggestion[] = [];
    const recent = this.getRecentSessions(5);

    if (recent.length === 0) {
      suggestions.push({
        type: 'exploration',
        difficulty: 'easy',
        description: 'A gentle introduction to the setting — let the players explore and meet NPCs.',
        reasoning: 'No session history yet. Start with exploration to establish the world.',
      });
      return suggestions;
    }

    const avgCombat = this.averageField(recent, 'combatScenes');
    const avgRoleplay = this.averageField(recent, 'roleplayScenes');
    const playStyle = this.dominantPlayStyle();

    // If combat-heavy recently, suggest variety
    if (avgCombat > 2 && avgRoleplay < 1) {
      suggestions.push({
        type: 'roleplay',
        difficulty: 'medium',
        description: 'A social encounter with an influential NPC who has information the party needs.',
        reasoning: `Players have averaged ${avgCombat.toFixed(1)} combat scenes recently. A roleplay break will balance pacing.`,
      });
    }

    // If low on combat and it has been a while, build tension
    if (avgCombat < 0.5 && recent.length >= 3) {
      suggestions.push({
        type: 'combat',
        difficulty: 'medium',
        description: 'Ambush by enemies who have been tracking the party. Tie to an existing quest thread.',
        reasoning: 'Low combat in recent sessions. A well-timed encounter raises stakes.',
      });
    }

    // Always offer a plot hook
    suggestions.push({
      type: 'exploration',
      difficulty: this.calibrateDifficulty(),
      description: 'Discover a hidden location tied to an unresolved mystery or NPC backstory.',
      reasoning: `Players prefer ${playStyle} play. This supports their style while advancing the plot.`,
    });

    return suggestions;
  }

  /**
   * Analyze overall campaign health and return a report.
   */
  analyze(): CampaignHealth {
    const sessions = this.knowledge.sessions;
    const recommendations: string[] = [];

    if (sessions.length === 0) {
      return {
        score: 50,
        engagement: 50,
        storyProgress: 0,
        pacing: 'good',
        recommendations: ['Run your first session to start building campaign intelligence.'],
      };
    }

    // Engagement: based on session frequency and satisfaction
    const avgSatisfaction = this.averageField(sessions, 'playerSatisfaction') || 3;
    const engagement = Math.min(100, Math.round(avgSatisfaction * 20));

    // Story progress: based on quests advanced
    const totalQuests = sessions.reduce((sum, s) => sum + s.questsAdvanced, 0);
    const storyProgress = Math.min(100, totalQuests * 10);

    // Pacing: combat vs downtime ratio
    const avgCombat = this.averageField(sessions, 'combatScenes');
    const avgRoleplay = this.averageField(sessions, 'roleplayScenes');
    let pacing: CampaignHealth['pacing'] = 'good';
    if (avgCombat > 3 && avgRoleplay < 1) {
      pacing = 'too_fast';
      recommendations.push('High combat density. Consider slowing down for character development.');
    } else if (avgCombat < 0.3 && avgRoleplay > 4) {
      pacing = 'too_slow';
      recommendations.push('Low action frequency. Consider introducing a threat to raise stakes.');
    }

    // Overall score
    const score = Math.round((engagement * 0.4) + (storyProgress * 0.3) + (pacing === 'good' ? 30 : 15));

    // Additional recommendations
    const playerCasualties = sessions.reduce((sum, s) => sum + s.playerCasualties, 0);
    if (playerCasualties > sessions.length) {
      recommendations.push('High casualty rate. Consider encounters that challenge without overwhelming.');
    }

    const shortSessions = sessions.filter((s) => s.durationMinutes < 30);
    if (shortSessions.length > sessions.length / 2) {
      recommendations.push('Sessions are frequently short. Consider deeper encounters to sustain play.');
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      engagement,
      storyProgress,
      pacing,
      recommendations: recommendations.length > 0 ? recommendations : ['Campaign is healthy. Keep adventuring.'],
    };
  }

  // --- Private helpers ---

  private getRecentSessions(count: number): SessionRecord[] {
    return this.knowledge.sessions.slice(-count);
  }

  private averageField(sessions: SessionRecord[], field: keyof SessionRecord): number {
    const values = sessions
      .map((s) => s[field])
      .filter((v): v is number => typeof v === 'number');
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  }

  private dominantPlayStyle(): string {
    const recent = this.getRecentSessions(10);
    const combat = this.averageField(recent, 'combatScenes');
    const roleplay = this.averageField(recent, 'roleplayScenes');
    const exploration = this.averageField(recent, 'explorationScenes');
    const max = Math.max(combat, roleplay, exploration);
    if (max === combat) return 'combat';
    if (max === roleplay) return 'roleplay';
    return 'exploration';
  }

  private calibrateDifficulty(): 'easy' | 'medium' | 'hard' | 'deadly' {
    const recent = this.getRecentSessions(5);
    const casualties = this.averageField(recent, 'playerCasualties');
    if (casualties > 2) return 'easy';
    if (casualties > 1) return 'medium';
    if (casualties > 0) return 'hard';
    return 'deadly';
  }

  private findOldestPlayer(): string | null {
    let oldest: string | null = null;
    let oldestTime = Infinity;
    for (const [id, p] of this.knowledge.players) {
      if (p.lastActive < oldestTime) {
        oldest = id;
        oldestTime = p.lastActive;
      }
    }
    return oldest;
  }

  private findOldestNPC(): string | null {
    let oldest: string | null = null;
    let oldestTime = Infinity;
    for (const [name, n] of this.knowledge.npcs) {
      if (n.lastInteraction < oldestTime) {
        oldest = name;
        oldestTime = n.lastInteraction;
      }
    }
    return oldest;
  }

  private deriveThemes(): void {
    const recent = this.getRecentSessions(10);
    const themes: string[] = [];
    const combat = this.averageField(recent, 'combatScenes');
    const roleplay = this.averageField(recent, 'roleplayScenes');

    if (combat > roleplay) themes.push('action-oriented');
    else themes.push('story-driven');

    this.knowledge.themes = themes;
  }
}

// --- Re-export types ---
export type {
  SessionRecord,
  PlayerProfile,
  NPCRecord,
  EncounterSuggestion,
  PlotSuggestion,
  CampaignHealth,
  CampaignKnowledge,
};
