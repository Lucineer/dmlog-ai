/**
 * Surprise Generator — memorable moments, plot twists, and dramatic events.
 *
 * Generates context-weighted random encounters, plot twists, environmental
 * events, and perfectly-timed surprises. Each surprise is tagged and stored
 * so the DM can maintain consistency.
 *
 * Storage: KV at campaign/{id}/surprises.json
 */

import { DiceRoller } from "./dice.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SurpriseType =
  | "random_encounter"    // unexpected NPC or creature
  | "plot_twist"          // revelation that changes the story
  | "environmental"       // natural or magical event
  | "character_moment"    // PC-specific dramatic moment
  | "npc_reveal"          // NPC shows their true nature
  | "mystery"             // unexplained event or clue
  | "comic_relief"        // lightens the mood
  | "omen";               // foreshadowing

export type StoryPhase = "exposition" | "rising_action" | "climax" | "falling_action" | "resolution";

export type SurpriseMood = "wonder" | "terror" | "humor" | "intrigue" | "triumph" | "melancholy" | "chaos";

export interface Surprise {
  id: string;
  type: SurpriseType;
  mood: SurpriseMood;
  title: string;
  description: string;           // DM narration text
  playerPrompt: string;          // what the player can react to
  consequences: string[];        // possible narrative consequences
  tags: string[];
  weight: number;                // how likely this was (lower = more surprising)
  turn: number;
  timestamp: number;
  storyPhase: StoryPhase;
  used: boolean;                 // prevent reuse
}

export interface SurpriseContext {
  turnCount: number;
  currentScene: string;
  combatActive: boolean;
  npcIds: string[];
  questNames: string[];
  storyPhase: StoryPhase;
  recentEvents: string[];        // last 3-5 narrative summaries
  playerTags: string[];          // player tendency tags from consequences
  surpriseHistory: Surprise[];   // previous surprises
}

// ---------------------------------------------------------------------------
// Encounter tables — weighted by story context
// ---------------------------------------------------------------------------

interface SurpriseTemplate {
  type: SurpriseType;
  mood: SurpriseMood;
  title: string;
  description: string;
  playerPrompt: string;
  consequences: string[];
  tags: string[];
  phaseWeight: Partial<Record<StoryPhase, number>>;  // higher = more likely in that phase
  minTurn: number;   // don't show before this turn
}

const SURPRISE_TEMPLATES: SurpriseTemplate[] = [
  // --- Random Encounters ---
  {
    type: "random_encounter", mood: "intrigue",
    title: "The Mysterious Stranger",
    description: "A cloaked figure emerges from the shadows. They wear a mask of polished silver, and their voice carries an accent you cannot place. They have a proposition — dangerous, lucrative, and entirely illegal.",
    playerPrompt: "The stranger extends a gloved hand. Do you take it?",
    consequences: ["new quest hook", "potential ally or enemy", "moral dilemma"],
    tags: ["mystery", "social", "quest"],
    phaseWeight: { exposition: 5, rising_action: 8, climax: 3 },
    minTurn: 2,
  },
  {
    type: "random_encounter", mood: "terror",
    title: "The Corpse Speaks",
    description: "You find a body — fresh, eyes still wide with terror. But as you approach, its mouth moves. The dead lips form words only you can hear: 'Beware the one who smiles.' Then silence.",
    playerPrompt: "The corpse's warning echoes in your mind. Who smiles at you?",
    consequences: ["foreshadowing villain", "investigation hook", "possible curse"],
    tags: ["horror", "mystery", "foreshadowing"],
    phaseWeight: { rising_action: 7, climax: 4 },
    minTurn: 5,
  },
  {
    type: "random_encounter", mood: "wonder",
    title: "The Fey Crossing",
    description: "The air shimmers, and suddenly the world is... different. Colors are more vivid, sounds more musical, and a path of luminescent mushrooms stretches before you into a forest that wasn't there a moment ago.",
    playerPrompt: "The fey crossing won't last long. Step through, or watch it fade?",
    consequences: ["enter feywild", "gain fey boon or curse", "time distortion"],
    tags: ["fey", "magic", "wonder"],
    phaseWeight: { exposition: 3, rising_action: 6 },
    minTurn: 3,
  },

  // --- Plot Twists ---
  {
    type: "plot_twist", mood: "intrigue",
    title: "The Ally's Secret",
    description: "You discover a letter hidden in your ally's belongings. The seal matches the villain's crest. Your trusted companion has been reporting your every move. But the final line reads: 'Trust no one. I'm playing a longer game.' Are they double agent or true traitor?",
    playerPrompt: "You hold evidence that could destroy your alliance — or reveal a deeper conspiracy.",
    consequences: ["betrayal or loyalty reveal", "shift in party dynamics", "new information source"],
    tags: ["betrayal", "revelation", "conspiracy"],
    phaseWeight: { rising_action: 8, climax: 5 },
    minTurn: 10,
  },
  {
    type: "plot_twist", mood: "chaos",
    title: "The Prophecy Inverts",
    description: "The ancient prophecy you've been following — the one that said you were the chosen one? It was mistranslated. You're not the hero. You're the catalyst. The one whose actions summon the very evil you've been trying to prevent.",
    playerPrompt: "Everything you believed about your quest was wrong. What do you do with this truth?",
    consequences: ["identity crisis", "quest redefinition", "moral reckoning"],
    tags: ["prophecy", "identity", "dark_revelation"],
    phaseWeight: { climax: 9 },
    minTurn: 15,
  },
  {
    type: "plot_twist", mood: "melancholy",
    title: "The Cost of Victory",
    description: "You've won — but at what cost? The artifact you needed to destroy was the only thing keeping the barrier between worlds intact. As it shatters, you feel reality itself shudder. Your victory has opened a door that cannot be closed.",
    playerPrompt: "You succeeded in your mission. The consequences are just beginning.",
    consequences: ["new threat emerges", "guilt and responsibility", "escalating stakes"],
    tags: ["pyrrhic_victory", "consequence", "escalation"],
    phaseWeight: { climax: 7, falling_action: 5 },
    minTurn: 20,
  },

  // --- Environmental Events ---
  {
    type: "environmental", mood: "wonder",
    title: "The Eclipse",
    description: "The sun darkens. Not clouds — an eclipse, unexpected and total. In the sudden twilight, the world holds its breath. Magical energy surges through the air, and for a brief moment, every spell, every enchantment, every hidden magical signature blazes into visibility.",
    playerPrompt: "For one perfect minute, you can see all the magic in the world. What do you look for?",
    consequences: ["reveal hidden magic", "magical surge", "time-sensitive opportunity"],
    tags: ["celestial", "magic", "wonder"],
    phaseWeight: { exposition: 3, rising_action: 6, climax: 4 },
    minTurn: 5,
  },
  {
    type: "environmental", mood: "terror",
    title: "The Earthquake",
    description: "The ground roars. Stone cracks, walls buckle, and the floor splits open. Dust fills the air as the world shakes itself apart. When it stops, the landscape has changed — new passages revealed, old paths sealed, and something ancient stirs in the deep.",
    playerPrompt: "The quake has reshaped your surroundings. New paths await — and new dangers.",
    consequences: ["terrain change", "reveal hidden area", "awaken ancient threat"],
    tags: ["disaster", "revelation", "danger"],
    phaseWeight: { rising_action: 5, climax: 6 },
    minTurn: 8,
  },
  {
    type: "environmental", mood: "chaos",
    title: "The Portal Storm",
    description: "The sky tears open. Not one portal — dozens. They flicker and spin across the horizon like tears in reality itself. Through each, you glimpse different worlds: oceans of fire, cities of crystal, forests of bone. Something is trying to come through all of them at once.",
    playerPrompt: "Portals are opening everywhere. Do you try to close them, or seize the opportunity?",
    consequences: ["interdimensional event", "new locations", "alien threats or allies"],
    tags: ["planar", "chaos", "crisis"],
    phaseWeight: { climax: 8 },
    minTurn: 15,
  },

  // --- NPC Reveals ---
  {
    type: "npc_reveal", mood: "intrigue",
    title: "The Villain Unmasked",
    description: "The face falls away — literally. Your nemesis removes their mask, and beneath it is a face you know. Someone you trusted. Someone who stood beside you. The betrayal is complete, and their smile is the cruelest thing you've ever seen.",
    playerPrompt: "Your enemy has been beside you all along. How do you face them now?",
    consequences: ["major relationship shift", "combat or confrontation", "new understanding of past events"],
    tags: ["betrayal", "revelation", "boss_fight"],
    phaseWeight: { climax: 9 },
    minTurn: 12,
  },
  {
    type: "npc_reveal", mood: "wonder",
    title: "The Hidden God",
    description: "The humble shopkeeper, the quiet barmaid, the old man who sells flowers — one of the people you've been ignoring turns out to be a deity in disguise. They've been watching. Waiting. And now they have a gift — or a test.",
    playerPrompt: "A god stands before you in mortal form. They're waiting for your response.",
    consequences: ["divine boon", "geas or quest", "divine attention"],
    tags: ["divine", "revelation", "boon"],
    phaseWeight: { rising_action: 5, climax: 4 },
    minTurn: 10,
  },

  // --- Comic Relief ---
  {
    type: "comic_relief", mood: "humor",
    title: "The Barding Accident",
    description: "A bard stumbles into the scene, lute first, playing a spectacularly wrong note. The resulting magical mishap turns everyone's armor briefly neon pink. The bard looks mortified. 'That... usually doesn't happen.'",
    playerPrompt: "Your armor is pink. The bard is apologizing profusely. What do you do?",
    consequences: ["light moment", "possible bard ally", "embarrassing memory"],
    tags: ["humor", "magic", "social"],
    phaseWeight: { exposition: 4, rising_action: 5, falling_action: 6 },
    minTurn: 1,
  },
  {
    type: "comic_relief", mood: "humor",
    title: "The Mimic That Just Wanted Friends",
    description: "You reach for the chest — and it opens its mouth. But instead of biting, it speaks. 'Finally! Someone almost touched me! I've been so lonely. Would you like a biscuit? I've been saving them.' Inside the mimic are indeed several slightly damp biscuits.",
    playerPrompt: "A lonely mimic offers you biscuits. Do you accept?",
    consequences: ["unlikely ally", "comic relief", "possibly magic biscuits"],
    tags: ["humor", "monster", "unexpected"],
    phaseWeight: { exposition: 4, rising_action: 4 },
    minTurn: 2,
  },

  // --- Omens ---
  {
    type: "omen", mood: "melancholy",
    title: "The Murder of Crows",
    description: "A single crow lands before you and stares. Then another. And another. Soon, dozens of crows line every surface, every branch, every ledge — all watching you in absolute silence. Then, as one, they take flight, forming a shape in the sky that looks disturbingly like a crown. Or a coffin.",
    playerPrompt: "The omen is clear: something is coming for someone important. Is it you?",
    consequences: ["foreshadowing", "approaching danger", "player paranoia"],
    tags: ["omen", "foreshadowing", "death"],
    phaseWeight: { rising_action: 7, climax: 3 },
    minTurn: 4,
  },
  {
    type: "omen", mood: "wonder",
    title: "The Star That Wasn't There",
    description: "A new star appears in the sky, brighter than all others. It wasn't there yesterday. It pulses with a rhythm that matches your heartbeat. As you watch, it slowly descends toward the horizon — toward a specific location on the map you carry.",
    playerPrompt: "A falling star points the way. Do you follow?",
    consequences: ["quest direction", "magical discovery", "destiny invoked"],
    tags: ["celestial", "destiny", "guidance"],
    phaseWeight: { exposition: 5, rising_action: 6 },
    minTurn: 3,
  },

  // --- Character Moments ---
  {
    type: "character_moment", mood: "triumph",
    title: "The Bloodline Awakens",
    description: "Something inside you clicks into place. A power you never knew you had surges through your veins — ancient, wild, and unmistakably yours. Your ancestors call to you across the ages, and for one blazing moment, you understand exactly who you are meant to be.",
    playerPrompt: "Your heritage manifests. What does it reveal about you?",
    consequences: ["power unlock", "character development", "plot hook"],
    tags: ["heritage", "power", "revelation"],
    phaseWeight: { rising_action: 6, climax: 5 },
    minTurn: 8,
  },
  {
    type: "character_moment", mood: "terror",
    title: "The Dark Reflection",
    description: "You catch your reflection in a dark pool — but it moves independently. Your reflection smiles when you don't, and raises a finger to its lips. Then it reaches out of the water, grabs its own face, and peels it back to reveal something else underneath. Something that wears your skin.",
    playerPrompt: "Your reflection knows something you don't. Do you dare ask?",
    consequences: ["doppelganger threat", "self-doubt", "possible curse"],
    tags: ["horror", "identity", "doppelganger"],
    phaseWeight: { rising_action: 6, climax: 4 },
    minTurn: 10,
  },
];

// ---------------------------------------------------------------------------
// Dramatic timing rules
// ---------------------------------------------------------------------------

interface TimingRule {
  description: string;
  check: (ctx: SurpriseContext) => boolean;
  bonusWeight: number;
}

const TIMING_RULES: TimingRule[] = [
  {
    description: "Right after combat ends",
    check: (ctx) => ctx.combatActive === false && ctx.recentEvents.some(e => e.toLowerCase().includes("combat") || e.toLowerCase().includes("attack")),
    bonusWeight: 3,
  },
  {
    description: "During a lull in action",
    check: (ctx) => ctx.turnCount > 5 && ctx.turnCount % 7 === 0,
    bonusWeight: 2,
  },
  {
    description: "Before a major transition",
    check: (ctx) => ctx.storyPhase === "rising_action" && ctx.turnCount > 10,
    bonusWeight: 4,
  },
  {
    description: "After a player choice",
    check: (ctx) => ctx.recentEvents.some(e => e.toLowerCase().includes("choice") || e.toLowerCase().includes("decide")),
    bonusWeight: 3,
  },
];

// ---------------------------------------------------------------------------
// SurpriseGenerator
// ---------------------------------------------------------------------------

let nextSurpriseId = 1;

const dice = new DiceRoller();

export class SurpriseGenerator {
  private history: Surprise[] = [];
  private usedTemplateIndices: Set<number> = new Set();
  private turnCount = 0;

  // -----------------------------------------------------------------------
  // Generation
  // -----------------------------------------------------------------------

  /**
   * Check if a surprise should trigger and generate one if so.
   * Returns null if the timing isn't right.
   */
  maybeGenerate(context: SurpriseContext): Surprise | null {
    this.turnCount = context.turnCount;

    // Base chance: 15% per eligible turn, modified by story phase
    const phaseBonus: Record<StoryPhase, number> = {
      exposition: 0,
      rising_action: 5,
      climax: 15,
      falling_action: -5,
      resolution: -10,
    };
    const baseChance = 15 + (phaseBonus[context.storyPhase] ?? 0);

    // Dramatic timing bonus
    let timingBonus = 0;
    for (const rule of TIMING_RULES) {
      if (rule.check(context)) timingBonus += rule.bonusWeight;
    }

    // Don't overwhelm: reduce chance if recent surprise
    const recentSurprises = this.history.filter(s => context.turnCount - s.turn < 5);
    const fatiguePenalty = recentSurprises.length * 10;

    const finalChance = Math.max(5, Math.min(60, baseChance + timingBonus - fatiguePenalty));

    if (dice.d100() > finalChance) return null;

    return this.generate(context);
  }

  /** Force-generate a surprise (for DM injection or special moments). */
  generate(context: SurpriseContext, preferredType?: SurpriseType): Surprise | null {
    // Filter eligible templates
    let eligible = SURPRISE_TEMPLATES.filter((t, i) => {
      if (this.usedTemplateIndices.has(i) && t.type !== "random_encounter") return false;
      if (context.turnCount < t.minTurn) return false;
      return true;
    });

    if (preferredType) {
      const typed = eligible.filter(t => t.type === preferredType);
      if (typed.length > 0) eligible = typed;
    }

    if (eligible.length === 0) return null;

    // Weight by phase and context
    const weighted = eligible.map((template, idx) => {
      const phaseW = template.phaseWeight[context.storyPhase] ?? 1;
      const usedPenalty = this.usedTemplateIndices.has(SURPRISE_TEMPLATES.indexOf(template)) ? 0.5 : 1;
      const tagMatch = template.tags.filter(t => context.playerTags.includes(t)).length;
      const tagBonus = tagMatch * 1.5;
      return { template, weight: phaseW * usedPenalty + tagBonus, originalIndex: SURPRISE_TEMPLATES.indexOf(template) };
    });

    // Weighted random selection
    const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
    let roll = dice.d100() / 100 * totalWeight;
    let selected = weighted[0];
    for (const w of weighted) {
      roll -= w.weight;
      if (roll <= 0) { selected = w; break; }
    }

    if (!selected) return null;

    const template = selected.template;
    this.usedTemplateIndices.add(selected.originalIndex);

    const surprise: Surprise = {
      id: `surprise_${nextSurpriseId++}_${Date.now().toString(36)}`,
      type: template.type,
      mood: template.mood,
      title: template.title,
      description: this.contextualize(template.description, context),
      playerPrompt: template.playerPrompt,
      consequences: template.consequences,
      tags: template.tags,
      weight: selected.weight,
      turn: context.turnCount,
      timestamp: Date.now(),
      storyPhase: context.storyPhase,
      used: false,
    };

    this.history.push(surprise);
    return surprise;
  }

  private contextualize(description: string, context: SurpriseContext): string {
    return description
      .replace("{scene}", context.currentScene)
      .replace("{npc}", context.npcIds[0] ?? "a stranger")
      .replace("{quest}", context.questNames[0] ?? "your current mission");
  }

  // -----------------------------------------------------------------------
  // History
  // -----------------------------------------------------------------------

  /** Get surprise history. */
  getHistory(limit?: number): Surprise[] {
    return limit ? this.history.slice(-limit) : [...this.history];
  }

  /** Get a summary of past surprises for the LLM context. */
  getHistorySummary(): string {
    if (this.history.length === 0) return "";
    const lines = this.history.slice(-5).map(s =>
      `[Turn ${s.turn}] ${s.title} (${s.type}, ${s.mood})`
    );
    return "## Past Surprises\n" + lines.join("\n");
  }

  // -----------------------------------------------------------------------
  // Serialization
  // -----------------------------------------------------------------------

  serialize(): string {
    return JSON.stringify({
      history: this.history,
      usedTemplateIndices: [...this.usedTemplateIndices],
      turnCount: this.turnCount,
      nextSurpriseId,
    });
  }

  deserialize(data: string): void {
    const parsed = JSON.parse(data);
    this.history = parsed.history ?? [];
    this.usedTemplateIndices = new Set(parsed.usedTemplateIndices ?? []);
    this.turnCount = parsed.turnCount ?? 0;
    nextSurpriseId = parsed.nextSurpriseId ?? this.history.length + 1;
  }
}
