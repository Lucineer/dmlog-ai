// src/game/quest-system.ts

export interface Quest {
  id: string;
  title: string;
  description: string;
  type: 'main' | 'side' | 'faction' | 'personal';
  difficulty: 'trivial' | 'easy' | 'medium' | 'hard' | 'legendary';
  status: 'available' | 'active' | 'completed' | 'failed' | 'abandoned';
  objectives: QuestObjective[];
  rewards: QuestReward[];
  giver: string;
  location: string;
  prerequisites: string[];
  xpReward: number;
}

export interface QuestObjective {
  id: string;
  description: string;
  type: 'kill' | 'collect' | 'explore' | 'talk' | 'protect' | 'escort' | 'puzzle' | 'deliver';
  target: string;
  current: number;
  required: number;
  completed: boolean;
  hidden: boolean;
}

export interface QuestReward {
  type: 'gold' | 'item' | 'xp' | 'ability' | 'reputation';
  value: number;
  name: string;
  description: string;
}

export interface QuestLog {
  quests: Quest[];
  activeQuestId?: string;
  completedCount: number;
  totalXPEarned: number;
}

export class QuestSystem {
  private quests: Map<string, Quest> = new Map();
  private completedCount: number = 0;
  private totalXPEarned: number = 0;

  public createQuest(data: Omit<Quest, 'status'> & { status?: Quest['status'] }): Quest {
    const quest: Quest = { ...data, status: data.status ?? 'available' };
    if (!quest.objectives) quest.objectives = [];
    if (!quest.rewards) quest.rewards = [];
    if (!quest.prerequisites) quest.prerequisites = [];
    this.quests.set(quest.id, quest);
    return quest;
  }

  public getQuest(id: string): Quest | undefined {
    return this.quests.get(id);
  }

  public getQuestsByStatus(status: Quest['status']): Quest[] {
    return Array.from(this.quests.values()).filter((q) => q.status === status);
  }

  public getQuestsByType(type: Quest['type']): Quest[] {
    return Array.from(this.quests.values()).filter((q) => q.type === type);
  }

  public getAvailableQuests(completedIds: string[]): Quest[] {
    return Array.from(this.quests.values()).filter(
      (q) => q.status === 'available' && this.canStart(q.id, completedIds)
    );
  }

  public startQuest(id: string): void {
    const quest = this.quests.get(id);
    if (quest && quest.status === 'available') {
      quest.status = 'active';
    }
  }

  public advanceObjective(
    questId: string,
    objectiveId: string,
    amount: number
  ): { completed: boolean; questCompleted: boolean } {
    const quest = this.quests.get(questId);
    if (!quest || quest.status !== 'active') return { completed: false, questCompleted: false };

    const objective = quest.objectives.find((o) => o.id === objectiveId);
    if (!objective || objective.completed) return { completed: false, questCompleted: false };

    objective.current = Math.min(objective.current + amount, objective.required);
    
    if (objective.current >= objective.required) {
      objective.completed = true;
    }

    const questCompleted = quest.objectives.every((o) => o.completed);
    return { completed: objective.completed, questCompleted };
  }

  public completeQuest(id: string): QuestReward[] {
    const quest = this.quests.get(id);
    if (!quest || quest.status !== 'active') return [];

    quest.status = 'completed';
    this.completedCount++;
    this.totalXPEarned += quest.xpReward;
    return quest.rewards;
  }

  public failQuest(id: string, reason: string): void {
    const quest = this.quests.get(id);
    if (quest && quest.status === 'active') {
      quest.status = 'failed';
      quest.description += ` [Failed: ${reason}]`;
    }
  }

  public abandonQuest(id: string): void {
    const quest = this.quests.get(id);
    if (quest && quest.status === 'active') {
      quest.status = 'abandoned';
    }
  }

  public getActiveQuests(): Quest[] {
    return this.getQuestsByStatus('active');
  }

  public getQuestProgress(questId: string): { percent: number; objectivesCompleted: number; objectivesTotal: number } {
    const quest = this.quests.get(questId);
    if (!quest || quest.objectives.length === 0) {
      return { percent: 0, objectivesCompleted: 0, objectivesTotal: 0 };
    }

    const objectivesTotal = quest.objectives.length;
    const objectivesCompleted = quest.objectives.filter((o) => o.completed).length;
    const percent = Math.round((objectivesCompleted / objectivesTotal) * 100);

    return { percent, objectivesCompleted, objectivesTotal };
  }

  public addPrerequisite(questId: string, prereqId: string): void {
    const quest = this.quests.get(questId);
    if (quest && !quest.prerequisites.includes(prereqId)) {
      quest.prerequisites.push(prereqId);
    }
  }

  public canStart(questId: string, completedIds: string[]): boolean {
    const quest = this.quests.get(questId);
    if (!quest) return false;
    return quest.prerequisites.every((p) => completedIds.includes(p));
  }

  public getQuestChain(questId: string): Quest[] {
    const chain: Quest[] = [];
    let currentQuest = this.quests.get(questId);

    // Walk backwards to find the root quest
    while (currentQuest && currentQuest.prerequisites.length > 0) {
      const parentId = currentQuest.prerequisites[0]; // Assuming linear chain uses index 0
      currentQuest = this.quests.get(parentId);
      if (!currentQuest) break;
    }

    // If we found a root, or the original had no prereqs, currentQuest is the root.
    // If original had no prereqs, we start from it.
    const root = currentQuest || this.quests.get(questId);
    if (root) {
      chain.push(root);
      let nextId = root.id;

      // Walk forwards to build the chain
      let hasPrereq = true;
      while (hasPrereq) {
        hasPrereq = false;
        for (const q of this.quests.values()) {
          // Assuming a main quest chain tracks the previous quest as the first prerequisite
          if (q.prerequisites.includes(nextId) && q.type === 'main') {
            chain.push(q);
            nextId = q.id;
            hasPrereq = true;
            break;
          }
        }
      }
    }

    // If somehow the target wasn't in the chain (e.g., side quest), just return it
    if (chain.length === 0) {
      const target = this.quests.get(questId);
      if (target) chain.push(target);
    }

    return chain;
  }

  public getRewardsSummary(questId: string): string {
    const quest = this.quests.get(questId);
    if (!quest) return 'Quest not found.';

    const rewardStrings = quest.rewards.map((r) => {
      if (r.type === 'gold') return `${r.value} Gold`;
      if (r.type === 'xp') return `${r.value} XP`;
      return `${r.name} (${r.type})`;
    });

    const baseXp = `${quest.xpReward} XP`;
    const allRewards = [baseXp, ...rewardStrings];
    return `Rewards: ${allRewards.join(', ')}`;
  }

  public getFullQuestLog(): QuestLog {
    return {
      quests: Array.from(this.quests.values()),
      activeQuestId: this.getActiveQuests()[0]?.id,
      completedCount: this.completedCount,
      totalXPEarned: this.totalXPEarned,
    };
  }

  public generateQuest(type: Quest['type'], difficulty: Quest['difficulty'], location: string): Quest {
    const id = `q_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const templates: Record<string, { title: string; desc: string; target: string }> = {
      kill: { title: 'Clear the Threat', desc: 'Eliminate hostiles in the area.', target: 'Enemies' },
      collect: { title: 'Material Gathering', desc: 'Collect necessary resources.', target: 'Items' },
      escort: { title: 'Safe Passage', desc: 'Ensure the target reaches their destination.', target: 'VIP' },
    };

    const keys = Object.keys(templates);
    const key = keys[Math.floor(Math.random() * keys.length)];
    const template = keys.includes(type) ? templates[type] : templates[key];

    const difficultyMultiplier = { trivial: 0.5, easy: 1, medium: 2, hard: 3, legendary: 5 };
    const mult = difficultyMultiplier[difficulty];

    const quest = this.createQuest({
      id,
      title: `${template.title} in ${location}`,
      description: template.desc,
      type,
      difficulty,
      giver: 'Notice Board',
      location,
      xpReward: Math.floor(100 * mult),
      objectives: [
        {
          id: `${id}_obj1`,
          description: `${template.target} handled`,
          type: type as QuestObjective['type'],
          target: template.target,
          current: 0,
          required: Math.floor(5 * mult),
          completed: false,
          hidden: false,
        },
      ],
      rewards: [
        { type: 'gold', value: Math.floor(50 * mult), name: 'Gold', description: 'A pouch of gold coins.' },
      ],
      prerequisites: [],
    });

    return quest;
  }

  public serialize(): string {
    return JSON.stringify(this.getFullQuestLog());
  }

  public deserialize(json: string): void {
    try {
      const log: QuestLog = JSON.parse(json);
      this.quests.clear();
      
      if (log.quests && Array.isArray(log.quests)) {
        log.quests.forEach((q) => this.quests.set(q.id, q));
      }
      
      this.completedCount = log.completedCount || 0;
      this.totalXPEarned = log.totalXPEarned || 0;
    } catch (error) {
      console.error('Failed to deserialize quest log:', error);
    }
  }
}