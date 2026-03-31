/**
 * NarrativeGenerator: Story generation, pacing, foreshadowing, and callbacks.
 *
 * Manages narrative intensity curves, plants seeds for future events,
 * references earlier events for continuity, and generates narration
 * tailored to scene type and pacing context.
 * Zero external dependencies.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SceneType =
  | 'action'
  | 'dialogue'
  | 'exploration'
  | 'revelation'
  | 'rest'
  | 'transition'
  | 'combat'
  | 'social'
  | 'puzzle'
  | 'horror';

export type NarrativeArc =
  | 'exposition'
  | 'rising_action'
  | 'climax'
  | 'falling_action'
  | 'resolution';

export type DescriptionRichness = 'brief' | 'moderate' | 'detailed';

export type Mood =
  | 'hopeful'
  | 'tense'
  | 'mysterious'
  | 'joyful'
  | 'melancholic'
  | 'fearful'
  | 'wonder'
  | 'grim'
  | 'neutral';

export interface PlayerAction {
  type: string;
  description: string;
  actor: string;
  target?: string;
  result?: string;
}

export interface GameContext {
  location: string;
  sceneType: SceneType;
  currentArc: NarrativeArc;
  activeNPCs: string[];
  timeOfDay?: string;
  weather?: string;
  previousEvents: string[];
  sessionNumber: number;
  turnNumber: number;
  mood: Mood;
}

export interface ForeshadowSeed {
  id: string;
  description: string;
  plantedAt: { session: number; turn: number };
  resolvedAt: { session: number; turn: number } | null;
  relatedEvent?: string;
  hintPhrases: string[];
}

export interface CallbackReference {
  id: string;
  eventDescription: string;
  session: number;
  turn: number;
  emotionalWeight: number; // 0-1
  referencedBy: string[];
}

export interface PacingState {
  /** Rolling intensity 0-100 tracked across turns. */
  intensity: number;
  /** Recent intensity values for curve analysis. */
  history: number[];
  /** How many turns since last combat. */
  turnsSinceCombat: number;
  /** How many turns since last rest. */
  turnsSinceRest: number;
  /** How many turns since last dialogue. */
  turnsSinceDialogue: number;
  /** Current narrative arc. */
  arc: NarrativeArc;
  /** Current mood. */
  mood: Mood;
}

export interface NarrativeConfig {
  /** Target average intensity (0-100). Default 50. */
  targetIntensity: number;
  /** Maximum intensity spike allowed in a single turn. Default 30. */
  maxIntensityDelta: number;
  /** How many turns of high intensity before a mandatory cooldown. Default 6. */
  highIntensityCooldownTurns: number;
  /** Richness preference. Default 'moderate'. */
  defaultRichness: DescriptionRichness;
}

// ---------------------------------------------------------------------------
// Scene templates
// ---------------------------------------------------------------------------

const SCENE_DESCRIPTIONS: Record<SceneType, { opening: string[]; richness: DescriptionRichness }> = {
  action:      { opening: ['The moment snaps into focus.', 'Everything happens at once.', 'Time slows — then explodes.'], richness: 'brief' },
  combat:      { opening: ['Steel rings out.', 'Battle is joined.', 'The air fills with violence.'], richness: 'brief' },
  dialogue:    { opening: ['Words hang in the air.', 'The conversation turns.', 'A pause — then the truth emerges.'], richness: 'moderate' },
  exploration: { opening: ['Before you stretches the unknown.', 'Every corner promises discovery.', 'The world opens up.'], richness: 'detailed' },
  revelation:  { opening: ['Everything you thought you knew shifts.', 'The truth reveals itself.', 'A single detail changes everything.'], richness: 'detailed' },
  rest:        { opening: ['The fire crackles softly.', 'For a moment, there is peace.', 'Wounds are tended. Stories are shared.'], richness: 'moderate' },
  transition:  { opening: ['The road stretches onward.', 'Time passes.', 'The landscape shifts around you.'], richness: 'brief' },
  social:      { opening: ['The room watches you.', 'Conversations hum around you.', 'All eyes turn your way.'], richness: 'moderate' },
  puzzle:      { opening: ['Something here is not what it seems.', 'A challenge presents itself.', 'The answer is hidden in plain sight.'], richness: 'detailed' },
  horror:      { opening: ['Something is very, very wrong.', 'The shadows move wrong.', 'A cold dread settles in.'], richness: 'moderate' },
};

// ---------------------------------------------------------------------------
// NarrativeGenerator class
// ---------------------------------------------------------------------------

export class NarrativeGenerator {
  private pacing: PacingState;
  private config: NarrativeConfig;
  private foreshadowing: Map<string, ForeshadowSeed>;
  private callbacks: Map<string, CallbackReference>;
  private seedCounter: number;
  private callbackCounter: number;

  constructor(config?: Partial<NarrativeConfig>) {
    this.config = {
      targetIntensity: config?.targetIntensity ?? 50,
      maxIntensityDelta: config?.maxIntensityDelta ?? 30,
      highIntensityCooldownTurns: config?.highIntensityCooldownTurns ?? 6,
      defaultRichness: config?.defaultRichness ?? 'moderate',
    };

    this.pacing = {
      intensity: 30,
      history: [30],
      turnsSinceCombat: 10,
      turnsSinceRest: 5,
      turnsSinceDialogue: 3,
      arc: 'exposition',
      mood: 'neutral',
    };

    this.foreshadowing = new Map();
    this.callbacks = new Map();
    this.seedCounter = 0;
    this.callbackCounter = 0;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Generate a narrative description for a player action within the given context.
   * Returns the narration text. Does NOT call an LLM — this produces structural
   * framing and pacing instructions that would accompany an LLM prompt.
   */
  generateNarration(context: GameContext, action: PlayerAction): string {
    this.updatePacing(context, action);
    this.advanceArc(context);

    const richness = this.resolveRichness(context.sceneType);
    const template = SCENE_DESCRIPTIONS[context.sceneType] ?? SCENE_DESCRIPTIONS['transition'];
    const opening = pickRandom(template.opening);

    const parts: string[] = [];

    // Opening beat
    parts.push(opening);

    // Action narration based on richness
    if (richness === 'brief') {
      parts.push(`${action.actor} ${action.description}.`);
    } else if (richness === 'moderate') {
      parts.push(this.expandNarration(context, action, 1));
    } else {
      parts.push(this.expandNarration(context, action, 2));
    }

    // Check for applicable foreshadowing hints
    const activeHint = this.findActiveHint(context);
    if (activeHint) {
      parts.push(activeHint);
    }

    // Check for callback opportunities
    const callback = this.findCallback(context);
    if (callback) {
      parts.push(callback);
    }

    // Mood shift note
    if (context.mood !== this.pacing.mood) {
      parts.push(this.moodTransitionNote(this.pacing.mood, context.mood));
      this.pacing.mood = context.mood;
    }

    return parts.join(' ');
  }

  /** Compute pacing metrics for the current scene and return updated state. */
  paceScene(sceneType: SceneType): PacingState {
    const intensityMap: Record<SceneType, number> = {
      action: 80, combat: 90, dialogue: 30, exploration: 40,
      revelation: 70, rest: 15, transition: 20, social: 35,
      puzzle: 50, horror: 75,
    };

    const target = intensityMap[sceneType] ?? 40;
    const delta = Math.min(this.config.maxIntensityDelta, Math.abs(target - this.pacing.intensity));
    const direction = target > this.pacing.intensity ? 1 : -1;

    this.pacing.intensity = clamp(this.pacing.intensity + delta * direction, 0, 100);
    this.pushHistory(this.pacing.intensity);

    // Track scene-type-specific counters
    if (sceneType === 'combat' || sceneType === 'action') {
      this.pacing.turnsSinceCombat = 0;
    } else {
      this.pacing.turnsSinceCombat++;
    }
    if (sceneType === 'rest') {
      this.pacing.turnsSinceRest = 0;
    } else {
      this.pacing.turnsSinceRest++;
    }
    if (sceneType === 'dialogue' || sceneType === 'social') {
      this.pacing.turnsSinceDialogue = 0;
    } else {
      this.pacing.turnsSinceDialogue++;
    }

    // Enforce cooldown after sustained high intensity
    if (this.sustainedHighIntensity() && sceneType !== 'rest') {
      this.pacing.intensity = Math.max(20, this.pacing.intensity - 20);
    }

    return this.getPacingState();
  }

  /** Plant a foreshadowing seed for future payoff. */
  plantForeshadowing(description: string, hintPhrases: string[], relatedEvent?: string): ForeshadowSeed {
    const id = `seed-${++this.seedCounter}`;
    const seed: ForeshadowSeed = {
      id,
      description,
      plantedAt: { session: 0, turn: 0 }, // Caller should update via context
      resolvedAt: null,
      relatedEvent,
      hintPhrases: [...hintPhrases],
    };
    this.foreshadowing.set(id, seed);
    return { ...seed };
  }

  /** Resolve a foreshadowing seed (the payoff). */
  resolveForeshadowing(seedId: string): ForeshadowSeed | null {
    const seed = this.foreshadowing.get(seedId);
    if (!seed || seed.resolvedAt !== null) return null;

    const resolved = { ...seed, resolvedAt: { session: 0, turn: 0 } };
    this.foreshadowing.set(seedId, resolved);
    return { ...resolved };
  }

  /** Get all unresolved foreshadowing seeds. */
  getUnresolvedSeeds(): ForeshadowSeed[] {
    return [...this.foreshadowing.values()].filter((s) => s.resolvedAt === null);
  }

  /** Register an event as a callback-able reference point. */
  registerCallback(eventDescription: string, emotionalWeight: number): CallbackReference {
    const id = `cb-${++this.callbackCounter}`;
    const cb: CallbackReference = {
      id,
      eventDescription,
      session: 0,
      turn: 0,
      emotionalWeight: clamp(emotionalWeight, 0, 1),
      referencedBy: [],
    };
    this.callbacks.set(id, cb);
    return { ...cb };
  }

  /** Record that a callback was referenced (for tracking). */
  referenceCallback(callbackId: string, referenceContext: string): void {
    const cb = this.callbacks.get(callbackId);
    if (cb) {
      cb.referencedBy.push(referenceContext);
    }
  }

  /** Get all registered callbacks. */
  getCallbacks(): CallbackReference[] {
    return [...this.callbacks.values()].map((cb) => ({ ...cb }));
  }

  /** Generate a cliffhanger ending for a session break. */
  generateCliffhanger(context: GameContext): string {
    const cliffhangers: string[] = [
      `Just as ${pickRandom(context.activeNPCs) || 'someone'} opens their mouth to speak, the ground trembles beneath your feet.`,
      `The ${context.timeOfDay ?? 'night'} is suddenly shattered by a sound you haven't heard before.`,
      `You notice something that changes everything — but before you can react, the scene fades to black.`,
      `A figure emerges from the shadows. You recognize the face, but not the expression upon it.`,
      `The answer was always right in front of you. And now, so is the danger.`,
      `Your hand finds the doorknob. Behind you, something whispers your name.`,
    ];
    return pickRandom(cliffhangers);
  }

  /** Get the current pacing state snapshot. */
  getPacingState(): PacingState {
    return {
      ...this.pacing,
      history: [...this.pacing.history],
    };
  }

  /** Update session/turn markers in seeds and callbacks. */
  updateTimestamps(session: number, turn: number): void {
    for (const seed of this.foreshadowing.values()) {
      if (seed.plantedAt.session === 0 && seed.plantedAt.turn === 0) {
        seed.plantedAt = { session, turn };
      }
    }
    for (const cb of this.callbacks.values()) {
      if (cb.session === 0 && cb.turn === 0) {
        cb.session = session;
        cb.turn = turn;
      }
    }
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private updatePacing(context: GameContext, action: PlayerAction): void {
    this.paceScene(context.sceneType);

    // Action-type intensity modifiers
    const typeModifiers: Record<string, number> = {
      attack: 15, cast: 12, defend: 8, flee: 20, grapple: 10,
      search: 5, investigate: 8, persuade: 5, intimidate: 10,
      stealth: 8, rest: -15, help: 5,
    };
    const mod = typeModifiers[action.type] ?? 0;
    this.pacing.intensity = clamp(this.pacing.intensity + mod, 0, 100);
    this.pushHistory(this.pacing.intensity);
  }

  private advanceArc(context: GameContext): void {
    const { intensity } = this.pacing;
    const currentIdx = ARC_ORDER.indexOf(this.pacing.arc);

    if (currentIdx < ARC_ORDER.indexOf('climax') && intensity > 80 && context.turnNumber > 5) {
      this.pacing.arc = 'climax';
    } else if (currentIdx < ARC_ORDER.indexOf('rising_action') && intensity > 55) {
      this.pacing.arc = 'rising_action';
    } else if (this.pacing.arc === 'climax' && intensity < 40) {
      this.pacing.arc = 'falling_action';
    } else if (this.pacing.arc === 'falling_action' && intensity < 20) {
      this.pacing.arc = 'resolution';
    }
  }

  private resolveRichness(sceneType: SceneType): DescriptionRichness {
    const scene = SCENE_DESCRIPTIONS[sceneType];
    return scene?.richness ?? this.config.defaultRichness;
  }

  private expandNarration(context: GameContext, action: PlayerAction, depth: number): string {
    const atmosphere = this.buildAtmosphere(context);
    const base = `${action.actor} ${action.description}.`;

    if (depth <= 1) {
      return `${atmosphere} ${base}`;
    }

    const sensory = this.sensoryDetail(context);
    const emotional = this.emotionalUndertone(context.mood);
    return `${atmosphere} ${base} ${sensory} ${emotional}`;
  }

  private buildAtmosphere(context: GameContext): string {
    const parts: string[] = [];
    if (context.weather) parts.push(`The ${context.weather} ${context.weather === 'rain' || context.weather === 'snow' ? 'falls' : 'lingers'} overhead.`);
    if (context.timeOfDay) parts.push(`${capitalize(context.timeOfDay)} light ${context.timeOfDay === 'night' ? 'barely reaches' : 'filters into'} the ${context.location}.`);
    if (parts.length === 0) parts.push(`The ${context.location} surrounds you.`);
    return parts.join(' ');
  }

  private sensoryDetail(context: GameContext): string {
    const details: Record<string, string[]> = {
      dungeon:    ['Dripping water echoes in the dark.', 'The stone is slick with moisture.'],
      wilderness: ['The scent of pine fills the air.', 'Birdsong punctuates the silence.'],
      tavern:     ['The smell of roasting meat and spilled ale mixes in the warm air.', 'Laughter and clinking mugs fill the room.'],
      city:       ['Street vendors hawk their wares.', 'The press of bodies never quite lets up.'],
      cave:       ['Your torch sputters against the damp air.', 'The darkness seems to swallow light.'],
    };

    const locKey = Object.keys(details).find((k) => context.location.toLowerCase().includes(k));
    if (locKey) return pickRandom(details[locKey]);
    return 'Your senses sharpen.';
  }

  private emotionalUndertone(mood: Mood): string {
    const undertones: Record<Mood, string> = {
      hopeful:    'A fragile thread of optimism weaves through the moment.',
      tense:      'Every nerve is drawn taut.',
      mysterious: 'Something lingers just beyond understanding.',
      joyful:     'Lightness fills the air.',
      melancholic: 'A bittersweet weight settles over the scene.',
      fearful:    'Fear coils in your chest.',
      wonder:     'Awe steals your breath.',
      grim:       'There is no comfort here.',
      neutral:    '',
    };
    return undertones[mood] ?? '';
  }

  private findActiveHint(context: GameContext): string | null {
    const unresolved = this.getUnresolvedSeeds();
    if (unresolved.length === 0) return null;

    // Low probability of dropping a hint each turn (roughly 20%)
    if (Math.random() > 0.2) return null;

    const seed = pickRandom(unresolved);
    if (seed.hintPhrases.length === 0) return null;
    return pickRandom(seed.hintPhrases);
  }

  private findCallback(context: GameContext): string | null {
    if (this.callbacks.size === 0) return null;

    // Look for emotionally heavy callbacks that haven't been referenced too often
    const candidates = [...this.callbacks.values()].filter(
      (cb) => cb.emotionalWeight >= 0.6 && cb.referencedBy.length < 3
    );
    if (candidates.length === 0) return null;

    // Roughly 15% chance per turn
    if (Math.random() > 0.15) return null;

    const cb = pickRandom(candidates);
    this.referenceCallback(cb.id, `session:${context.sessionNumber} turn:${context.turnNumber}`);
    return `You are reminded of what happened before — ${cb.eventDescription}.`;
  }

  private moodTransitionNote(from: Mood, to: Mood): string {
    if (from === to) return '';
    return `The mood shifts from ${from} to ${to}.`;
  }

  private pushHistory(value: number): void {
    this.pacing.history.push(value);
    if (this.pacing.history.length > 100) {
      this.pacing.history = this.pacing.history.slice(-50);
    }
  }

  private sustainedHighIntensity(): boolean {
    const window = this.pacing.history.slice(-this.config.highIntensityCooldownTurns);
    return window.length >= this.config.highIntensityCooldownTurns && window.every((v) => v >= 75);
  }
}

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const ARC_ORDER: NarrativeArc[] = ['exposition', 'rising_action', 'climax', 'falling_action', 'resolution'];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
