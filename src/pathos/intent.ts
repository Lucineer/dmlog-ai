/**
 * IntentExtractor: Parses natural-language player input into structured game actions.
 *
 * Handles ambiguity detection, multi-intent decomposition, combat-specific
 * intents, context-aware resolution ("do it again"), and clarification
 * question generation.
 * Zero external dependencies.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export enum IntentType {
  ATTACK       = 'attack',
  SEARCH       = 'search',
  TALK         = 'talk',
  MOVE         = 'move',
  USE_ITEM     = 'use_item',
  SKILL_CHECK  = 'skill_check',
  CAST_SPELL   = 'cast_spell',
  REST         = 'rest',
  INVESTIGATE  = 'investigate',
  PERSUADE     = 'persuade',
  INTIMIDATE   = 'intimidate',
  DECEIVE      = 'deceive',
  STEALTH      = 'stealth',
  DEFEND       = 'defend',
  FLEE         = 'flee',
  GRAPPLE      = 'grapple',
  HELP         = 'help',
  OTHER        = 'other',
}

export type CombatIntent =
  | IntentType.ATTACK
  | IntentType.DEFEND
  | IntentType.FLEE
  | IntentType.GRAPPLE
  | IntentType.HELP;

export interface PlayerIntent {
  type: IntentType;
  target: string | null;
  method: string | null;
  modifiers: string[];
  raw: string;
  confidence: number; // 0-1
  ambiguous: boolean;
  ambiguityReason?: string;
}

export interface GameContext {
  location: string;
  visibleEntities: string[];
  activeCombatants: string[];
  inventory: string[];
  knownSpells: string[];
  lastAction: PlayerIntent | null;
  nearbyItems: string[];
  sessionTurn: number;
}

// ---------------------------------------------------------------------------
// Pattern definitions
// -----------------------------------------------------------------------

interface IntentPattern {
  type: IntentType;
  patterns: RegExp[];
  requiresTarget: boolean;
  defaultConfidence: number;
}

const INTENT_PATTERNS: IntentPattern[] = [
  {
    type: IntentType.ATTACK,
    patterns: [
      /\b(i\s+)?(attack|hit|strike|slash|stab|smite|shoot|fire at|swing at|charge at)\b/i,
      /\b(i\s+)?(punch|kick|headbutt|elbow|tackle|smash)\b/i,
    ],
    requiresTarget: true,
    defaultConfidence: 0.85,
  },
  {
    type: IntentType.CAST_SPELL,
    patterns: [
      /\b(i\s+)?cast\s+/i,
      /\b(i\s+)?(fireball|lightning bolt|magic missile|heal|cure|shield spell|counterspell)\b/i,
    ],
    requiresTarget: false,
    defaultConfidence: 0.9,
  },
  {
    type: IntentType.SEARCH,
    patterns: [
      /\b(i\s+)?(search|look around|examine|inspect|check|scan|look (at|for|under|behind|in))\b/i,
      /\b(i\s+)?(rummage|dig through|go through)\b/i,
    ],
    requiresTarget: false,
    defaultConfidence: 0.8,
  },
  {
    type: IntentType.INVESTIGATE,
    patterns: [
      /\b(i\s+)?(investigate|study|analyze|decipher|read|ponder)\b/i,
    ],
    requiresTarget: false,
    defaultConfidence: 0.8,
  },
  {
    type: IntentType.TALK,
    patterns: [
      /\b(i\s+)?(talk to|speak to|speak with|chat with|converse|ask|tell|say to|address)\b/i,
      /\b(i\s+)?(greet|hail|approach)\b/i,
    ],
    requiresTarget: true,
    defaultConfidence: 0.85,
  },
  {
    type: IntentType.PERSUADE,
    patterns: [
      /\b(i\s+)?(persuade|convince|bribe|beg|plead|reason with|negotiate|bargain)\b/i,
    ],
    requiresTarget: true,
    defaultConfidence: 0.85,
  },
  {
    type: IntentType.INTIMIDATE,
    patterns: [
      /\b(i\s+)?(intimidate|threaten|scare|menace|coerce|demand)\b/i,
    ],
    requiresTarget: true,
    defaultConfidence: 0.85,
  },
  {
    type: IntentType.DECEIVE,
    patterns: [
      /\b(i\s+)?(lie to|deceive|trick|bluff|mislead|fool|con)\b/i,
      /\b(i\s+)?(pretend to|fake|fabricate)\b/i,
    ],
    requiresTarget: true,
    defaultConfidence: 0.8,
  },
  {
    type: IntentType.STEALTH,
    patterns: [
      /\b(i\s+)?(sneak|hide|stealth|creep|prowl|slip (away|past|into))\b/i,
      /\b(i\s+)?(move quietly|stay hidden|remain unseen)\b/i,
    ],
    requiresTarget: false,
    defaultConfidence: 0.85,
  },
  {
    type: IntentType.MOVE,
    patterns: [
      /\b(i\s+)?(go to|move to|walk to|run to|head to|enter|leave|exit|climb|descend)\b/i,
      /\b(i\s+)?(go (north|south|east|west|up|down|left|right|forward|back))\b/i,
      /\b(i\s+)?(open (the )?door|open (the )?gate)\b/i,
    ],
    requiresTarget: false,
    defaultConfidence: 0.8,
  },
  {
    type: IntentType.USE_ITEM,
    patterns: [
      /\b(i\s+)?(use|drink|eat|apply|equip|wield|throw|toss)\b/i,
      /\b(i\s+)?(pull out|take out|draw)\b/i,
    ],
    requiresTarget: false,
    defaultConfidence: 0.75,
  },
  {
    type: IntentType.SKILL_CHECK,
    patterns: [
      /\b(i\s+)?(roll|check|try to|attempt)\b/i,
      /\b(i\s+)?(perception|insight|investigation|arcana|history|nature|religion|acrobatics|athletics)\s*(check)?\b/i,
    ],
    requiresTarget: false,
    defaultConfidence: 0.7,
  },
  {
    type: IntentType.REST,
    patterns: [
      /\b(i\s+)?(rest|sleep|take a break|camp|settle down|short rest|long rest|meditate)\b/i,
    ],
    requiresTarget: false,
    defaultConfidence: 0.9,
  },
  {
    type: IntentType.DEFEND,
    patterns: [
      /\b(i\s+)?(defend|block|parry|dodge|brace|take cover|hunker down)\b/i,
    ],
    requiresTarget: false,
    defaultConfidence: 0.85,
  },
  {
    type: IntentType.FLEE,
    patterns: [
      /\b(i\s+)?(flee|run away|retreat|escape|get out|bolt)\b/i,
    ],
    requiresTarget: false,
    defaultConfidence: 0.9,
  },
  {
    type: IntentType.GRAPPLE,
    patterns: [
      /\b(i\s+)?(grapple|grab|seize|restrain|pin|tackle|hold)\b/i,
    ],
    requiresTarget: true,
    defaultConfidence: 0.8,
  },
  {
    type: IntentType.HELP,
    patterns: [
      /\b(i\s+)?(help|assist|aid|support|heal|stabilize)\b/i,
    ],
    requiresTarget: true,
    defaultConfidence: 0.85,
  },
];

// Modifiers that describe HOW an action is performed
const MODIFIER_PATTERNS: { pattern: RegExp; modifier: string }[] = [
  { pattern: /\b(sneakily|quietly|silently|stealthily|carefully|cautiously)\b/i, modifier: 'stealthy' },
  { pattern: /\b(aggressively|viciously|ferociously|savagely|recklessly)\b/i,    modifier: 'aggressive' },
  { pattern: /\b(carefully|gently|delicately|precisely|meticulously)\b/i,         modifier: 'careful' },
  { pattern: /\b(quickly|swiftly|hastily|rapidly| hastily)\b/i,                  modifier: 'hasty' },
  { pattern: /\b(bravely|boldly|fearlessly|courageously|valiantly)\b/i,           modifier: 'brave' },
  { pattern: /\b(secretly|covertly|discreetly|subtly)\b/i,                       modifier: 'covert' },
  { pattern: /\b(loudly|noisily|boisterously)\b/i,                               modifier: 'loud' },
  { pattern: /\b(desperately|frantically|panicked(ly)?)\b/i,                     modifier: 'desperate' },
];

// Conjunctions that split multi-intent sentences
const SPLIT_CONJUNCTIONS = /\b(?:and then|then i|before i|after i|after that|while i|as i|but first|i also|i then)\b/i;
const SIMPLE_AND = /\band\b/i;

// ---------------------------------------------------------------------------
// IntentExtractor class
// ---------------------------------------------------------------------------

export class IntentExtractor {
  /**
   * Extract structured intent(s) from natural-language player input.
   *
   * Returns a single PlayerIntent for simple actions, or an array of
   * PlayerIntents when the input contains multiple actions.
   */
  extract(input: string, context: GameContext): PlayerIntent | PlayerIntent[] {
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      return this.buildUnknown(trimmed, 'Empty input.');
    }

    // Check for context-dependent repeat actions
    if (this.isRepeatAction(trimmed)) {
      return this.resolveRepeatAction(trimmed, context);
    }

    // Attempt multi-intent split
    const segments = this.splitMultiIntent(trimmed);
    if (segments.length > 1) {
      return segments.map((seg) => this.extractSingle(seg.trim(), context));
    }

    return this.extractSingle(trimmed, context);
  }

  /**
   * Generate a clarification question for an ambiguous intent.
   */
  clarify(intent: PlayerIntent): string {
    if (!intent.ambiguous) {
      return '';
    }

    const clarifications: Record<string, string[]> = {
      missing_target: [
        `Who or what would you like to ${intent.type.replace(/_/g, ' ')}?`,
        `I need a target — what should be the focus of your ${intent.type.replace(/_/g, ' ')}?`,
      ],
      unclear_action: [
        'Could you be more specific about what you want to do?',
        `I'm not sure what "${intent.raw}" means in game terms. Can you rephrase?`,
      ],
      ambiguous_target: [
        `There are multiple possibilities — which one do you mean?`,
      ],
      missing_method: [
        `How would you like to ${intent.type.replace(/_/g, ' ')}? What weapon, spell, or approach?`,
      ],
    };

    const reason = intent.ambiguityReason ?? 'unclear_action';
    const pool = clarifications[reason] ?? clarifications['unclear_action'];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // -----------------------------------------------------------------------
  // Internal extraction
  // -----------------------------------------------------------------------

  private extractSingle(input: string, context: GameContext): PlayerIntent {
    // Find the best-matching intent pattern
    let bestMatch: { type: IntentType; confidence: number } | null = null;

    for (const ip of INTENT_PATTERNS) {
      for (const pattern of ip.patterns) {
        if (pattern.test(input)) {
          const conf = ip.defaultConfidence;
          if (!bestMatch || conf > bestMatch.confidence) {
            bestMatch = { type: ip.type, confidence: conf };
          }
        }
      }
    }

    if (!bestMatch) {
      return this.buildUnknown(input, 'No matching intent pattern found.');
    }

    const type = bestMatch.type;
    const patternDef = INTENT_PATTERNS.find((ip) => ip.type === type)!;

    const target = this.extractTarget(input, context);
    const method = this.extractMethod(input, type, context);
    const modifiers = this.extractModifiers(input);
    const ambiguous = patternDef.requiresTarget && target === null;

    const intent: PlayerIntent = {
      type,
      target,
      method,
      modifiers,
      raw: input,
      confidence: bestMatch.confidence,
      ambiguous,
      ambiguityReason: ambiguous ? 'missing_target' : undefined,
    };

    return intent;
  }

  private isRepeatAction(input: string): boolean {
    const normalized = input.toLowerCase().trim();
    const repeatPhrases = [
      'do it again', 'do that again', 'again', 'same thing',
      'repeat that', 'i do the same', 'once more', 'same as before',
      'i do it again', 'try again', 'one more time',
    ];
    return repeatPhrases.includes(normalized);
  }

  private resolveRepeatAction(input: string, context: GameContext): PlayerIntent {
    if (!context.lastAction) {
      return this.buildUnknown(input, 'No previous action to repeat.');
    }

    return {
      ...context.lastAction,
      raw: input,
      confidence: Math.max(0.5, context.lastAction.confidence - 0.1),
      modifiers: [...context.lastAction.modifiers, 'repeat'],
    };
  }

  private splitMultiIntent(input: string): string[] {
    // Try splitting on conjunction phrases first
    const splitByPhrase = input.split(SPLIT_CONJUNCTIONS);
    if (splitByPhrase.length > 1) {
      return splitByPhrase;
    }

    // Try splitting on "and" but only if both halves look like actions
    const andSplit = input.split(SIMPLE_AND);
    if (andSplit.length === 2) {
      const first = andSplit[0].trim();
      const second = andSplit[1].trim();
      if (this.looksLikeAction(first) && this.looksLikeAction(second)) {
        return [first, second];
      }
    }

    return [input];
  }

  private looksLikeAction(phrase: string): boolean {
    for (const ip of INTENT_PATTERNS) {
      for (const pattern of ip.patterns) {
        if (pattern.test(phrase)) return true;
      }
    }
    return false;
  }

  // -----------------------------------------------------------------------
  // Target extraction
  // -----------------------------------------------------------------------

  private extractTarget(input: string, context: GameContext): string | null {
    // Strategy 1: "at the <target>", "to the <target>", "the <target>"
    const prepMatch = input.match(
      /\b(?:at|to|toward|towards|on|against)\s+(?:the\s+)?([a-z]+(?:\s+[a-z]+){0,3})/i
    );
    if (prepMatch) {
      return this.resolveEntity(prepMatch[1].trim(), context);
    }

    // Strategy 2: Direct object after action verb — "I attack <target>"
    const directObjMatch = input.match(
      /\b(?:attack|hit|strike|slash|stab|shoot|grapple|grab|help|heal|talk to|speak to|ask|tell|persuade|intimidate|threaten|deceive|trick|search|examine|investigate|check|push|pull|open|close)\s+(?:the\s+)?([a-z]+(?:\s+[a-z]+){0,3})/i
    );
    if (directObjMatch) {
      return this.resolveEntity(directObjMatch[1].trim(), context);
    }

    // Strategy 3: Match against known entities in context
    for (const entity of [...context.activeCombatants, ...context.visibleEntities]) {
      const entityLower = entity.toLowerCase();
      if (input.toLowerCase().includes(entityLower)) {
        return entity;
      }
    }

    // Strategy 4: Match against nearby items
    for (const item of context.nearbyItems) {
      if (input.toLowerCase().includes(item.toLowerCase())) {
        return item;
      }
    }

    return null;
  }

  private resolveEntity(raw: string, context: GameContext): string {
    const rawLower = raw.toLowerCase();

    // Exact match against known entities
    const allEntities = [...context.visibleEntities, ...context.activeCombatants];
    for (const entity of allEntities) {
      if (entity.toLowerCase() === rawLower) return entity;
    }

    // Partial match
    for (const entity of allEntities) {
      if (entity.toLowerCase().includes(rawLower) || rawLower.includes(entity.toLowerCase())) {
        return entity;
      }
    }

    // Return as-is (might be a novel entity the DM introduced)
    return raw;
  }

  // -----------------------------------------------------------------------
  // Method extraction
  // -----------------------------------------------------------------------

  private extractMethod(input: string, type: IntentType, context: GameContext): string | null {
    if (type === IntentType.CAST_SPELL) {
      return this.extractSpellName(input, context);
    }

    if (type === IntentType.ATTACK) {
      return this.extractWeaponName(input, context);
    }

    // General: look for "with <method>" or "using <method>"
    const withMatch = input.match(/\b(?:with|using|by)\s+(?:the\s+)?([a-z]+(?:\s+[a-z]+){0,2})/i);
    if (withMatch) {
      return withMatch[1].trim();
    }

    return null;
  }

  private extractSpellName(input: string, context: GameContext): string | null {
    // "I cast <spell>"
    const castMatch = input.match(/\bcast\s+(?:the\s+)?([a-z]+(?:\s+[a-z]+){0,2})/i);
    if (castMatch) {
      const candidate = castMatch[1].trim();
      // Check against known spells
      for (const spell of context.knownSpells) {
        if (spell.toLowerCase().includes(candidate.toLowerCase())) {
          return spell;
        }
      }
      return candidate;
    }

    // Spell name directly mentioned
    for (const spell of context.knownSpells) {
      if (input.toLowerCase().includes(spell.toLowerCase())) {
        return spell;
      }
    }

    return null;
  }

  private extractWeaponName(input: string, context: GameContext): string | null {
    // "with my sword", "with my bow"
    const weaponMatch = input.match(/\bwith\s+(?:my\s+|the\s+|a\s+)?([a-z]+(?:\s+[a-z]+){0,1})/i);
    if (weaponMatch) {
      return weaponMatch[1].trim();
    }

    // Check inventory
    for (const item of context.inventory) {
      if (input.toLowerCase().includes(item.toLowerCase())) {
        return item;
      }
    }

    return null;
  }

  // -----------------------------------------------------------------------
  // Modifier extraction
  // -----------------------------------------------------------------------

  private extractModifiers(input: string): string[] {
    const modifiers: string[] = [];

    for (const { pattern, modifier } of MODIFIER_PATTERNS) {
      if (pattern.test(input)) {
        modifiers.push(modifier);
      }
    }

    return modifiers;
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private buildUnknown(raw: string, reason: string): PlayerIntent {
    return {
      type: IntentType.OTHER,
      target: null,
      method: null,
      modifiers: [],
      raw,
      confidence: 0.2,
      ambiguous: true,
      ambiguityReason: reason,
    };
  }
}
