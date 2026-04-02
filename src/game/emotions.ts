/**
 * Emotion Engine — NPC relationship tracking with multi-axis emotions.
 *
 * Tracks trust, fear, respect, love, and anger for each NPC toward the player.
 * Actions modify relationships, emotions decay toward neutral over time,
 * and dialogue tone shifts based on relationship level.
 *
 * Storage: KV at campaign/{id}/relationships.json
 */

import { DiceRoller } from "./dice.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EmotionAxis = "trust" | "fear" | "respect" | "love" | "anger";

export interface EmotionScores {
  trust: number;    // 0-100
  fear: number;     // 0-100
  respect: number;  // 0-100
  love: number;     // 0-100
  anger: number;    // 0-100
}

export interface NPCRelationship {
  npcId: string;
  npcName: string;
  scores: EmotionScores;
  lastInteraction: number;
  interactionCount: number;
  history: RelationshipEvent[];
}

export interface RelationshipEvent {
  turn: number;
  timestamp: number;
  action: string;
  changes: Partial<EmotionScores>;
  reason: string;
}

export type RelationshipLevel =
  | "nemesis"    // anger > 80
  | "enemy"      // anger > 50 or trust < 20
  | "wary"       // fear > 60
  | "acquaintance"
  | "friend"     // trust > 60 and love > 30
  | "trusted"    // trust > 80
  | "beloved"    // love > 70 and trust > 60
  | "revered";   // respect > 80

export interface DialogueModifiers {
  tone: string;
  openness: number;     // 0-1 how much info the NPC shares
  cooperation: number;  // 0-1 willingness to help
  aggression: number;   // 0-1 hostility level
  affection: number;    // 0-1 warmth toward player
}

// ---------------------------------------------------------------------------
// Action definitions — how player actions affect relationships
// ---------------------------------------------------------------------------

export interface RelationshipAction {
  name: string;
  effects: Partial<EmotionScores>;
  description: string;
}

const RELATIONSHIP_ACTIONS: Record<string, RelationshipAction> = {
  help: {
    name: "help",
    effects: { trust: 10, respect: 5, love: 3 },
    description: "You helped them in their time of need.",
  },
  heal: {
    name: "heal",
    effects: { trust: 8, love: 5, respect: 3 },
    description: "You tended to their wounds.",
  },
  gift: {
    name: "gift",
    effects: { trust: 5, love: 8, respect: 2 },
    description: "You gave them something valuable.",
  },
  defend: {
    name: "defend",
    effects: { trust: 12, respect: 8, love: 5, fear: -3 },
    description: "You stood between them and danger.",
  },
  lie: {
    name: "lie",
    effects: { trust: -15, anger: 10, respect: -5 },
    description: "They caught you in a lie.",
  },
  betray: {
    name: "betray",
    effects: { trust: -30, anger: 25, love: -20, fear: 5 },
    description: "You broke faith with them.",
  },
  steal: {
    name: "steal",
    effects: { trust: -20, anger: 20, respect: -10 },
    description: "You took what was theirs.",
  },
  insult: {
    name: "insult",
    effects: { anger: 15, respect: -10, love: -5 },
    description: "Your words cut deep.",
  },
  intimidate: {
    name: "intimidate",
    effects: { fear: 15, respect: 5, trust: -5, anger: 5 },
    description: "You made your power known.",
  },
  compliment: {
    name: "compliment",
    effects: { love: 5, trust: 3, respect: 2 },
    description: "You spoke kindly to them.",
  },
  rescue: {
    name: "rescue",
    effects: { trust: 20, love: 15, respect: 15, fear: -10 },
    description: "You saved them from certain doom.",
  },
  abandon: {
    name: "abandon",
    effects: { trust: -25, anger: 20, love: -15, fear: 5 },
    description: "You left them in their hour of need.",
  },
  share_secret: {
    name: "share_secret",
    effects: { trust: 10, love: 8 },
    description: "You trusted them with a secret.",
  },
  keep_promise: {
    name: "keep_promise",
    effects: { trust: 15, respect: 10, love: 3 },
    description: "You kept your word.",
  },
  break_promise: {
    name: "break_promise",
    effects: { trust: -20, anger: 15, respect: -10, love: -5 },
    description: "You broke your promise.",
  },
  kill_ally: {
    name: "kill_ally",
    effects: { trust: -40, anger: 30, fear: 20, love: -30 },
    description: "You slew someone they cared about.",
  },
  spar: {
    name: "spar",
    effects: { respect: 8, trust: 3, love: 2 },
    description: "You tested your strength together.",
  },
  negotiate: {
    name: "negotiate",
    effects: { respect: 5, trust: 5 },
    description: "You found common ground.",
  },
};

// ---------------------------------------------------------------------------
// Decay constants
// ---------------------------------------------------------------------------

const DECAY_RATE = 0.02;     // per turn, emotions drift 2% toward neutral
const NEUTRAL_SCORE = 40;    // "neutral" baseline (not 50 — NPCs are cautious by default)
const MIN_INTERACTION_COUNT = 3; // Below this, decay is faster

// ---------------------------------------------------------------------------
// Emotion Engine
// ---------------------------------------------------------------------------

const dice = new DiceRoller();

export class EmotionEngine {
  private relationships: Map<string, NPCRelationship> = new Map();
  private turnCount = 0;

  // -----------------------------------------------------------------------
  // Relationship management
  // -----------------------------------------------------------------------

  /** Initialize or get a relationship for an NPC. */
  getOrCreate(npcId: string, npcName: string): NPCRelationship {
    if (!this.relationships.has(npcId)) {
      this.relationships.set(npcId, {
        npcId,
        npcName,
        scores: {
          trust: NEUTRAL_SCORE,
          fear: 20 + dice.d6() * 2,
          respect: 30 + dice.d6(),
          love: 15 + dice.d4(),
          anger: 10 + dice.d4(),
        },
        lastInteraction: Date.now(),
        interactionCount: 0,
        history: [],
      });
    }
    return this.relationships.get(npcId)!;
  }

  /** Apply a relationship action (e.g., "help", "betray", "lie"). */
  applyAction(npcId: string, npcName: string, actionName: string, turn?: number): RelationshipEvent | null {
    const action = RELATIONSHIP_ACTIONS[actionName];
    if (!action) return null;

    const rel = this.getOrCreate(npcId, npcName);
    rel.interactionCount++;
    rel.lastInteraction = Date.now();

    // Apply changes with small random variance
    const changes: Partial<EmotionScores> = {};
    for (const [axis, delta] of Object.entries(action.effects)) {
      const variance = Math.floor((dice.d4() - 2) * 0.5); // -1 to +1
      const actual = Math.round(delta * (0.9 + Math.random() * 0.2)) + variance;
      const key = axis as EmotionAxis;
      if (key in rel.scores) {
        (rel.scores as any)[key] = clamp(rel.scores[key] + actual);
        (changes as any)[key] = actual;
      }
    }

    const event: RelationshipEvent = {
      turn: turn ?? this.turnCount,
      timestamp: Date.now(),
      action: actionName,
      changes,
      reason: action.description,
    };
    rel.history.push(event);

    // Keep history bounded
    if (rel.history.length > 50) {
      rel.history = rel.history.slice(-50);
    }

    return event;
  }

  /** Apply a custom emotion delta for freeform interactions. */
  applyCustom(npcId: string, npcName: string, delta: Partial<EmotionScores>, reason: string, turn?: number): RelationshipEvent {
    const rel = this.getOrCreate(npcId, npcName);
    rel.interactionCount++;
    rel.lastInteraction = Date.now();

    const changes: Partial<EmotionScores> = {};
    for (const [axis, d] of Object.entries(delta)) {
      const key = axis as EmotionAxis;
      if (key in rel.scores) {
        rel.scores[key] = clamp(rel.scores[key] + d);
        (changes as any)[key] = d;
      }
    }

    const event: RelationshipEvent = {
      turn: turn ?? this.turnCount,
      timestamp: Date.now(),
      action: "custom",
      changes,
      reason,
    };
    rel.history.push(event);
    if (rel.history.length > 50) rel.history = rel.history.slice(-50);
    return event;
  }

  // -----------------------------------------------------------------------
  // Decay
  // -----------------------------------------------------------------------

  /** Apply emotional decay for one game turn. */
  decay(): void {
    this.turnCount++;
    for (const rel of this.relationships.values()) {
      // Stronger decay for low-interaction NPCs
      const rate = rel.interactionCount < MIN_INTERACTION_COUNT
        ? DECAY_RATE * 2
        : DECAY_RATE;

      for (const axis of ["trust", "fear", "respect", "love", "anger"] as EmotionAxis[]) {
        const current = rel.scores[axis];
        const diff = current - NEUTRAL_SCORE;
        const decay = diff * rate;
        rel.scores[axis] = clamp(Math.round(current - decay));
      }
    }
  }

  // -----------------------------------------------------------------------
  // Analysis
  // -----------------------------------------------------------------------

  /** Determine the overall relationship level. */
  getLevel(npcId: string): RelationshipLevel {
    const rel = this.relationships.get(npcId);
    if (!rel) return "acquaintance";

    const { trust, fear, respect, love, anger } = rel.scores;

    if (anger > 80) return "nemesis";
    if (anger > 50 || trust < 20) return "enemy";
    if (fear > 60) return "wary";
    if (respect > 80) return "revered";
    if (love > 70 && trust > 60) return "beloved";
    if (trust > 80) return "trusted";
    if (trust > 60 && love > 30) return "friend";
    return "acquaintance";
  }

  /** Get a human-readable label for the relationship. */
  getLevelLabel(level: RelationshipLevel): string {
    const labels: Record<RelationshipLevel, string> = {
      nemesis:       "Nemesis — they want you destroyed",
      enemy:         "Enemy — they work against you",
      wary:          "Wary — they watch you carefully",
      acquaintance:  "Acquaintance — they know your face",
      friend:        "Friend — they'd share a drink with you",
      trusted:       "Trusted Ally — they'd follow you into battle",
      beloved:       "Beloved — they'd die for you",
      revered:       "Revered — they speak your name with awe",
    };
    return labels[level];
  }

  /** Generate dialogue modifiers based on current relationship. */
  getDialogueModifiers(npcId: string): DialogueModifiers {
    const rel = this.relationships.get(npcId);
    if (!rel) {
      return { tone: "neutral", openness: 0.3, cooperation: 0.4, aggression: 0.1, affection: 0.1 };
    }

    const { trust, fear, respect, love, anger } = rel.scores;

    return {
      tone: this.inferTone(trust, anger, fear, love),
      openness: clamp01(trust / 100 * 0.7 + love / 100 * 0.2 + respect / 100 * 0.1),
      cooperation: clamp01(trust / 100 * 0.5 + love / 100 * 0.3 + respect / 100 * 0.2 - anger / 100 * 0.4),
      aggression: clamp01(anger / 100 * 0.6 + fear / 100 * 0.2 - trust / 100 * 0.3),
      affection: clamp01(love / 100 * 0.7 + trust / 100 * 0.3 - anger / 100 * 0.3),
    };
  }

  private inferTone(trust: number, anger: number, fear: number, love: number): string {
    if (anger > 70) return "hostile";
    if (fear > 60) return "fearful";
    if (love > 60 && trust > 50) return "warm";
    if (trust > 60) return "friendly";
    if (trust > 30) return "cautious";
    if (anger > 40) return "cold";
    return "neutral";
  }

  /** Generate a relationship summary for display. */
  getRelationshipSummary(npcId: string): string {
    const rel = this.relationships.get(npcId);
    if (!rel) return "No relationship established.";

    const level = this.getLevel(npcId);
    const { trust, fear, respect, love, anger } = rel.scores;

    return [
      `**${rel.npcName}** — ${this.getLevelLabel(level)}`,
      `  Trust: ${bar(trust)} ${trust}/100`,
      `  Fear:  ${bar(fear)} ${fear}/100`,
      `  Respect: ${bar(respect)} ${respect}/100`,
      `  Love:  ${bar(love)} ${love}/100`,
      `  Anger: ${bar(anger)} ${anger}/100`,
      `  Interactions: ${rel.interactionCount}`,
    ].join("\n");
  }

  /** Generate all relationship summaries. */
  getAllSummaries(): string {
    const summaries: string[] = ["=== NPC Relationships ===\n"];
    for (const rel of this.relationships.values()) {
      summaries.push(this.getRelationshipSummary(rel.npcId));
      summaries.push("");
    }
    if (this.relationships.size === 0) {
      summaries.push("You haven't met anyone yet.");
    }
    return summaries.join("\n");
  }

  // -----------------------------------------------------------------------
  // Prompt context — inject relationship state into LLM system prompt
  // -----------------------------------------------------------------------

  /** Build a relationship context string for the LLM. */
  buildPromptContext(): string {
    const lines: string[] = [];
    for (const rel of this.relationships.values()) {
      const level = this.getLevel(rel.npcId);
      const mods = this.getDialogueModifiers(rel.npcId);
      lines.push(
        `- @${rel.npcName}: ${level} (trust:${rel.scores.trust}, anger:${rel.scores.anger}, love:${rel.scores.love}). ` +
        `Tone: ${mods.tone}, openness: ${Math.round(mods.openness * 100)}%, cooperation: ${Math.round(mods.cooperation * 100)}%.`
      );
    }
    return lines.length > 0
      ? "## NPC Relationships\n" + lines.join("\n")
      : "";
  }

  /** Infer which relationship action happened from a player's freeform message. */
  inferActionFromMessage(message: string): string | null {
    const lower = message.toLowerCase();
    const actionKeywords: Record<string, string[]> = {
      help:         ["help", "assist", "aid", "support", "protect"],
      heal:         ["heal", "cure", "bandage", "tend", "mend"],
      gift:         ["give", "gift", "offer", "present", "hand over"],
      defend:       ["defend", "guard", "shield", "stand between", "block"],
      lie:          ["lie", "deceive", "mislead", "bluff", "fabricate"],
      betray:       ["betray", "backstab", "turn on", "sell out", "double-cross"],
      steal:        ["steal", "take", "pilfer", "swipe", "pocket"],
      insult:       ["insult", "mock", "ridicule", "belittle", "offend"],
      intimidate:   ["intimidate", "threaten", "scare", "menace", "coerce"],
      compliment:   ["compliment", "praise", "flatter", "admire"],
      rescue:       ["rescue", "save", "free", "liberate", "deliver"],
      abandon:      ["abandon", "leave behind", "forsake", "desert"],
      share_secret: ["tell secret", "confide", "reveal", "share truth"],
      keep_promise: ["kept promise", "fulfilled", "delivered as promised", "kept word"],
      break_promise:["broke promise", "failed to deliver", "went back on", "broke word"],
      negotiate:    ["negotiate", "bargain", "deal", "compromise", "agree"],
      spar:         ["spar", "train together", "practice fight"],
    };

    for (const [action, keywords] of Object.entries(actionKeywords)) {
      if (keywords.some(kw => lower.includes(kw))) return action;
    }
    return null;
  }

  // -----------------------------------------------------------------------
  // Serialization (for KV storage)
  // -----------------------------------------------------------------------

  serialize(): string {
    return JSON.stringify({
      relationships: Array.from(this.relationships.entries()),
      turnCount: this.turnCount,
    });
  }

  deserialize(data: string): void {
    const parsed = JSON.parse(data);
    this.relationships = new Map(parsed.relationships);
    this.turnCount = parsed.turnCount ?? 0;
  }

  /** Get all relationships as an array. */
  getAll(): NPCRelationship[] {
    return [...this.relationships.values()];
  }

  /** Get a single relationship. */
  get(npcId: string): NPCRelationship | undefined {
    return this.relationships.get(npcId);
  }

  getRelationshipCount(): number {
    return this.relationships.size;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function bar(value: number, width = 20): string {
  const filled = Math.round((value / 100) * width);
  return "[" + "#".repeat(filled) + "-".repeat(width - filled) + "]";
}
