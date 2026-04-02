/**
 * Consequence System — choices matter with delayed and compounding effects.
 *
 * Tracks every significant player choice, evaluates pending consequences
 * each turn, and fires them when conditions are met. Small choices compound
 * via a "butterfly score" that modifies future outcomes.
 *
 * Storage: KV at campaign/{id}/choices.json
 */

import { DiceRoller } from "./dice.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ChoiceWeight = "minor" | "moderate" | "major" | "pivotal";
export type ConsequenceType = "narrative" | "mechanical" | "relationship" | "quest" | "environment";
export type ConsequenceTiming = "immediate" | "delayed" | "conditional";

export interface PlayerChoice {
  id: string;
  turn: number;
  timestamp: number;
  scene: string;              // where the choice happened
  description: string;        // what was decided
  options: string[];          // what was available
  chosen: string;             // what the player picked
  weight: ChoiceWeight;
  tags: string[];             // thematic tags: "mercy", "violence", "honesty"
  butterflyScore: number;     // running total of butterfly effect
  consequenceIds: string[];   // consequences spawned by this choice
}

export interface Consequence {
  id: string;
  sourceChoiceId: string;
  type: ConsequenceType;
  timing: ConsequenceTiming;
  description: string;           // what happens
  notification: string;          // player-facing message
  triggerTurn?: number;          // fire at this turn (delayed)
  triggerCondition?: string;     // fire when this condition string matches context
  fired: boolean;
  firedTurn?: number;
  effects: ConsequenceEffect[];
}

export interface ConsequenceEffect {
  target: "player" | "npc" | "quest" | "world" | "narrative";
  action: string;                // e.g., "add_item", "change_relationship", "unlock_quest"
  params: Record<string, unknown>;
}

export interface ConsequenceNotification {
  type: "echo" | "butterfly" | "reckoning";
  message: string;
  sourceChoice: string;
  turnOccurred: number;
  turnFired: number;
  dramatic: boolean;  // should this be emphasized in narration
}

// ---------------------------------------------------------------------------
// Consequence templates — pre-built dramatic moments
// ---------------------------------------------------------------------------

const CONSEQUENCE_TEMPLATES: Record<string, {
  description: string;
  notification: string;
  type: ConsequenceType;
  effects: ConsequenceEffect[];
}> = {
  mercy_spare: {
    description: "The spared enemy remembers your mercy.",
    notification: "Your choice to spare {target} comes back to haunt you... {target} has rallied allies against you.",
    type: "narrative",
    effects: [{ target: "world", action: "spawn_enemy_group", params: {} }],
  },
  mercy_friend: {
    description: "The spared enemy becomes a reluctant ally.",
    notification: "Remember when you spared {target}? They've returned — not for revenge, but to repay the debt.",
    type: "relationship",
    effects: [{ target: "npc", action: "become_ally", params: {} }],
  },
  greed_cache: {
    description: "Taking the treasure attracted unwanted attention.",
    notification: "The gold you pocketed from the {scene} was cursed — or rather, it was being watched.",
    type: "narrative",
    effects: [{ target: "player", action: "ambush", params: {} }],
  },
  honesty_reward: {
    description: "Honesty earns unexpected allies.",
    notification: "Word of your honesty in the {scene} has spread. People treat you differently now.",
    type: "relationship",
    effects: [{ target: "player", action: "reputation_boost", params: {} }],
  },
  betrayal_reckoning: {
    description: "Those you betrayed seek justice.",
    notification: "Your betrayal at {scene} was not forgotten. The reckoning has arrived.",
    type: "narrative",
    effects: [{ target: "player", action: "confrontation", params: {} }],
  },
  violence_escalation: {
    description: "Violence begets violence.",
    notification: "Your violence in the {scene} has consequences — the dead have families, and families have long memories.",
    type: "quest",
    effects: [{ target: "quest", action: "revenge_quest", params: {} }],
  },
  kindness_boon: {
    description: "Kindness opens unexpected doors.",
    notification: "A stranger approaches. 'I heard what you did in the {scene}. Let me help you.'",
    type: "narrative",
    effects: [{ target: "player", action: "gain_ally", params: {} }],
  },
};

// ---------------------------------------------------------------------------
// Weight multipliers for butterfly effect
// ---------------------------------------------------------------------------

const WEIGHT_MULTIPLIERS: Record<ChoiceWeight, number> = {
  minor: 1,
  moderate: 3,
  major: 7,
  pivotal: 15,
};

// ---------------------------------------------------------------------------
// ConsequenceTracker
// ---------------------------------------------------------------------------

let nextChoiceId = 1;
let nextConsequenceId = 1;

const dice = new DiceRoller();

export class ConsequenceTracker {
  private choices: PlayerChoice[] = [];
  private consequences: Consequence[] = [];
  private butterflyTotal = 0;
  private turnCount = 0;
  private tagAccumulator: Map<string, number> = new Map(); // tag -> weighted sum

  // -----------------------------------------------------------------------
  // Recording choices
  // -----------------------------------------------------------------------

  /**
   * Record a player choice and generate associated consequences.
   */
  recordChoice(opts: {
    scene: string;
    description: string;
    options: string[];
    chosen: string;
    weight: ChoiceWeight;
    tags: string[];
  }): { choice: PlayerChoice; consequences: Consequence[] } {
    const weightMult = WEIGHT_MULTIPLIERS[opts.weight];

    const choice: PlayerChoice = {
      id: `choice_${nextChoiceId++}_${Date.now().toString(36)}`,
      turn: this.turnCount,
      timestamp: Date.now(),
      scene: opts.scene,
      description: opts.description,
      options: opts.options,
      chosen: opts.chosen,
      weight: opts.weight,
      tags: opts.tags,
      butterflyScore: this.butterflyTotal,
      consequenceIds: [],
    };

    // Accumulate butterfly score
    this.butterflyTotal += weightMult;
    choice.butterflyScore = this.butterflyTotal;

    // Accumulate tags
    for (const tag of opts.tags) {
      this.tagAccumulator.set(tag, (this.tagAccumulator.get(tag) ?? 0) + weightMult);
    }

    // Generate consequences
    const generatedConsequences = this.generateConsequences(choice);
    choice.consequenceIds = generatedConsequences.map(c => c.id);

    this.choices.push(choice);
    this.consequences.push(...generatedConsequences);

    return { choice, consequences: generatedConsequences };
  }

  // -----------------------------------------------------------------------
  // Consequence generation
  // -----------------------------------------------------------------------

  private generateConsequences(choice: PlayerChoice): Consequence[] {
    const consequences: Consequence[] = [];

    // 1. Tag-based consequences (mercy, violence, honesty, greed, etc.)
    for (const tag of choice.tags) {
      if (this.shouldGenerateTagConsequence(tag, choice)) {
        const con = this.createTagConsequence(tag, choice);
        if (con) consequences.push(con);
      }
    }

    // 2. Butterfly effect: if accumulated score is high, generate a compounding consequence
    if (this.butterflyTotal > 20 && dice.d100() < Math.min(this.butterflyTotal, 80)) {
      const con = this.createButterflyConsequence(choice);
      if (con) consequences.push(con);
    }

    // 3. Major/pivotal choices always have a delayed consequence
    if (choice.weight === "major" || choice.weight === "pivotal") {
      const delay = 5 + dice.d10() + (choice.weight === "pivotal" ? dice.d10() : 0);
      consequences.push({
        id: `conseq_${nextConsequenceId++}_${Date.now().toString(36)}`,
        sourceChoiceId: choice.id,
        type: "narrative",
        timing: "delayed",
        description: `Consequence of "${choice.description}" will manifest later.`,
        notification: this.generateDelayedNotification(choice),
        triggerTurn: this.turnCount + delay,
        fired: false,
        effects: [{ target: "narrative", action: "complication", params: { sourceChoice: choice.description } }],
      });
    }

    return consequences;
  }

  private shouldGenerateTagConsequence(tag: string, choice: PlayerChoice): boolean {
    const accumulated = this.tagAccumulator.get(tag) ?? 0;
    // Higher accumulation = higher chance of consequence
    const chance = Math.min(accumulated * 5, 60);
    return dice.d100() < chance;
  }

  private createTagConsequence(tag: string, choice: PlayerChoice): Consequence | null {
    const templateKey = this.getTemplateKeyForTag(tag);
    const template = templateKey ? CONSEQUENCE_TEMPLATES[templateKey] : null;

    const delay = 3 + dice.d8();
    const notification = template
      ? template.notification.replace("{scene}", choice.scene).replace("{target}", choice.chosen)
      : `Your actions in ${choice.scene} — "${choice.chosen}" — echo forward in time...`;

    return {
      id: `conseq_${nextConsequenceId++}_${Date.now().toString(36)}`,
      sourceChoiceId: choice.id,
      type: template?.type ?? "narrative",
      timing: "delayed",
      description: template?.description ?? `Consequence of ${tag} choice.`,
      notification,
      triggerTurn: this.turnCount + delay,
      fired: false,
      effects: template?.effects ?? [{ target: "narrative", action: "complication", params: {} }],
    };
  }

  private createButterflyConsequence(choice: PlayerChoice): Consequence {
    // Compound multiple small choices into one big moment
    const topTags = [...this.tagAccumulator.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([tag]) => tag);

    return {
      id: `conseq_${nextConsequenceId++}_${Date.now().toString(36)}`,
      sourceChoiceId: choice.id,
      type: "narrative",
      timing: "delayed",
      description: `Butterfly effect: ${topTags.join(", ")} choices compound.`,
      notification: `The pattern of your choices — ${topTags.join(", ")} — converges. Fate takes notice.`,
      triggerTurn: this.turnCount + 10 + dice.d6(),
      fired: false,
      effects: [{ target: "narrative", action: "major_plot_twist", params: { themes: topTags } }],
    };
  }

  private getTemplateKeyForTag(tag: string): string | null {
    const tagMap: Record<string, string> = {
      mercy:    "mercy_spare",
      kindness: "kindness_boon",
      violence: "violence_escalation",
      greed:    "greed_cache",
      honesty:  "honesty_reward",
      betrayal: "betrayal_reckoning",
    };
    return tagMap[tag] ?? null;
  }

  private generateDelayedNotification(choice: PlayerChoice): string {
    const templates = [
      `Your choice to "${choice.chosen}" in ${choice.scene} sends ripples through the story...`,
      `"I remember what you did in ${choice.scene}," a voice says from the shadows. Your past catches up.`,
      `The consequences of your actions in ${choice.scene} finally come to bear.`,
      `Long ago, you chose to "${choice.chosen}." Today, that choice chooses you back.`,
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }

  // -----------------------------------------------------------------------
  // Processing — check for consequences that should fire
  // -----------------------------------------------------------------------

  /**
   * Process pending consequences for the current turn.
   * Returns notifications for any consequences that fire.
   */
  processTurn(currentTurn: number, context?: string): ConsequenceNotification[] {
    this.turnCount = currentTurn;
    const notifications: ConsequenceNotification[] = [];

    for (const con of this.consequences) {
      if (con.fired) continue;

      let shouldFire = false;

      if (con.timing === "delayed" && con.triggerTurn !== undefined && currentTurn >= con.triggerTurn) {
        shouldFire = true;
      }

      if (con.timing === "conditional" && con.triggerCondition && context) {
        shouldFire = context.toLowerCase().includes(con.triggerCondition.toLowerCase());
      }

      if (shouldFire) {
        con.fired = true;
        con.firedTurn = currentTurn;

        const sourceChoice = this.choices.find(c => c.id === con.sourceChoiceId);
        const dramatic = con.type === "narrative" && (sourceChoice?.weight === "major" || sourceChoice?.weight === "pivotal");

        notifications.push({
          type: this.butterflyTotal > 30 ? "butterfly" : "echo",
          message: con.notification,
          sourceChoice: sourceChoice?.description ?? "a past choice",
          turnOccurred: sourceChoice?.turn ?? 0,
          turnFired: currentTurn,
          dramatic,
        });
      }
    }

    return notifications;
  }

  // -----------------------------------------------------------------------
  // Analysis
  // -----------------------------------------------------------------------

  /** Get the current butterfly effect score. */
  getButterflyScore(): number {
    return this.butterflyTotal;
  }

  /** Get accumulated tag weights. */
  getTagProfile(): Record<string, number> {
    return Object.fromEntries(this.tagAccumulator);
  }

  /** Get a summary of all choices and their status. */
  getChoiceHistory(): string {
    if (this.choices.length === 0) return "No choices recorded yet.";

    const lines: string[] = ["=== Choice History ===\n"];
    for (const choice of this.choices) {
      const firedCons = this.consequences.filter(c => c.sourceChoiceId === choice.id && c.fired);
      const pendingCons = this.consequences.filter(c => c.sourceChoiceId === choice.id && !c.fired);

      lines.push(`[Turn ${choice.turn}] ${choice.description}`);
      lines.push(`  Chose: ${choice.chosen} (${choice.weight})`);
      lines.push(`  Tags: ${choice.tags.join(", ")}`);
      if (firedCons.length > 0) {
        lines.push(`  Consequences fired: ${firedCons.length}`);
      }
      if (pendingCons.length > 0) {
        lines.push(`  Consequences pending: ${pendingCons.length}`);
      }
      lines.push("");
    }

    lines.push(`Butterfly Score: ${this.butterflyTotal}`);
    lines.push(`Tag Profile: ${JSON.stringify(Object.fromEntries(this.tagAccumulator))}`);

    return lines.join("\n");
  }

  /** Get the narrative path signature (what kind of story is this?). */
  getNarrativePath(): string {
    const topTags = [...this.tagAccumulator.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    if (topTags.length === 0) return "An unwritten story.";

    const descriptions: Record<string, string> = {
      mercy:    "a merciful soul",
      violence: "a warrior's path",
      honesty:  "an honest heart",
      greed:    "driven by gold",
      betrayal: "a betrayer's road",
      kindness: "a beacon of hope",
      courage:  "brave beyond measure",
      cunning:  "clever and calculating",
    };

    const traits = topTags.map(([tag]) => descriptions[tag] ?? tag);
    return `You walk ${traits.join(", ")}. Butterfly score: ${this.butterflyTotal}.`;
  }

  /** Build prompt context for the LLM about consequences. */
  buildPromptContext(): string {
    const pending = this.consequences.filter(c => !c.fired);
    if (pending.length === 0 && this.butterflyTotal === 0) return "";

    const lines: string[] = ["## Consequence Tracking"];
    lines.push(`Total choices: ${this.choices.length} | Butterfly score: ${this.butterflyTotal}`);

    if (pending.length > 0) {
      lines.push(`Pending consequences: ${pending.length} (weave them into narration when conditions are met)`);
      // Show up to 3 most relevant pending consequences
      const relevant = pending.slice(-3);
      for (const con of relevant) {
        lines.push(`  - "${con.notification}" (fires at or after turn ${con.triggerTurn ?? "?"})`);
      }
    }

    const topTags = [...this.tagAccumulator.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    if (topTags.length > 0) {
      lines.push(`Player tendencies: ${topTags.map(([t, w]) => `${t}(${w})`).join(", ")}`);
    }

    return lines.join("\n");
  }

  // -----------------------------------------------------------------------
  // Serialization
  // -----------------------------------------------------------------------

  serialize(): string {
    return JSON.stringify({
      choices: this.choices,
      consequences: this.consequences,
      butterflyTotal: this.butterflyTotal,
      turnCount: this.turnCount,
      tagAccumulator: Object.fromEntries(this.tagAccumulator),
      nextChoiceId,
      nextConsequenceId,
    });
  }

  deserialize(data: string): void {
    const parsed = JSON.parse(data);
    this.choices = parsed.choices ?? [];
    this.consequences = parsed.consequences ?? [];
    this.butterflyTotal = parsed.butterflyTotal ?? 0;
    this.turnCount = parsed.turnCount ?? 0;
    this.tagAccumulator = new Map(Object.entries(parsed.tagAccumulator ?? {}));
    nextChoiceId = parsed.nextChoiceId ?? this.choices.length + 1;
    nextConsequenceId = parsed.nextConsequenceId ?? this.consequences.length + 1;
  }
}
