// ═══════════════════════════════════════════════════════════════════
// World Builder — Overnight idea generation without canonizing
// Generates ideas in every direction. DM sifts for gold in the morning.
// ═══════════════════════════════════════════════════════════════════

export interface WorldBuildConfig {
  theme: string;          // campaign theme (e.g., 'dark fantasy', 'cosmic horror')
  seed: string;           // starting notes/ideas
  directions: number;     // how many idea branches to explore
  depth: number;          // how deep each branch goes
  maxIdeas: number;       // cap on total ideas generated
}

export interface WorldBuildSession {
  id: string;
  config: WorldBuildConfig;
  started: number;
  completed: boolean;
  ideasGenerated: number;
  branches: WorldBuildBranch[];
}

export interface WorldBuildBranch {
  direction: string;
  ideas: Array<{ category: string; description: string; confidence: number }>;
  connections: string[]; // links to other branches
}

// Direction generators — each explores a different aspect of the world
const DIRECTIONS = [
  { name: 'Geography', prompt: 'Generate unique locations, landmarks, and terrain for a {theme} campaign. Start from: {seed}' },
  { name: 'Factions', prompt: 'Generate political factions, guilds, and organizations for a {theme} campaign. Include conflicts and alliances.' },
  { name: 'NPCs', prompt: 'Generate memorable NPCs with secrets, motivations, and connection points for a {theme} campaign.' },
  { name: 'Encounters', prompt: 'Generate balanced combat encounters and social encounters for a {theme} campaign at levels 1-5.' },
  { name: 'Lore', prompt: 'Generate deep lore, history, myths, and legends for a {theme} campaign.' },
  { name: 'Items', prompt: 'Generate unique magical items, artifacts, and treasures for a {theme} campaign.' },
  { name: 'Plot Hooks', prompt: 'Generate plot hooks, mysteries, and unresolved threads for a {theme} campaign.' },
  { name: 'Hazards', prompt: 'Generate environmental hazards, traps, and dangers for a {theme} campaign.' },
];

export class WorldBuilder {
  async startBuild(config: WorldBuildConfig): Promise<WorldBuildSession> {
    const session: WorldBuildSession = {
      id: crypto.randomUUID(), config, started: Date.now(),
      completed: false, ideasGenerated: 0, branches: []
    };

    // Select directions to explore
    const selected = DIRECTIONS.slice(0, Math.min(config.directions, DIRECTIONS.length));

    for (const dir of selected) {
      const branch: WorldBuildBranch = { direction: dir.name, ideas: [], connections: [] };
      const prompt = dir.prompt.replace('{theme}', config.theme).replace('{seed}', config.seed);
      // In production: call LLM here. For now, generate structural ideas.
      const categories = ['location', 'npc', 'plot', 'encounter', 'item', 'faction', 'lore', 'hazard'];
      for (let i = 0; i < config.depth; i++) {
        branch.ideas.push({
          category: categories[i % categories.length],
          description: `[${dir.name}] Idea ${i + 1} for ${config.theme}: based on ${config.seed}`,
          confidence: 0.3 + Math.random() * 0.4 // initial confidence is low
        });
        session.ideasGenerated++;
        if (session.ideasGenerated >= config.maxIdeas) break;
      }
      session.branches.push(branch);
    }

    session.completed = true;
    return session;
  }

  // Sift for gold — score ideas by relevance and novelty
  siftForGold(session: WorldBuildSession, campaignContext: string): WorldBuildSession['branches'] {
    return session.branches.map(branch => ({
      ...branch,
      ideas: branch.ideas
        .map(idea => ({
          ...idea,
          confidence: Math.min(1.0, idea.confidence + (campaignContext.toLowerCase().includes(idea.category) ? 0.3 : 0))
        }))
        .sort((a, b) => b.confidence - a.confidence)
    }));
  }
}
