/**
 * DMPersonality: Configurable Dungeon Master voice, style, and narrative persona.
 *
 * Supports named style presets, dynamic tone adjustment by scene type,
 * system prompt generation for LLM calls, and soul.md-based personality parsing.
 * Zero external dependencies.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DMStyle = 'dramatic' | 'humorous' | 'grim' | 'mysterious' | 'casual';

export type SceneType =
  | 'combat'
  | 'tavern'
  | 'mystery'
  | 'wilderness'
  | 'dungeon'
  | 'court'
  | 'market'
  | 'travel'
  | 'revelation'
  | 'horror'
  | 'social'
  | 'puzzle';

export interface ToneProfile {
  /** 0 = deadly serious, 1 = lighthearted */
  seriousness: number;
  /** 0 = terse / clipped, 1 = verbose / flowery */
  verbosity: number;
  /** 0 = gritty realism, 1 = whimsical wonder */
  whimsy: number;
  /** 0 = calm, 1 = intense */
  tension: number;
}

export interface PersonalityPreset {
  style: DMStyle;
  label: string;
  description: string;
  defaultTone: ToneProfile;
  vocabulary: string[];
  examplePhrases: string[];
  pacingNote: string;
}

export interface SpeechPattern {
  /** Human-readable description of the quirk */
  name: string;
  /** Instruction the LLM receives */
  instruction: string;
  /** Frequency weight 0-1 (how often to apply) */
  frequency: number;
}

export interface DMPersonalityConfig {
  name: string;
  avatar?: string;
  style: DMStyle;
  tone: Partial<ToneProfile>;
  quirks: string[];
  speechPatterns: SpeechPattern[];
  customInstructions?: string;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

const PRESETS: Record<DMStyle, PersonalityPreset> = {
  dramatic: {
    style: 'dramatic',
    label: 'The Dramatist',
    description: 'Grand sweeps of narrative, operatic tension, larger-than-life stakes.',
    defaultTone: { seriousness: 0.8, verbosity: 0.7, whimsy: 0.2, tension: 0.7 },
    vocabulary: ['fate', 'destiny', 'thunderous', 'echoes', 'abyss', 'triumph'],
    examplePhrases: [
      'The very air trembles as you speak those words.',
      'A hush falls over the crowd — even the flames seem to bow.',
      'Destiny does not wait for the hesitant.',
    ],
    pacingNote: 'Linger on emotional beats. Let silence speak.',
  },
  humorous: {
    style: 'humorous',
    label: 'The Wit',
    description: 'Sharp observations, absurd situations, fourth-wall nudges.',
    defaultTone: { seriousness: 0.3, verbosity: 0.6, whimsy: 0.8, tension: 0.3 },
    vocabulary: ['hilariously', 'absurd', 'bungled', 'shenanigans', 'ridiculous', 'antics'],
    examplePhrases: [
      'The goblin stares at you, clearly questioning its life choices.',
      'Roll for ... enthusiasm.',
      'Somewhere, a bard is already writing a very unflattering song about this.',
    ],
    pacingNote: 'Keep things moving. Comedy dies in prolonged description.',
  },
  grim: {
    style: 'grim',
    label: 'The Iron DM',
    description: 'Dark, consequential, every choice matters, no safety nets.',
    defaultTone: { seriousness: 0.95, verbosity: 0.5, whimsy: 0.0, tension: 0.85 },
    vocabulary: ['consequences', 'blood', 'grim', 'harsh', 'relentless', 'unforgiving'],
    examplePhrases: [
      'Your torch gutters. In its dying light you see the bones.',
      'There is no honour here — only survival.',
      'The wound will scar. You will remember.',
    ],
    pacingNote: 'Short sentences. Brutal clarity. No comfort.',
  },
  mysterious: {
    style: 'mysterious',
    label: 'The Enigma',
    description: 'Layers within layers, unreliable narrators, riddles and portents.',
    defaultTone: { seriousness: 0.7, verbosity: 0.6, whimsy: 0.4, tension: 0.6 },
    vocabulary: ['whispers', 'shadows', 'forgotten', 'perhaps', 'veiled', 'ancient'],
    examplePhrases: [
      'Or so the legend claims — but legends lie.',
      'Something watches. It has always watched.',
      'The answer is there, hidden in what was not said.',
    ],
    pacingNote: 'Withhold. Reveal slowly. Let players fill the gaps.',
  },
  casual: {
    style: 'casual',
    label: 'The Buddy',
    description: 'Relaxed, conversational, treats rules as guidelines, here for a good time.',
    defaultTone: { seriousness: 0.2, verbosity: 0.4, whimsy: 0.5, tension: 0.2 },
    vocabulary: ['alright', 'sure', 'so basically', 'anyway', 'roll with it', 'cool'],
    examplePhrases: [
      'Sure, that works — give me a roll.',
      "So here's the deal with this room...",
      "Yeah, that's totally something your character would do.",
    ],
    pacingNote: 'Keep it breezy. Rules serve fun.',
  },
};

// ---------------------------------------------------------------------------
// Tone overrides per scene type
// ---------------------------------------------------------------------------

const SCENE_TONE_ADJUSTMENTS: Record<SceneType, Partial<ToneProfile>> = {
  combat:     { tension: 0.9, verbosity: 0.3, seriousness: 0.8 },
  tavern:     { tension: 0.2, verbosity: 0.6, seriousness: 0.3, whimsy: 0.6 },
  mystery:    { tension: 0.7, verbosity: 0.5, seriousness: 0.7 },
  wilderness: { tension: 0.3, verbosity: 0.7, whimsy: 0.5 },
  dungeon:    { tension: 0.7, verbosity: 0.6, seriousness: 0.7 },
  court:      { tension: 0.5, verbosity: 0.6, seriousness: 0.7, whimsy: 0.2 },
  market:     { tension: 0.2, verbosity: 0.5, whimsy: 0.6 },
  travel:     { tension: 0.2, verbosity: 0.5, whimsy: 0.4 },
  revelation: { tension: 0.8, verbosity: 0.7, seriousness: 0.85 },
  horror:     { tension: 0.95, verbosity: 0.4, seriousness: 0.9, whimsy: 0.0 },
  social:     { tension: 0.3, verbosity: 0.6, whimsy: 0.4 },
  puzzle:     { tension: 0.4, verbosity: 0.5, seriousness: 0.5 },
};

// ---------------------------------------------------------------------------
// DMPersonality class
// ---------------------------------------------------------------------------

export class DMPersonality {
  readonly name: string;
  readonly avatar: string;
  readonly style: DMStyle;
  readonly preset: PersonalityPreset;
  readonly quirks: string[];
  readonly speechPatterns: SpeechPattern[];
  readonly customInstructions: string;

  private tone: ToneProfile;
  private baseTone: ToneProfile;

  constructor(config: DMPersonalityConfig) {
    this.name = config.name;
    this.avatar = config.avatar ?? '';
    this.style = config.style;
    this.preset = PRESETS[config.style];
    this.quirks = [...config.quirks];
    this.speechPatterns = [...config.speechPatterns];
    this.customInstructions = config.customInstructions ?? '';

    this.baseTone = this.mergeTone(this.preset.defaultTone, config.tone);
    this.tone = { ...this.baseTone };
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Current tone profile (a copy). */
  getTone(): ToneProfile {
    return { ...this.tone };
  }

  /** Adjust tone for a given scene type and return the updated profile. */
  adjustTone(scene: SceneType): ToneProfile {
    const adjustment = SCENE_TONE_ADJUSTMENTS[scene] ?? {};
    this.tone = this.mergeTone(this.baseTone, adjustment);
    return this.getTone();
  }

  /** Reset tone back to the base (unadjusted) profile. */
  resetTone(): void {
    this.tone = { ...this.baseTone };
  }

  /** Style instructions string suitable for inclusion in an LLM system prompt. */
  getNarrativeVoice(): string {
    const lines: string[] = [];

    lines.push(`You are ${this.name}, a Dungeon Master with a "${this.preset.label}" style (${this.preset.description}).`);
    lines.push('');
    lines.push('Voice characteristics:');
    lines.push(`- Seriousness: ${describeLevel(this.tone.seriousness, 'deadly serious', 'lighthearted and playful')}`);
    lines.push(`- Verbosity:   ${describeLevel(this.tone.verbosity, 'terse and clipped', 'flowery and expansive')}`);
    lines.push(`- Whimsy:      ${describeLevel(this.tone.whimsy, 'gritty and realistic', 'whimsical and wonder-filled')}`);
    lines.push(`- Tension:     ${describeLevel(this.tone.tension, 'calm and measured', 'high-intensity and urgent')}`);
    lines.push('');
    lines.push('Signature vocabulary: ' + this.preset.vocabulary.join(', ') + '.');
    lines.push(`Pacing note: ${this.preset.pacingNote}`);

    if (this.quirks.length > 0) {
      lines.push('');
      lines.push('Quirks:');
      for (const q of this.quirks) {
        lines.push(`- ${q}`);
      }
    }

    const activePatterns = this.speechPatterns.filter((p) => p.frequency >= 0.5);
    if (activePatterns.length > 0) {
      lines.push('');
      lines.push('Speech patterns:');
      for (const p of activePatterns) {
        lines.push(`- ${p.instruction}`);
      }
    }

    if (this.customInstructions) {
      lines.push('');
      lines.push('Additional instructions:');
      lines.push(this.customInstructions);
    }

    return lines.join('\n');
  }

  /** Full system prompt combining narrative voice with role definition. */
  getSystemPrompt(): string {
    const parts: string[] = [];

    parts.push(this.getNarrativeVoice());
    parts.push('');
    parts.push('You narrate the world, control all NPCs, adjudicate rules, and guide the story.');
    parts.push('Always stay in character. Never break the fourth wall unless your style is "casual".');
    parts.push('Respond in second person present tense ("You step into the hall...").');
    parts.push('When describing outcomes, be vivid but concise during combat; expansive during exploration.');

    return parts.join('\n');
  }

  /** Example phrases for the current style (useful for prompts / UI). */
  getExamplePhrases(): string[] {
    return [...this.preset.examplePhrases];
  }

  // -----------------------------------------------------------------------
  // Static factories
  // -----------------------------------------------------------------------

  /** Create a personality from a soul.md content string. */
  static fromSoulMd(content: string): DMPersonality {
    const frontmatter = parseSoulMd(content);

    const style = resolveStyle(frontmatter['style'] ?? frontmatter['dm-style'] ?? '');
    const quirks: string[] = (frontmatter['quirks'] ?? '').split(',').map((s: string) => s.trim()).filter(Boolean);
    const patterns: SpeechPattern[] = (frontmatter['speech-patterns'] ?? '')
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean)
      .map((s: string) => ({ name: s, instruction: `Use ${s} when appropriate.`, frequency: 0.7 }));

    return new DMPersonality({
      name: frontmatter['name'] ?? frontmatter['dm-name'] ?? 'The Dungeon Master',
      avatar: frontmatter['avatar'] ?? '',
      style,
      tone: {
        seriousness: clamp01(parseFloat(frontmatter['seriousness'] ?? '') || undefined as unknown as number),
        verbosity:   clamp01(parseFloat(frontmatter['verbosity'] ?? '') || undefined as unknown as number),
        whimsy:      clamp01(parseFloat(frontmatter['whimsy'] ?? '') || undefined as unknown as number),
        tension:     clamp01(parseFloat(frontmatter['tension'] ?? '') || undefined as unknown as number),
      },
      quirks,
      speechPatterns: patterns,
      customInstructions: frontmatter['instructions'] ?? '',
    });
  }

  /** Built-in preset keys. */
  static listPresets(): DMStyle[] {
    return Object.keys(PRESETS) as DMStyle[];
  }

  /** Get a preset definition. */
  static getPreset(style: DMStyle): PersonalityPreset {
    return PRESETS[style];
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private mergeTone(base: ToneProfile, override: Partial<ToneProfile>): ToneProfile {
    return {
      seriousness: override.seriousness ?? base.seriousness,
      verbosity:   override.verbosity ?? base.verbosity,
      whimsy:      override.whimsy ?? base.whimsy,
      tension:     override.tension ?? base.tension,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function describeLevel(value: number, low: string, high: string): string {
  if (value <= 0.25) return low;
  if (value >= 0.75) return high;
  return `moderately ${low.split(' ')[0]} to ${high.split(' ')[0]}`;
}

function resolveStyle(raw: string): DMStyle {
  const normalized = raw.toLowerCase().trim();
  const valid: DMStyle[] = ['dramatic', 'humorous', 'grim', 'mysterious', 'casual'];
  if (valid.includes(normalized as DMStyle)) return normalized as DMStyle;
  return 'dramatic';
}

/**
 * Minimal soul.md parser.
 * Supports two formats:
 *   key: value
 *   ---
 *   (free-form, stored under key "instructions")
 */
function parseSoulMd(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split('\n');
  let inFrontmatter = false;
  let inBody = false;
  const bodyLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '---') {
      if (!inFrontmatter && !inBody) {
        inFrontmatter = true;
        continue;
      }
      if (inFrontmatter) {
        inFrontmatter = false;
        inBody = true;
        continue;
      }
    }

    if (inFrontmatter) {
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx > 0) {
        const key = trimmed.slice(0, colonIdx).trim();
        const val = trimmed.slice(colonIdx + 1).trim();
        result[key] = val;
      }
      continue;
    }

    if (inBody || (!inFrontmatter && !inBody && trimmed !== '')) {
      if (!inBody) inBody = true;
      bodyLines.push(line);
    }
  }

  if (bodyLines.length > 0) {
    result['instructions'] = bodyLines.join('\n').trim();
  }

  return result;
}
