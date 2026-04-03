import { evapPipeline, getEvapReport, getLockStats } from './lib/evaporation-pipeline.js';
import { selectModel } from './lib/model-router.js';
import { trackConfidence, getConfidence } from './lib/confidence-tracker.js';
import { softActualize, confidenceScore } from './lib/soft-actualize.js';
import { deadbandCheck, deadbandStore, getEfficiencyStats } from './lib/deadband.js';
import { logResponse } from './lib/response-logger.js';
/**
 * DMLogWorker — Main Cloudflare Worker for DMLog.ai.
 *
 * Handles all HTTP requests and WebSocket connections.
 * Routes: static assets, campaign CRUD API, chat API, and real-time WebSocket game sessions.
 *
 * Environment bindings:
 *   WORLD_STATE  — KV namespace for world state data
 *   CAMPAIGNS    — KV namespace for campaign metadata
 *   SESSIONS     — KV namespace for session tokens / rate limiting
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Env {
  WORLD_STATE: KVNamespace;
  CAMPAIGNS: KVNamespace;
  SESSIONS: KVNamespace;
  LLM_PROVIDER: string;       // 'openai' | 'anthropic' | 'deepseek'
  LLM_API_KEY: string;
  LLM_MODEL: string;
  GOOGLE_API_KEY: string;
  ASSETS?: { fetch: (req: Request) => Promise<Response> };
}

interface CampaignMeta {
  id: string;
  name: string;
  system: string;              // e.g. "D&D 5e", "Pathfinder 2e"
  createdAt: number;
  updatedAt: number;
  characterCount: number;
  sessionCount: number;
}

interface WorldState {
  campaignId: string;
  characters: Character[];
  npcs: Npc[];
  locations: Location[];
  quests: Quest[];
  combat: CombatState | null;
  narrativeLog: NarrativeEntry[];
  metadata: {
    createdAt: number;
    updatedAt: number;
    turnCount: number;
    currentScene: string;
  };
}

interface Character {
  id: string;
  name: string;
  race: string;
  class: string;
  level: number;
  hp: number;
  maxHp: number;
  ac: number;
  stats: Record<string, number>;
  inventory: string[];
}

interface Npc {
  id: string;
  name: string;
  race: string;
  disposition: string;
  hp?: number;
  maxHp?: number;
  ac?: number;
  notes: string;
}

interface Location {
  id: string;
  name: string;
  description: string;
  connections: string[];
  discovered: boolean;
}

interface Quest {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'complete' | 'failed';
  objectives: string[];
}

interface CombatState {
  active: boolean;
  round: number;
  turnOrder: string[];
  currentTurnIndex: number;
  participants: CombatParticipant[];
}

interface CombatParticipant {
  id: string;
  name: string;
  initiative: number;
  hp: number;
  maxHp: number;
  isPlayer: boolean;
  conditions: string[];
}

interface NarrativeEntry {
  turn: number;
  timestamp: number;
  playerAction: string;
  dmNarration: string;
  stateChanges: string[];
}

interface ChatRequest {
  campaignId?: string;
  message: string;
  characterId?: string;
}

interface AssetGallery {
  id: string;
  type: string;
  subject: string;
  style: string;
  resolution: string;
  prompt: string;
  imageUrl: string;
  createdAt: number;
  campaignId?: string;
}

interface CanonFact {
  subject: string;
  fact: string;
  source: string;
  timestamp: number;
}

interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ---------------------------------------------------------------------------
// DM Personality
// ---------------------------------------------------------------------------

const DM_PERSONALITY = `You are the Dungeon Master for a tabletop RPG campaign. You are:

- An immersive storyteller who paints vivid scenes with sensory details (sight, sound, smell, texture)
- A fair rules arbiter who knows the game system thoroughly
- Adaptive — you match the tone the players set (serious, humorous, heroic)
- Responsive to player agency — you never railroad, you react
- A performer — you give dice rolls narrative weight (natural 20 = epic, natural 1 = hilarious)
- A storyteller who remembers — choices have delayed consequences, relationships evolve

You narrate in second person present tense ("You step into the chamber...").
You keep descriptions concise but evocative, always including at least one non-visual sensory detail.
You name NPCs, describe smells, sounds, and the feel of the environment.
You track the rules but don't bog down gameplay — quick rulings, look up details later if needed.
Occasionally break the fourth wall with a "DM aside" — a brief out-of-character note about rules or strategy.

Format entity mentions: @NPC for characters, *Location Name* for places, [Item Name] for objects.

When other party members (NPCs) are present, they react briefly to the player's actions — a grunt of approval, a worried look, a muttered comment. This replicates the feeling of sitting at a table with other players.`;

// ---------------------------------------------------------------------------
// Intent Extraction
// ---------------------------------------------------------------------------

type PlayerIntent =
  | 'move'
  | 'attack'
  | 'cast_spell'
  | 'skill_check'
  | 'talk'
  | 'interact'
  | 'rest'
  | 'inventory'
  | 'explore'
  | 'meta';

const INTENT_KEYWORDS: Record<PlayerIntent, string[]> = {
  move:        ['go', 'walk', 'move', 'enter', 'leave', 'head', 'run', 'climb', 'travel', 'north', 'south', 'east', 'west'],
  attack:      ['attack', 'hit', 'strike', 'slash', 'stab', 'shoot', 'punch', 'kick', 'smite'],
  cast_spell:  ['cast', 'spell', 'fireball', 'heal', 'magic', 'invoke', 'channel'],
  skill_check: ['check', 'roll', 'perception', 'investigation', 'stealth', 'persuasion', 'deception', 'insight', 'athletics', 'acrobatics', 'arcana', 'history', 'nature', 'religion'],
  talk:        ['talk', 'speak', 'say', 'ask', 'tell', 'greet', 'shout', 'whisper', 'convince', 'intimidate', 'plead'],
  interact:    ['open', 'close', 'pick up', 'use', 'touch', 'pull', 'push', 'read', 'examine', 'search', 'lock', 'unlock', 'drink', 'eat'],
  rest:        ['rest', 'sleep', 'short rest', 'long rest', 'camp', 'meditate', 'recover'],
  inventory:   ['inventory', 'items', 'equipment', 'equip', 'unequip', 'drop', 'bag', 'pack'],
  explore:     ['look', 'examine', 'search', 'inspect', 'listen', 'investigate', 'scan', 'survey'],
  meta:        ['rules', 'help', 'undo', 'save', 'pause', 'who', 'status', 'hp'],
};

function extractIntent(message: string): PlayerIntent {
  const lower = message.toLowerCase();
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) return intent as PlayerIntent;
    }
  }
  return 'explore';
}

// ---------------------------------------------------------------------------
// Rules Engine (simplified)
// ---------------------------------------------------------------------------

function resolveSkillCheck(difficulty: 'easy' | 'medium' | 'hard' | 'very_hard' | 'nearly_impossible'): number {
  const dcMap: Record<string, number> = {
    easy: 10,
    medium: 15,
    hard: 20,
    very_hard: 25,
    nearly_impossible: 30,
  };
  return dcMap[difficulty] ?? 15;
}

function resolveDamage(weaponDice: string, modifier: number, isCritical: boolean): { total: number; rolls: number[] } {
  const match = weaponDice.match(/^(\d+)d(\d+)$/);
  if (!match) return { total: modifier, rolls: [] };

  const count = parseInt(match[1], 10);
  const sides = parseInt(match[2], 10);
  const multiplier = isCritical ? 2 : 1;
  const rolls: number[] = [];

  for (let i = 0; i < count * multiplier; i++) {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    rolls.push((buffer[0] % sides) + 1);
  }

  return { total: rolls.reduce((s, r) => s + r, 0) + modifier, rolls };
}

// ---------------------------------------------------------------------------
// LLM Integration
// ---------------------------------------------------------------------------

async function callLLM(messages: LLMMessage[], env: Env, stream?: (chunk: string) => void): Promise<string> {
  const provider = (env.LLM_PROVIDER || 'openai').toLowerCase();
  const apiKey = env.LLM_API_KEY;
  const model = env.LLM_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    return generateFallbackNarration(messages);
  }

  try {
    if (provider === 'anthropic') {
      return await callAnthropic(messages, apiKey, model, stream);
    }
    // Default: OpenAI-compatible (covers OpenAI and DeepSeek)
    return await callOpenAICompatible(messages, apiKey, model, provider, stream);
  } catch (err) {
    console.error(`[DMLog] LLM call failed (${provider}):`, err);
    return generateFallbackNarration(messages);
  }
}

async function callOpenAICompatible(
  messages: LLMMessage[],
  apiKey: string,
  model: string,
  provider: string,
  stream?: (chunk: string) => void,
): Promise<string> {
  const baseUrl = provider === 'deepseek'
    ? 'https://api.deepseek.com/v1/chat/completions'
    : 'https://api.openai.com/v1/chat/completions';

  const body = JSON.stringify({
    model,
    messages,
    max_tokens: 1024,
    temperature: 0.8,
    stream: !!stream,
  });

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`LLM API returned ${response.status}: ${await response.text()}`);
  }

  if (stream && response.body) {
    let fullText = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') break;
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content ?? '';
          if (content) {
            fullText += content;
            stream(content);
          }
        } catch { /* skip malformed SSE lines */ }
      }
    }
    return fullText;
  }

  const data = await response.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices?.[0]?.message?.content ?? '';
}

async function callAnthropic(
  messages: LLMMessage[],
  apiKey: string,
  model: string,
  stream?: (chunk: string) => void,
): Promise<string> {
  const systemMsg = messages.find(m => m.role === 'system')?.content ?? '';
  const userMessages = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemMsg,
      messages: userMessages,
      stream: !!stream,
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API returned ${response.status}: ${await response.text()}`);
  }

  if (stream && response.body) {
    let fullText = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        try {
          const parsed = JSON.parse(trimmed.slice(6));
          if (parsed.type === 'content_block_delta') {
            const content = parsed.delta?.text ?? '';
            if (content) {
              fullText += content;
              stream(content);
            }
          }
        } catch { /* skip */ }
      }
    }
    return fullText;
  }

  const data = await response.json() as { content: Array<{ type: string; text: string }> };
  return data.content?.[0]?.text ?? '';
}

function generateFallbackNarration(messages: LLMMessage[]): string {
  const userMsg = messages.findLast(m => m.role === 'user');
  const action = userMsg?.content ?? 'take an action';

  const templates = [
    `The air shifts as you ${action}. Shadows dance along the stone walls, and the faint scent of old parchment reaches your nose. Something about this moment feels significant — the weight of a decision yet to unfold hangs before you.`,
    `You ${action}. The world responds in kind — a distant echo, a flickering torch, the feeling of unseen eyes upon you. The path ahead branches, and your instincts tell you to choose carefully.`,
    `With purpose, you ${action}. The dungeon breathes around you, ancient and patient. @A mysterious voice echoes from the darkness ahead: "Another soul ventures forth... how delightful."`,
  ];

  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return templates[buffer[0] % templates.length];
}

// ---------------------------------------------------------------------------
// Rate Limiting
// ---------------------------------------------------------------------------

async function checkRateLimit(sessionId: string, env: Env): Promise<boolean> {
  const key = `rate:${sessionId}`;
  const current = parseInt(await env.SESSIONS.get(key) ?? '0', 10);
  if (current >= 30) return false; // 30 requests per minute
  await env.SESSIONS.put(key, String(current + 1), { expirationTtl: 60 });
  return true;
}

// ---------------------------------------------------------------------------
// Campaign Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  const buffer = new Uint8Array(16);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, b => b.toString(16).padStart(2, '0')).join('');
}

async function getCampaignList(env: Env): Promise<CampaignMeta[]> {
  const raw = await env.CAMPAIGNS.get('index');
  return raw ? JSON.parse(raw) as CampaignMeta[] : [];
}

async function saveCampaignList(list: CampaignMeta[], env: Env): Promise<void> {
  await env.CAMPAIGNS.put('index', JSON.stringify(list));
}

function createDefaultWorldState(campaignId: string): WorldState {
  const tavernId = generateId();
  return {
    campaignId,
    characters: [],
    npcs: [{
      id: generateId(),
      name: 'The Hooded Stranger',
      race: 'Human',
      disposition: 'mysterious',
      notes: 'Slid a map across the table. Seems to know more than they let on.',
    }],
    locations: [{
      id: tavernId,
      name: "The Drunken Dragon Tavern",
      description: "Smoke curls from a stone chimney into the night sky. Inside, the warmth of a crackling hearth wraps around you like a blanket. The smell of roasting meat and spiced ale fills the air. A hooded stranger at a corner table catches your eye and slides a weathered map across the scarred oak surface. Around you, patrons laugh, argue, and pretend not to notice. The floorboards creak with every step, and somewhere upstairs, a door closes.",
      connections: [],
      discovered: true,
    }],
    quests: [],
    combat: null,
    narrativeLog: [],
    metadata: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
      turnCount: 0,
      currentScene: "The Drunken Dragon Tavern",
    },
  };
}

/** Generate the opening narration for a new campaign (Fix 5: Onboarding Magic). */
function generateOpeningNarration(campaignName: string): string {
  const openings = [
    `You wake with a start. Firelight dances across rough-hewn beams overhead, and the smell of wood smoke and stale ale fills your nose. Your head pounds — was it the mead, or something else?\n\nYou're sitting at a table in a tavern you don't recognize. *The Drunken Dragon*, according to the sign you glimpsed through the window. Across from you, a hooded stranger slides a weathered map across the scarred oak surface.\n\n"I've been waiting for you," they say, voice barely above a whisper. "Don't ask how I know your name. The real question is: do you want to know what's marked on this map?"\n\nAround you, the tavern hums with life — a bard tuning a lute, a group of dwarves arguing over dice, a barkeep polishing mugs with practiced indifference. The stranger's eyes glint in the firelight. What do you do?`,
    `The door slams open. Rain pours in, and so do you — soaking wet, out of breath, and very aware that someone is following you.\n\nYou stumble into *The Drunken Dragon Tavern*, and every eye turns your way. The warmth hits you like a wall: roasting meat, crackling fire, the hum of conversation. A hooded figure in the corner doesn't look up, but they raise one hand and beckon.\n\nAs you approach, they slide a map across the table. "You're late," they say. "And you led them straight here. Sit. We don't have much time."\n\nThe other patrons go back to their drinks, but you can feel the tension. What do you do?`,
    `Your eyes open to the smell of fresh bread and the sound of a crackling fire. You're slumped over a table at *The Drunken Dragon Tavern*, an empty tankard beside you. The morning light filters through shutters thick with dust.\n\nSomeone has placed a map under your hand while you slept. It shows a winding path through mountains to a place marked only with a red X. A note in elegant handwriting reads: "Your past has caught up. Follow this path or be found."\n\nA hooded stranger watches you from across the room, their face half-hidden in shadow. They raise a cup in a silent toast. The tavern is nearly empty — just you, the stranger, and a barkeep who pretends not to notice. What do you do?`,
  ];
  return openings[Math.floor(Math.random() * openings.length)];
}

// ---------------------------------------------------------------------------
// Canon System — DM Consistency
// ---------------------------------------------------------------------------

async function getCanon(campaignId: string, env: Env): Promise<CanonFact[]> {
  const raw = await env.WORLD_STATE.get(`campaign:${campaignId}:canon`);
  return raw ? JSON.parse(raw) as CanonFact[] : [];
}

async function saveCanon(campaignId: string, canon: CanonFact[], env: Env): Promise<void> {
  await env.WORLD_STATE.put(`campaign:${campaignId}:canon`, JSON.stringify(canon));
}

function extractFactsFromNarration(narration: string): CanonFact[] {
  const facts: CanonFact[] = [];
  // Extract named entity facts: "Grimjaw is a troll", "Eldrin lives in Brindenford"
  const namedFactPattern = /([A-Z][a-zA-Z\s]+?)\s+(?:is|was|has|owns|lives|wields|wears|carries|killed|died|gave|took)\s+([^.]+)/g;
  let match;
  while ((match = namedFactPattern.exec(narration)) !== null) {
    const subject = match[1].trim();
    if (subject.length < 2 || subject.length > 40) continue;
    facts.push({
      subject,
      fact: `${subject} ${match[0].slice(subject.length).trim()}`,
      source: 'dm_narration',
      timestamp: Date.now(),
    });
  }
  return facts;
}

async function checkCanonConsistency(
  campaignId: string,
  playerMessage: string,
  proposedNarration: string,
  env: Env,
): Promise<string | null> {
  const canon = await getCanon(campaignId, env);
  if (canon.length === 0) return null;

  // Check if the proposed narration contradicts any established canon
  const lowerNarration = proposedNarration.toLowerCase();
  for (const fact of canon) {
    const subject = fact.subject.toLowerCase();
    // If the narration mentions a canon subject, verify it doesn't contradict
    if (lowerNarration.includes(subject)) {
      const canonFact = fact.fact.toLowerCase();
      // Simple contradiction detection: death, location change, identity change
      const deathWords = ['dies', 'is killed', 'falls dead', 'slain'];
      const wasDead = deathWords.some(w => canonFact.includes(w));
      if (wasDead && !lowerNarration.includes('ghost') && !lowerNarration.includes('spirit') && !lowerNarration.includes('undead')) {
        // Check if the narration treats a dead character as alive
        const aliveIndicators = ['smiles', 'nods', 'speaks', 'walks', 'runs', 'attacks'];
        if (aliveIndicators.some(a => lowerNarration.includes(subject) && lowerNarration.includes(a))) {
          return `Canon violation: ${fact.subject} is established as dead (${fact.fact}) but narrated as alive.`;
        }
      }
    }
  }
  return null;
}

async function updateCanonFromNarration(campaignId: string, narration: string, env: Env): Promise<void> {
  const newFacts = extractFactsFromNarration(narration);
  if (newFacts.length === 0) return;

  const canon = await getCanon(campaignId, env);
  // Merge: update existing subjects, add new ones (max 200 facts)
  for (const fact of newFacts) {
    const existing = canon.findIndex(f => f.subject.toLowerCase() === fact.subject.toLowerCase());
    if (existing >= 0) {
      // Only update if the new fact is more recent and not identical
      if (fact.timestamp > canon[existing].timestamp) {
        canon[existing] = fact;
      }
    } else {
      canon.push(fact);
    }
  }

  // Keep canon bounded
  while (canon.length > 200) {
    canon.shift();
  }

  await saveCanon(campaignId, canon, env);
}

// ---------------------------------------------------------------------------
// Snapshot Helpers
// ---------------------------------------------------------------------------

function generateSnapshotSummary(state: WorldState): string {
  const chars = state.characters.map(c => `${c.name} (Lv${c.level} ${c.race} ${c.class})`).join(', ') || 'No characters';
  const quests = state.quests.filter(q => q.status === 'active').map(q => q.name).join(', ') || 'None';
  const npcs = state.npcs.map(n => n.name).join(', ') || 'None';
  return `Scene: ${state.metadata.currentScene} | Characters: ${chars} | Quests: ${quests} | NPCs: ${npcs} | Turn: ${state.metadata.turnCount}`;
}

function formatSnapshotText(snapshot: { campaignId: string; capturedAt: number; worldState: WorldState; canon: CanonFact[]; summary: string }): string {
  const s = snapshot.worldState;
  const lines = [
    `=== DMLog.ai Campaign Snapshot ===`,
    `Campaign: ${snapshot.campaignId}`,
    `Captured: ${new Date(snapshot.capturedAt).toISOString()}`,
    ``,
    `--- World State ---`,
    `Scene: ${s.metadata.currentScene}`,
    `Turn: ${s.metadata.turnCount}`,
    ``,
    `--- Characters ---`,
    ...s.characters.map(c => `  ${c.name}: Lv${c.level} ${c.race} ${c.class} | HP ${c.hp}/${c.maxHp} | AC ${c.ac}`),
    s.characters.length === 0 ? '  (none)' : '',
    ``,
    `--- Active Quests ---`,
    ...s.quests.filter(q => q.status === 'active').map(q => `  ${q.name}: ${q.description}`),
    ``,
    `--- NPCs ---`,
    ...s.npcs.map(n => `  ${n.name} (${n.race}) - ${n.disposition}`),
    ``,
    `--- Recent Narrative ---`,
    ...s.narrativeLog.slice(-3).map(e => `[Turn ${e.turn}] Player: ${e.playerAction}\n  DM: ${e.dmNarration.slice(0, 200)}`),
    ``,
    `--- Canon (${snapshot.canon.length} facts) ---`,
    ...snapshot.canon.slice(-10).map(f => `  - ${f.fact}`),
    ``,
    `=== End Snapshot ===`,
  ];
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Fantasy-Themed Error Messages
// ---------------------------------------------------------------------------

const FANTASY_ERRORS: Record<string, string> = {
  not_found:      'The ancient scrolls reveal no such path. This route does not exist in this realm.',
  no_campaign:    'The campaign chronicles are empty. No such tale has been recorded.',
  bad_request:    'The spell fizzles. Your request lacks the proper incantation.',
  rate_limited:   'The spirits grow weary of your rapid queries. Pause, and try again in a moment.',
  internal:       'A disturbance in the arcane weave! Something went wrong in the aether.',
  no_character:   'No hero steps forward from the shadows. Please specify a character.',
};

function errorResponse(status: number, key: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ error: FANTASY_ERRORS[key] ?? key, code: key }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(), ...headers },
  });
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com https://api.deepseek.com https://api.groq.com https://api.mistral.ai https://openrouter.ai https://api.z.ai https://*;",
  };
}

// ---------------------------------------------------------------------------
// Share Card HTML Builder (Fix 6: Viral Moment)
// ---------------------------------------------------------------------------

function buildShareCardHTML(quote: string, characterName: string, scene: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;background:#0a0a1a;display:flex;justify-content:center;align-items:center;min-height:100vh;font-family:Georgia,serif}
  .card{max-width:500px;width:100%;background:linear-gradient(135deg,#1a1a2e,#16213e);border:2px solid #d4af37;border-radius:12px;padding:2rem;position:relative;overflow:hidden}
  .card::before{content:'';position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#d4af37,#f4e4ba,#d4af37)}
  .logo{color:#d4af37;font-size:1.2rem;text-align:center;margin-bottom:1rem;letter-spacing:2px;text-transform:uppercase}
  .quote{color:#e0e0e0;font-size:1.1rem;line-height:1.6;font-style:italic;text-align:center;margin:1.5rem 0}
  .quote::before{content:'\\201C';color:#d4af37;font-size:2rem;display:block}
  .quote::after{content:'\\201D';color:#d4af37;font-size:2rem;display:block;text-align:right}
  .meta{color:#888;text-align:center;font-size:0.85rem;margin-top:1rem}
  .character{color:#d4af37;font-weight:bold}
  .scene{color:#a0a0a0}
  .footer{text-align:center;margin-top:1.5rem;padding-top:1rem;border-top:1px solid #333}
  .footer a{color:#d4af37;text-decoration:none;font-size:0.8rem}
</style></head><body>
<div class="card">
  <div class="logo">DMLog.ai</div>
  <div class="quote">${quote.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
  <div class="meta">
    <span class="character">${characterName.replace(/</g, '&lt;')}</span> in <span class="scene">${scene.replace(/</g, '&lt;')}</span>
  </div>
  <div class="footer"><a href="https://dmlog.ai">Your AI Dungeon Master</a></div>
</div>
</body></html>`;
}

// ---------------------------------------------------------------------------
// Asset Generation helpers (imported from game modules)
// ---------------------------------------------------------------------------

async function handleAssetRoutes(path: string, request: Request, env: Env): Promise<Response | null> {
  const { buildTableFeelPrompt, inferPacingMode, buildSensoryNarration, maybeDMAside } = await import('./game/table-feel.js');
  const { EmotionEngine } = await import('./game/emotions.js');
  const { ConsequenceTracker } = await import('./game/consequences.js');
  const { SurpriseGenerator } = await import('./game/surprises.js');
  const { getStyle, getAllStyles, mixStyles, generateStylePrompt } = await import('./game/world-styles.js');
  const { buildAssetPrompt, buildSpritePrompt, buildScenePrompt, ASSET_RECIPES } = await import('./game/asset-recipes.js');
  const { startResearch, checkResearchStatus, getJob } = await import('./game/auto-research.js');

  // GET /api/styles — list all art styles
  if (path === '/api/styles' && request.method === 'GET') {
    const styles = getAllStyles();
    return new Response(JSON.stringify({ styles }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  // GET /api/styles/:id — single style details
  const styleMatch = path.match(/^\/api\/styles\/([a-z_]+)$/);
  if (styleMatch && request.method === 'GET') {
    const style = getStyle(styleMatch[1]);
    if (!style) return errorResponse(404, 'not_found');
    return new Response(JSON.stringify({ style }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  // POST /api/generate/asset — generate any asset
  if (path === '/api/generate/asset' && request.method === 'POST') {
    try {
      const body = await request.json() as { type?: string; subject?: string; style?: string; resolution?: string; extras?: string[] };
      if (!body.type || !body.subject || !body.style) return errorResponse(400, 'bad_request');

      const prompt = buildAssetPrompt(
        body.type as 'location' | 'monster' | 'item' | 'portrait' | 'map' | 'effect',
        body.subject,
        body.style,
        (body.resolution as 'sprite-16' | 'sprite-32' | 'sprite-64' | 'sketch' | 'watercolor' | 'oil' | 'photorealistic') ?? 'oil',
        body.extras ?? [],
      );

      const styleObj = getStyle(body.style);
      const assetId = generateId();
      const asset: AssetGallery = {
        id: assetId,
        type: body.type,
        subject: body.subject,
        style: body.style,
        resolution: body.resolution ?? 'oil',
        prompt,
        imageUrl: `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 200))}?width=1024&height=1024&seed=${assetId.slice(0, 8)}`,
        createdAt: Date.now(),
      };

      // Persist to KV
      const galleryRaw = await env.WORLD_STATE.get('gallery:assets');
      const gallery: AssetGallery[] = galleryRaw ? JSON.parse(galleryRaw) : [];
      gallery.unshift(asset);
      if (gallery.length > 200) gallery.length = 200;
      await env.WORLD_STATE.put('gallery:assets', JSON.stringify(gallery));

      return new Response(JSON.stringify({ asset }), {
        status: 201,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    } catch {
      return errorResponse(400, 'bad_request');
    }
  }

  // POST /api/generate/sprite — SNES sprite
  if (path === '/api/generate/sprite' && request.method === 'POST') {
    try {
      const body = await request.json() as { character?: string; palette?: string[]; action?: string };
      if (!body.character) return errorResponse(400, 'bad_request');

      const prompt = buildSpritePrompt(body.character, body.palette ?? ['red', 'gold', 'brown', 'ivory'], body.action ?? 'idle');
      const assetId = generateId();
      const asset: AssetGallery = {
        id: assetId,
        type: 'sprite',
        subject: body.character,
        style: 'pixel-art',
        resolution: 'sprite-32',
        prompt,
        imageUrl: `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 200))}?width=128&height=128&seed=${assetId.slice(0, 8)}`,
        createdAt: Date.now(),
      };

      const galleryRaw = await env.WORLD_STATE.get('gallery:assets');
      const gallery: AssetGallery[] = galleryRaw ? JSON.parse(galleryRaw) : [];
      gallery.unshift(asset);
      if (gallery.length > 200) gallery.length = 200;
      await env.WORLD_STATE.put('gallery:assets', JSON.stringify(gallery));

      return new Response(JSON.stringify({ asset }), {
        status: 201,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    } catch {
      return errorResponse(400, 'bad_request');
    }
  }

  // POST /api/research/start — start background research
  if (path === '/api/research/start' && request.method === 'POST') {
    try {
      const body = await request.json() as { culture?: string; era?: string };
      if (!body.culture) return errorResponse(400, 'bad_request');

      const job = await startResearch(body.culture, body.era ?? 'Medieval');
      return new Response(JSON.stringify({ job }), {
        status: 201,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    } catch {
      return errorResponse(400, 'bad_request');
    }
  }

  // GET /api/research/status — check research status
  if (path === '/api/research/status' && request.method === 'GET') {
    const report = await checkResearchStatus();
    return new Response(JSON.stringify(report), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  // POST /api/campaign/{id}/share — Fix 6: Viral share card
  const shareMatch = path.match(/^\/api\/campaign\/([a-f0-9]+)\/share$/);
  if (shareMatch && request.method === 'POST') {
    try {
      const campaignId = shareMatch[1];
      const raw = await env.WORLD_STATE.get(`campaign:${campaignId}`);
      if (!raw) return errorResponse(404, 'no_campaign');
      const state: WorldState = JSON.parse(raw);

      const log = state.narrativeLog;
      if (log.length === 0) {
        return new Response(JSON.stringify({ error: 'No story yet — start playing first!', code: 'no_story' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        });
      }

      const dramaticKeywords = ['critical', 'natural 20', 'dies', 'reveals', 'betrayed', 'dragon', 'legendary', 'ancient', 'boss'];
      let bestEntry = log[log.length - 1];
      let bestScore = 0;
      for (const entry of log.slice(-10)) {
        let score = 1;
        const combined = (entry.playerAction + ' ' + entry.dmNarration).toLowerCase();
        for (const kw of dramaticKeywords) {
          if (combined.includes(kw)) score += 3;
        }
        if (score > bestScore) { bestScore = score; bestEntry = entry; }
      }

      const sentences = bestEntry.dmNarration.split(/[.!?]+/).filter((s: string) => s.trim().length > 20);
      const quote = sentences.length > 0
        ? sentences[Math.floor(Math.random() * Math.min(3, sentences.length))].trim()
        : bestEntry.dmNarration.slice(0, 200);

      const shareCard = {
        campaignId,
        quote,
        playerAction: bestEntry.playerAction,
        turn: bestEntry.turn,
        timestamp: bestEntry.timestamp,
        characterName: state.characters[0]?.name ?? 'The Adventurer',
        scene: state.metadata.currentScene,
        html: buildShareCardHTML(quote, state.characters[0]?.name ?? 'The Adventurer', state.metadata.currentScene),
      };

      return new Response(JSON.stringify(shareCard), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    } catch {
      return errorResponse(500, 'internal');
    }
  }

  // GET /api/campaign/{id}/relationships — Emotion Engine endpoint
  const relationshipsMatch = path.match(/^\/api\/campaign\/([a-f0-9]+)\/relationships$/);
  if (relationshipsMatch && request.method === 'GET') {
    try {
      const campaignId = relationshipsMatch[1];
      const emotionData = await env.WORLD_STATE.get(`campaign:${campaignId}:relationships`);
      if (!emotionData) {
        return new Response(JSON.stringify({ relationships: [], summary: 'No relationships established yet.' }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        });
      }
      return new Response(emotionData, {
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    } catch {
      return errorResponse(500, 'internal');
    }
  }

  // GET /api/campaign/{id}/choices — Consequence tracker endpoint
  const choicesMatch = path.match(/^\/api\/campaign\/([a-f0-9]+)\/choices$/);
  if (choicesMatch && request.method === 'GET') {
    try {
      const campaignId = choicesMatch[1];
      const choiceData = await env.WORLD_STATE.get(`campaign:${campaignId}:choices`);
      if (!choiceData) {
        return new Response(JSON.stringify({ choices: [], butterflyScore: 0, narrativePath: 'An unwritten story.' }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        });
      }
      return new Response(choiceData, {
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    } catch {
      return errorResponse(500, 'internal');
    }
  }

  // GET /api/gallery — all generated assets
  if (path === '/api/gallery' && request.method === 'GET') {
    const galleryRaw = await env.WORLD_STATE.get('gallery:assets');
    const gallery: AssetGallery[] = galleryRaw ? JSON.parse(galleryRaw) : [];
    return new Response(JSON.stringify({ assets: gallery }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  // POST /api/generate/image — Gemini-powered image generation
  if (path === '/api/generate/image' && request.method === 'POST') {
    try {
      const body = await request.json() as { prompt?: string; style?: string };
      if (!body.prompt) return errorResponse(400, 'bad_request');

      const apiKey = env.GOOGLE_API_KEY;
      if (!apiKey) {
        return new Response(JSON.stringify({ error: 'Image generation is not configured. GOOGLE_API_KEY is missing.', code: 'no_api_key' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        });
      }

      const { buildImagePrompt } = await import('./game/styles.js');
      const styleId = body.style ?? 'norse_viking';
      const fullPrompt = buildImagePrompt(body.prompt, styleId);

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`;

      const geminiBody = JSON.stringify({
        contents: [{ parts: [{ text: `Generate an image: ${fullPrompt}` }] }],
        generationConfig: {
          responseModalities: ['IMAGE', 'TEXT'],
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      });

      const geminiResponse = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: geminiBody,
      });

      if (!geminiResponse.ok) {
        const errText = await geminiResponse.text();
        console.error('[DMLog] Gemini API error:', geminiResponse.status, errText);
        if (geminiResponse.status === 429) {
          return new Response(JSON.stringify({ error: 'Rate limited by image provider. Try again in a moment.', code: 'rate_limited' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json', ...corsHeaders() },
          });
        }
        return new Response(JSON.stringify({ error: 'Image generation failed.', code: 'gemini_error', details: errText.slice(0, 500) }), {
          status: 502,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        });
      }

      const geminiData = await geminiResponse.json() as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>;
          };
        }>;
      };

      // Extract image from response
      let imageData: string | null = null;
      let mimeType = 'image/png';
      let caption = '';

      const parts = geminiData.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          imageData = part.inlineData.data;
          mimeType = part.inlineData.mimeType || 'image/png';
        }
        if (part.text) {
          caption = part.text;
        }
      }

      if (!imageData) {
        return new Response(JSON.stringify({ error: 'No image was generated. Try a different prompt.', code: 'no_image', caption }), {
          status: 502,
          headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        });
      }

      return new Response(JSON.stringify({
        image: `data:${mimeType};base64,${imageData}`,
        mimeType,
        prompt: fullPrompt,
        style: styleId,
        caption,
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    } catch (err) {
      console.error('[DMLog] Image generation error:', err);
      return errorResponse(500, 'internal');
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// HTTP Handler
// ---------------------------------------------------------------------------

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;


  // Confidence tracking
  if (path === '/api/confidence') {
    const scores = await getConfidence(env);
    return new Response(JSON.stringify(scores), { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // ----- BYOK Setup & Config -----

  if (path === '/setup' && request.method === 'GET') {
    const html = (await import('./lib/byok.js')).generateSetupHTML('DMLog.ai', '#d4af37');
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders() } });
  }

  if (path === '/api/byok/config' && request.method === 'POST') {
    try {
      const body = await request.json() as any;
      await (await import('./lib/byok.js')).saveBYOKConfig(body, request, env);
      return new Response(JSON.stringify({ saved: true }), { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
    } catch (err) {
      return errorResponse(500, 'internal');
    }
  }

  // Check BYOK config — redirect to setup if none
  const { loadBYOKConfig } = await import('./lib/byok.js');
  const byokConfig = await loadBYOKConfig(request, env);
  if (!byokConfig && path !== '/setup' && path !== '/api/byok/config') {
    // Allow through for static assets and health checks
    if (path !== '/' && path !== '/css/style.css' && path !== '/js/app.js' && path !== '/api/campaign' && path !== '/health') {
      // If no config and it's an API route that needs LLM, still allow but use fallback
    }
  }

  // ----- Health check -----
  // --- Seed Route ---
  // ----- Encounter Engine (PLATO TUTOR branching) -----
  const enc = {
    engine: await import('./lib/encounter-engine.js'),
    demo: await import('./data/demo-encounter.js'),
  };

  if (path === '/api/encounter/start' && request.method === 'POST') {
    const encounterId = crypto.randomUUID();
    const body = await request.json().catch(() => ({}));
    const graph = body.encounterId === 'dragons-lair' ? enc.demo.dragonLair : enc.demo.dragonLair;
    const state: ReturnType<typeof enc.engine.advance>['state'] = {
      encounterId,
      currentUnit: graph.startUnit,
      history: [],
      retries: {},
      helpUsed: [],
      completed: false,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };
    await env.WORLD_STATE.put(enc.engine.stateKey(encounterId), JSON.stringify(state));
    await env.WORLD_STATE.put(enc.engine.graphKey(encounterId), JSON.stringify(graph));
    return new Response(JSON.stringify({ encounterId, graph: graph.id, unit: graph.nodes[graph.startUnit], state }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  if (path === '/api/encounter/respond' && request.method === 'POST') {
    const body = await request.json();
    const { encounterId, choice, checkResult } = body;
    const raw = await env.WORLD_STATE.get(enc.engine.stateKey(encounterId));
    if (!raw) return new Response(JSON.stringify({ error: 'Encounter not found' }), { status: 404, headers: corsHeaders() });
    const state = JSON.parse(raw);
    const graphRaw = await env.WORLD_STATE.get(enc.engine.graphKey(encounterId));
    const graph = JSON.parse(graphRaw || '{}');
    const result = enc.engine.advance(graph, state, choice, checkResult);
    await env.WORLD_STATE.put(enc.engine.stateKey(encounterId), JSON.stringify(result.state));
    return new Response(JSON.stringify({ unit: result.unit, state: result.state, message: result.message }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  if (path === '/api/encounter/state' && request.method === 'GET') {
    const url = new URL(request.url);
    const encounterId = url.searchParams.get('id');
    if (!encounterId) return new Response(JSON.stringify({ error: 'Missing id param' }), { status: 400, headers: corsHeaders() });
    const raw = await env.WORLD_STATE.get(enc.engine.stateKey(encounterId));
    if (!raw) return new Response(JSON.stringify({ error: 'Encounter not found' }), { status: 404, headers: corsHeaders() });
    return new Response(raw, { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  if (path === '/api/encounter/help' && request.method === 'POST') {
    const body = await request.json();
    const { encounterId, returnFromHelp } = body;
    const raw = await env.WORLD_STATE.get(enc.engine.stateKey(encounterId));
    if (!raw) return new Response(JSON.stringify({ error: 'Encounter not found' }), { status: 404, headers: corsHeaders() });
    const state = JSON.parse(raw);
    const graphRaw = await env.WORLD_STATE.get(enc.engine.graphKey(encounterId));
    const graph = JSON.parse(graphRaw || '{}');
    const result = returnFromHelp ? enc.engine.returnFromHelp(graph, state) : enc.engine.triggerHelp(graph, state);
    await env.WORLD_STATE.put(enc.engine.stateKey(encounterId), JSON.stringify(result.state));
    return new Response(JSON.stringify({ unit: result.unit, state: result.state }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  if (path === '/api/encounter/graph' && request.method === 'GET') {
    const url = new URL(request.url);
    const encounterId = url.searchParams.get('id');
    const graph = encounterId
      ? JSON.parse(await env.WORLD_STATE.get(enc.engine.graphKey(encounterId)) || '{}')
      : enc.demo.dragonLair;
    const ascii = enc.engine.graphToAscii(graph);
    const dot = enc.engine.graphToDot(graph);
    return new Response(JSON.stringify({ graph, ascii, dot }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  if (path === "/api/seed" && request.method === "GET") {
    return new Response(JSON.stringify({ domain: "dmlog-ai", description: "AI Dungeon Master — D&D campaigns, NPC dialogue, combat", seedVersion: "2024.04",
      rules: ["D&D 5e core", "advantage/disadvantage", "bounded accuracy", "proficiency bonus", "saving throws", "skill checks"],
      systemPrompt: "You are DMLog, an AI Dungeon Master. Narrate adventures, play NPCs, manage combat, and track world state." }), { headers: { "Content-Type": "application/json" } });
  }

  if (path === "/health" && request.method === "GET") {
    return new Response(JSON.stringify({status:"ok",agent:"DMLog",files:57,lines:22012}),{headers:{"Content-Type":"application/json"}});
  }

  // ----- Static asset routes -----

  if (path === '/' && request.method === 'GET') {
    return serveStatic('index.html', 'text/html');
  }
  // PLATO TUTOR explorer
  if (path === '/plato' && request.method === 'GET') {
    return serveStatic('plato-explorer.html', 'text/html');
  }
  // PLATO history page
  if (path === '/history' && request.method === 'GET') {
    return serveStatic('plato-history.html', 'text/html');
  }
  if (path === '/app' && request.method === 'GET') {
    return serveStatic('app.html', 'text/html');
  }
  if (path === '/css/style.css' && request.method === 'GET') {
    return serveStatic('style.css', 'text/css');
  }
  if (path === '/js/app.js' && request.method === 'GET') {
    return serveStatic('app.js', 'application/javascript');
  }

  // ----- API: Campaign list (GET) and create (POST) -----

  if (path === '/api/campaign' && request.method === 'GET') {
    const campaigns = await getCampaignList(env);
    return new Response(JSON.stringify({ campaigns }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  if (path === '/api/campaign' && request.method === 'POST') {
    try {
      const body = await request.json() as { name?: string; system?: string };
      if (!body.name) return errorResponse(400, 'bad_request');

      const id = generateId();
      const campaign: CampaignMeta = {
        id,
        name: body.name,
        system: body.system ?? 'D&D 5e',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        characterCount: 0,
        sessionCount: 0,
      };

      const list = await getCampaignList(env);
      list.push(campaign);
      await saveCampaignList(list, env);

      const state = createDefaultWorldState(id);
      await env.WORLD_STATE.put(`campaign:${id}`, JSON.stringify(state));

      // Generate immersive opening narration (Fix 5: Onboarding Magic)
      const openingNarration = generateOpeningNarration(body.name);

      // Store initial narrative log entry
      state.narrativeLog.push({
        turn: 0,
        timestamp: Date.now(),
        playerAction: '(Campaign begins)',
        dmNarration: openingNarration,
        stateChanges: ['campaign_created'],
      });
      await env.WORLD_STATE.put(`campaign:${id}`, JSON.stringify(state));

      return new Response(JSON.stringify({ campaign, state, openingNarration }), {
        status: 201,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    } catch {
      return errorResponse(400, 'bad_request');
    }
  }

  // ----- API: Campaign by ID -----

  const campaignMatch = path.match(/^\/api\/campaign\/([a-f0-9]+)$/);
  if (campaignMatch) {
    const campaignId = campaignMatch[1];

    if (request.method === 'GET') {
      const raw = await env.WORLD_STATE.get(`campaign:${campaignId}`);
      if (!raw) return errorResponse(404, 'no_campaign');
      return new Response(raw, {
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    if (request.method === 'DELETE') {
      const list = await getCampaignList(env);
      const filtered = list.filter(c => c.id !== campaignId);
      await saveCampaignList(filtered, env);
      await env.WORLD_STATE.delete(`campaign:${campaignId}`);
      return new Response(JSON.stringify({ deleted: true }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
  }

  // ----- API: Campaign Snapshot -----

  const snapshotMatch = path.match(/^\/api\/campaign\/([a-f0-9]+)\/snapshot$/);
  if (snapshotMatch && request.method === 'POST') {
    const campaignId = snapshotMatch[1];
    try {
      const raw = await env.WORLD_STATE.get(`campaign:${campaignId}`);
      if (!raw) return errorResponse(404, 'no_campaign');
      const state: WorldState = JSON.parse(raw);

      // Load canon
      const canon = await getCanon(campaignId, env);

      // Build snapshot
      const snapshot = {
        campaignId,
        capturedAt: Date.now(),
        worldState: state,
        canon,
        summary: generateSnapshotSummary(state),
      };

      // Persist snapshot
      const snapshotId = generateId();
      await env.WORLD_STATE.put(`snapshot:${snapshotId}`, JSON.stringify(snapshot));

      // Return both JSON and formatted text
      const formatted = formatSnapshotText(snapshot);

      return new Response(JSON.stringify({
        snapshotId,
        snapshot,
        formatted,
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    } catch {
      return errorResponse(500, 'internal');
    }
  }

  // ----- API: Chat (with streaming support) -----

  if (path === '/api/chat' && request.method === 'POST') {
    try {
      const body = await request.json() as ChatRequest;
      if (!body.message) {
        return errorResponse(400, 'bad_request');
      }

      // Determine campaign — create ephemeral if not provided
      let campaignId = body.campaignId;
      let worldState: WorldState;

      if (!campaignId) {
        // No campaign specified — use a fallback or create ephemeral
        return errorResponse(400, 'bad_request');
      }

      // Rate limit
      const sessionId = campaignId;
      const allowed = await checkRateLimit(sessionId, env);
      if (!allowed) return errorResponse(429, 'rate_limited');

      // Load world state
      const raw = await env.WORLD_STATE.get(`campaign:${campaignId}`);
      if (!raw) return errorResponse(404, 'no_campaign');
      worldState = JSON.parse(raw);

      // Resolve character reference
      const characterRef = body.characterId
        ? worldState.characters.find(c => c.id === body.characterId)?.name ?? body.characterId
        : (worldState.characters[0]?.name ?? 'Adventurer');

      // Extract intent
      const intent = extractIntent(body.message);

      // Canon check: load established facts
      const canon = await getCanon(campaignId, env);
      const canonContext = canon.length > 0
        ? '\n\n## Established Canon (DO NOT contradict these facts)\n' + canon.map(f => `- ${f.fact}`).join('\n')
        : '';

      // Load emotion engine state (Fix 1)
      const { EmotionEngine } = await import('./game/emotions.js');
      const emotions = new EmotionEngine();
      const emotionData = await env.WORLD_STATE.get(`campaign:${campaignId}:relationships`);
      if (emotionData) emotions.deserialize(emotionData);
      const emotionContext = emotions.buildPromptContext();

      // Infer and apply relationship action from player message
      const emotionAction = emotions.inferActionFromMessage(body.message);
      if (emotionAction && worldState.npcs.length > 0) {
        const targetNpc = worldState.npcs[0]; // Apply to first known NPC
        emotions.applyAction(targetNpc.id, targetNpc.name, emotionAction, worldState.metadata.turnCount);
      }
      emotions.decay();

      // Load consequence tracker (Fix 2)
      const { ConsequenceTracker } = await import('./game/consequences.js');
      const consequences = new ConsequenceTracker();
      const consequenceData = await env.WORLD_STATE.get(`campaign:${campaignId}:choices`);
      if (consequenceData) consequences.deserialize(consequenceData);

      // Process pending consequences
      const pendingNotifications = consequences.processTurn(worldState.metadata.turnCount, body.message);
      const consequenceContext = consequences.buildPromptContext();

      // Check for surprise (Fix 3)
      const { SurpriseGenerator } = await import('./game/surprises.js');
      const surprises = new SurpriseGenerator();
      const surpriseData = await env.WORLD_STATE.get(`campaign:${campaignId}:surprises`);
      if (surpriseData) surprises.deserialize(surpriseData);
      const surprise = surprises.maybeGenerate({
        turnCount: worldState.metadata.turnCount,
        currentScene: worldState.metadata.currentScene,
        combatActive: worldState.combat?.active ?? false,
        npcIds: worldState.npcs.map(n => n.id),
        questNames: worldState.quests.filter(q => q.status === 'active').map(q => q.name),
        storyPhase: worldState.metadata.turnCount < 5 ? 'exposition' : worldState.metadata.turnCount < 15 ? 'rising_action' : 'climax',
        recentEvents: worldState.narrativeLog.slice(-3).map(e => e.dmNarration.slice(0, 100)),
        playerTags: Object.keys(consequences.getTagProfile()),
        surpriseHistory: surprises.getHistory(5),
      });

      // Build surprise context
      const surpriseContext = surprise
        ? `\n\n## Surprise Event!\nInject this into narration naturally: ${surprise.title} — ${surprise.description}\nPlayer prompt: ${surprise.playerPrompt}`
        : surprises.getHistorySummary();

      // Build LLM messages
      const systemPrompt = buildSystemPrompt(worldState, characterRef, intent) + canonContext +
        (emotionContext ? '\n\n' + emotionContext : '') +
        (consequenceContext ? '\n\n' + consequenceContext : '') +
        (surpriseContext ? '\n\n' + surpriseContext : '');
      const recentNarrative = worldState.narrativeLog.slice(-5).map(e =>
        `Player: ${e.playerAction}\nDM: ${e.dmNarration}`
      ).join('\n\n');

      const messages: LLMMessage[] = [
        { role: 'system', content: systemPrompt },
        ...parseHistoryMessages(recentNarrative),
        { role: 'user', content: body.message },
      ];

      // Check if client wants streaming (Accept: text/event-stream or ?stream=true)
      const wantsStream = url.searchParams.get('stream') === 'true'
        || request.headers.get('Accept') === 'text/event-stream';

      if (wantsStream) {
        // Streaming response
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const encoder = new TextEncoder();

        // Stream in background
        const streamPromise = (async () => {
          try {
            const narration = await callLLM(messages, env, async (chunk) => {
              await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', text: chunk })}\n\n`));
            });

            // Canon check on the full narration
            const contradiction = await checkCanonConsistency(campaignId, body.message, narration, env);
            if (contradiction) {
              await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'canon_warning', warning: contradiction })}\n\n`));
            }

            // Update canon from narration
            await updateCanonFromNarration(campaignId, narration, env);

            // Update world state
            worldState.metadata.turnCount++;
            worldState.metadata.updatedAt = Date.now();
            worldState.narrativeLog.push({
              turn: worldState.metadata.turnCount,
              timestamp: Date.now(),
              playerAction: body.message,
              dmNarration: narration,
              stateChanges: [`intent:${intent}`],
            });

            await env.WORLD_STATE.put(`campaign:${campaignId}`, JSON.stringify(worldState));

            // Persist new systems
            await env.WORLD_STATE.put(`campaign:${campaignId}:relationships`, emotions.serialize());
            await env.WORLD_STATE.put(`campaign:${campaignId}:choices`, consequences.serialize());
            await env.WORLD_STATE.put(`campaign:${campaignId}:surprises`, surprises.serialize());

            // Update campaign meta
            const list = await getCampaignList(env);
            const meta = list.find(c => c.id === campaignId);
            if (meta) {
              meta.updatedAt = Date.now();
              meta.sessionCount++;
              await saveCampaignList(list, env);
            }

            await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'done', narration, intent, consequenceNotifications: pendingNotifications, surprise: surprise ? { title: surprise.title, description: surprise.description } : null })}\n\n`));
          } catch (err) {
            console.error('[DMLog] Stream error:', err);
            await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: 'An arcane disturbance disrupted the weaving.' })}\n\n`));
          } finally {
            await writer.close();
          }
        })();

        // Prevent unhandled rejection
        streamPromise.catch(() => {});

        return new Response(readable, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            ...corsHeaders(),
          },
        });
      }

      // Non-streaming: call LLM and return JSON
      const cached = await deadbandCheck(env, JSON.stringify(messages));
      let narration;
      if (cached) { narration = cached; } else { narration = await callLLM(messages, env); await deadbandStore(env, JSON.stringify(messages), narration); }

      // Canon check
      const contradiction = await checkCanonConsistency(campaignId, body.message, narration, env);

      // Update canon from narration
      await updateCanonFromNarration(campaignId, narration, env);

      // Update world state
      worldState.metadata.turnCount++;
      worldState.metadata.updatedAt = Date.now();
      worldState.narrativeLog.push({
        turn: worldState.metadata.turnCount,
        timestamp: Date.now(),
        playerAction: body.message,
        dmNarration: narration,
        stateChanges: [`intent:${intent}`],
      });

      await env.WORLD_STATE.put(`campaign:${campaignId}`, JSON.stringify(worldState));

      // Persist new systems (Fixes 1-3)
      await env.WORLD_STATE.put(`campaign:${campaignId}:relationships`, emotions.serialize());
      await env.WORLD_STATE.put(`campaign:${campaignId}:choices`, consequences.serialize());
      await env.WORLD_STATE.put(`campaign:${campaignId}:surprises`, surprises.serialize());

      // Update campaign meta
      const list = await getCampaignList(env);
      const meta = list.find(c => c.id === campaignId);
      if (meta) {
        meta.updatedAt = Date.now();
        meta.sessionCount++;
        await saveCampaignList(list, env);
      }

      return new Response(JSON.stringify({
        narration,
        intent,
        canonWarning: contradiction,
        worldState,
        consequenceNotifications: pendingNotifications,
        surprise: surprise ? { title: surprise.title, description: surprise.description } : null,
      }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    } catch (err) {
      console.error('[DMLog] Chat error:', err);
      return errorResponse(500, 'internal');
    }
  }

  // ----- Campaign Lifecycle API routes -----

  const { handleCampaignRoutes } = await import('./game/campaign-api.js');
  const campaignResponse = await handleCampaignRoutes(path, request, env);
  if (campaignResponse) return campaignResponse;

  // ----- Pre-rendered Asset serving routes -----

  const { handleAssetServeRoutes } = await import('./game/asset-serve.js');
  const assetServeResponse = await handleAssetServeRoutes(path, request, env);
  if (assetServeResponse) return assetServeResponse;

  // ----- Asset Generation API routes -----

  const assetResponse = await handleAssetRoutes(path, request, env);
  if (assetResponse) return assetResponse;

  // ----- WebSocket upgrade -----

  if (path === '/ws') {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    handleWebSocket(server, env);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  return errorResponse(404, 'not_found');
}

// ---------------------------------------------------------------------------
// WebSocket Handler
// ---------------------------------------------------------------------------

function handleWebSocket(ws: WebSocket, env: Env): void {
  let campaignId: string | null = null;

  ws.addEventListener('message', async (event) => {
    try {
      const data = JSON.parse(event.data as string) as { type: string; payload: Record<string, unknown> };

      switch (data.type) {
        case 'join': {
          campaignId = data.payload.campaignId as string;
          ws.send(JSON.stringify({ type: 'joined', campaignId }));
          break;
        }

        case 'chat': {
          if (!campaignId) {
            ws.send(JSON.stringify({ type: 'error', message: 'Join a campaign first.' }));
            return;
          }

          const message = data.payload.message as string;
          const character = data.payload.character as string;

          // Load state
          const raw = await env.WORLD_STATE.get(`campaign:${campaignId}`);
          if (!raw) {
            ws.send(JSON.stringify({ type: 'error', message: 'Campaign not found.' }));
            return;
          }
          const worldState: WorldState = JSON.parse(raw);

          // Build messages and stream
          const intent = extractIntent(message);
          const systemPrompt = buildSystemPrompt(worldState, character, intent, env);
          const recentNarrative = worldState.narrativeLog.slice(-5).map(e =>
            `Player: ${e.playerAction}\nDM: ${e.dmNarration}`
          ).join('\n\n');

          const messages: LLMMessage[] = [
            { role: 'system', content: systemPrompt },
            ...parseHistoryMessages(recentNarrative),
            { role: 'user', content: message },
          ];

          // Stream narration
          ws.send(JSON.stringify({ type: 'start', intent }));
          const narration = await callLLM(messages, env, (chunk) => {
            ws.send(JSON.stringify({ type: 'chunk', text: chunk }));
          });
          ws.send(JSON.stringify({ type: 'done', narration }));

          // Update state
          worldState.metadata.turnCount++;
          worldState.metadata.updatedAt = Date.now();
          worldState.narrativeLog.push({
            turn: worldState.metadata.turnCount,
            timestamp: Date.now(),
            playerAction: message,
            dmNarration: narration,
            stateChanges: [`intent:${intent}`],
          });
          await env.WORLD_STATE.put(`campaign:${campaignId}`, JSON.stringify(worldState));

          break;
        }

        case 'ping': {
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
        }

        default:
          ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${data.type}` }));
      }
    } catch (err) {
      console.error('[DMLog] WebSocket error:', err);
      ws.send(JSON.stringify({ type: 'error', message: 'An arcane disturbance disrupted the connection.' }));
    }
  });

  ws.addEventListener('close', () => {
    campaignId = null;
  });

  // Accept the connection
  ws.accept();
}

// ---------------------------------------------------------------------------
// Prompt Building
// ---------------------------------------------------------------------------

function buildSystemPrompt(state: WorldState, character: string, intent: PlayerIntent, env?: Env): string {
  const currentScene = state.metadata.currentScene ?? 'Unknown location';
  const activeChars = state.characters.map(c => `${c.name} (${c.race} ${c.class} Lv${c.level}, HP: ${c.hp}/${c.maxHp}, AC: ${c.ac})`).join('; ');
  const activeNpcs = state.npcs.map(n => `${n.name} (${n.disposition})`).join('; ');
  const activeQuests = state.quests.filter(q => q.status === 'active').map(q => q.name).join(', ') ?? 'None';
  const inCombat = state.combat?.active ? `In combat — Round ${state.combat.round}` : 'Not in combat';
  const turnCount = state.metadata.turnCount;

  // Determine pacing mode from intent
  const pacingMode = inferPacingModeFromIntent(intent);

  // Build table-feel prompt
  const tableFeelPrompt = buildTableFeelPromptStr(pacingMode);

  // Build sensory narration hint based on scene
  const sensoryHint = buildSensoryHint(currentScene);

  return [
    DM_PERSONALITY,
    tableFeelPrompt,
    '',
    '## Campaign State',
    `Scene: ${currentScene}`,
    `Sensory context: ${sensoryHint}`,
    `Combat: ${inCombat}`,
    `Characters: ${activeChars || 'None yet'}`,
    `NPCs present: ${activeNpcs || 'None visible'}`,
    `Active quests: ${activeQuests}`,
    `Turn: ${turnCount}`,
    '',
    `Active character: ${character}`,
    `Player intent detected: ${intent}`,
    `Pacing mode: ${pacingMode}`,
    '',
    'Respond as the DM. Narrate the result of the player\'s action.',
    pacingMode === 'combat'
      ? 'Keep it fast and punchy. Focus on the action.'
      : pacingMode === 'roleplay'
        ? 'Let the scene breathe. Give NPCs depth and personality.'
        : 'Paint the scene with sensory details. Make the world feel alive.',
  ].join('\n');
}

/** Determine pacing mode from player intent type. */
function inferPacingModeFromIntent(intent: PlayerIntent): string {
  switch (intent) {
    case 'attack': case 'cast_spell': return 'combat';
    case 'rest': return 'rest';
    case 'talk': return 'roleplay';
    case 'move': return 'transition';
    default: return 'exploration';
  }
}

/** Build a sensory hint for the DM based on location name. */
function buildSensoryHint(sceneName: string): string {
  const lower = sceneName.toLowerCase();
  if (lower.includes('tavern') || lower.includes('inn')) return 'smell of ale and wood smoke, crackling hearth, murmur of conversation';
  if (lower.includes('dungeon') || lower.includes('cave')) return 'damp stone, dripping water, smell of mold, echo of footsteps';
  if (lower.includes('forest') || lower.includes('wood')) return 'pine scent, birdsong, dappled light, moss underfoot';
  if (lower.includes('mountain') || lower.includes('pass')) return 'thin cold air, howling wind, crunch of snow, vast views';
  if (lower.includes('market') || lower.includes('town') || lower.includes('city')) return 'spice and livestock, haggling, cobblestones, crowds';
  return 'ambient sounds, shifting light, the feel of the air';
}

/** Build the table-feel prompt addition. */
function buildTableFeelPromptStr(pacingMode: string): string {
  return [
    '',
    '## Table Feel — DM Style',
    `Current pacing: ${pacingMode}. ${pacingMode === 'combat' ? 'Keep action fast and visceral.' : pacingMode === 'roleplay' ? 'Slow down. Let dialogue breathe. Give NPCs depth.' : 'Rich sensory descriptions. Make the world feel real.'}`,
    'Always include at least one non-visual sensory detail (smell, sound, texture, or taste).',
    'When dice matter: natural 20 = epic description, natural 1 = humorous failure.',
    'If NPCs are present, briefly show their reaction to the player\'s action.',
  ].join('\n');
}

function parseHistoryMessages(history: string): LLMMessage[] {
  if (!history) return [];
  const messages: LLMMessage[] = [];
  const lines = history.split('\n');
  let currentRole: 'user' | 'assistant' | null = null;
  let currentContent = '';

  for (const line of lines) {
    if (line.startsWith('Player: ')) {
      if (currentRole && currentContent) {
        messages.push({ role: currentRole, content: currentContent.trim() });
      }
      currentRole = 'user';
      currentContent = line.slice(8);
    } else if (line.startsWith('DM: ')) {
      if (currentRole && currentContent) {
        messages.push({ role: currentRole, content: currentContent.trim() });
      }
      currentRole = 'assistant';
      currentContent = line.slice(4);
    } else {
      currentContent += '\n' + line;
    }
  }

  if (currentRole && currentContent) {
    messages.push({ role: currentRole, content: currentContent.trim() });
  }

  return messages;
}

// ---------------------------------------------------------------------------
// Demo Landing Page
// ---------------------------------------------------------------------------

function generateDemoHTML(): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DMLog.ai — AI Dungeon Master Live Demo</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Georgia,'Times New Roman',serif;background:#1a1a2e;color:#e0e0e0;min-height:100vh;display:flex;flex-direction:column}
a{color:#c9a23c;text-decoration:none}
a:hover{text-decoration:underline}
.hero{text-align:center;padding:2rem 1rem 1rem;background:linear-gradient(180deg,#0f0f23 0%,#1a1a2e 100%);border-bottom:2px solid #c9a23c}
.hero h1{color:#c9a23c;font-size:clamp(1.8rem,5vw,3rem);letter-spacing:2px;text-transform:uppercase}
.hero h1 span{color:#e0e0e0;font-weight:400;font-size:0.5em;display:block;letter-spacing:4px;margin-top:0.3rem}
.hero p{color:#888;margin-top:0.5rem;font-size:0.95rem}
.scene-panel{flex:1;max-width:800px;width:100%;margin:1rem auto;padding:0 1rem;overflow-y:auto}
.chat{display:flex;flex-direction:column;gap:0.75rem;padding:1rem 0}
.bubble{max-width:85%;padding:0.75rem 1rem;border-radius:12px;line-height:1.55;font-size:0.95rem;position:relative;animation:fadeSlide 0.5s ease both}
.bubble.dm{align-self:flex-start;background:#1e1e3a;border-left:3px solid #c9a23c;border-bottom-left-radius:2px}
.bubble.dm .role{color:#c9a23c;font-weight:bold;font-size:0.8rem;text-transform:uppercase;letter-spacing:1px;margin-bottom:0.3rem;display:block}
.bubble.player{align-self:flex-end;background:#162447;border-right:3px solid #4a9eff;border-bottom-right-radius:2px}
.bubble.player .role{color:#4a9eff;font-weight:bold;font-size:0.8rem;text-transform:uppercase;letter-spacing:1px;margin-bottom:0.3rem;display:block}
.bubble.system{align-self:center;background:rgba(201,162,60,0.1);border:1px solid #c9a23c44;border-radius:8px;padding:0.4rem 1rem;font-size:0.85rem;color:#c9a23c;text-align:center}
.dice{display:inline-flex;align-items:center;gap:0.3rem;background:#2a0a0a;color:#ff6b6b;padding:0.15rem 0.5rem;border-radius:6px;font-family:monospace;font-weight:bold;font-size:0.85rem;margin:0 0.15rem;border:1px solid #ff6b6b44}
.dice.crit{background:#0a2a0a;color:#4ade80;border-color:#4ade8044}
.dice.fail{background:#2a2a0a;color:#fbbf24;border-color:#fbbf2444}
@keyframes fadeSlide{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
.bubble:nth-child(1){animation-delay:0s}
.bubble:nth-child(2){animation-delay:0.6s}
.bubble:nth-child(3){animation-delay:1.2s}
.bubble:nth-child(4){animation-delay:1.8s}
.bubble:nth-child(5){animation-delay:2.4s}
.bubble:nth-child(6){animation-delay:3s}
.bubble:nth-child(7){animation-delay:3.6s}
.bubble:nth-child(8){animation-delay:4.2s}
.bubble:nth-child(9){animation-delay:4.8s}
.bubble:nth-child(10){animation-delay:5.4s}
.bubble:nth-child(11){animation-delay:6s}
.bubble:nth-child(12){animation-delay:6.6s}
.cta{text-align:center;padding:1.5rem 1rem 1rem;max-width:800px;width:100%;margin:0 auto}
.cta h2{color:#c9a23c;font-size:1.4rem;margin-bottom:0.5rem}
.cta p{color:#888;margin-bottom:1rem;font-size:0.9rem}
.cta-buttons{display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap}
.cta-buttons a,.cta-buttons button{padding:0.7rem 1.5rem;border-radius:8px;font-family:inherit;font-size:0.95rem;cursor:pointer;transition:all 0.2s;border:2px solid #c9a23c;background:transparent;color:#c9a23c}
.cta-buttons a:hover,.cta-buttons button:hover{background:#c9a23c;color:#1a1a2e}
.cta-buttons .primary{background:#c9a23c;color:#1a1a2e;font-weight:bold}
.cta-buttons .primary:hover{background:#d4b44a;border-color:#d4b44a}
.byok-bar{display:flex;gap:0.5rem;justify-content:center;align-items:center;flex-wrap:wrap;margin-top:1rem}
.byok-bar input{background:#0f0f23;border:1px solid #333;color:#e0e0e0;padding:0.6rem 1rem;border-radius:8px;font-family:monospace;font-size:0.85rem;width:280px}
.byok-bar input::placeholder{color:#555}
.byok-bar button{background:#c9a23c;color:#1a1a2e;border:none;padding:0.6rem 1.2rem;border-radius:8px;font-weight:bold;cursor:pointer;font-family:inherit}
.byok-bar button:hover{background:#d4b44a}
.actions{text-align:center;padding:0.75rem 1rem;max-width:800px;width:100%;margin:0 auto}
.actions a{color:#c9a23c;margin:0 1rem;font-size:0.85rem}
.fork-bar{background:#0f0f23;border-top:1px solid #333;padding:1.5rem 1rem;text-align:center}
.fork-bar h3{color:#888;font-size:0.8rem;text-transform:uppercase;letter-spacing:2px;margin-bottom:1rem}
.fork-buttons{display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap;align-items:center}
.fork-btn{display:inline-flex;align-items:center;gap:0.4rem;padding:0.5rem 1rem;background:#1e1e3a;border:1px solid #333;border-radius:8px;color:#e0e0e0;font-size:0.85rem;text-decoration:none;transition:border-color 0.2s}
.fork-btn:hover{border-color:#c9a23c;text-decoration:none}
.fork-btn svg{fill:currentColor;width:16px;height:16px}
.clone-box{background:#0f0f23;border:1px solid #333;border-radius:8px;padding:0.75rem 1rem;margin-top:1rem;max-width:600px;margin-left:auto;margin-right:auto;display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;justify-content:center}
.clone-box code{background:#1a1a2e;padding:0.4rem 0.75rem;border-radius:6px;font-family:monospace;font-size:0.78rem;color:#4ade80;white-space:nowrap;overflow-x:auto;max-width:100%}
.badges{display:flex;gap:0.75rem;justify-content:center;margin-top:0.75rem;flex-wrap:wrap}
.badges img{height:24px}
@media(max-width:600px){.bubble{max-width:92%;font-size:0.88rem}.clone-box code{font-size:0.7rem;white-space:normal}}
</style></head><body>

<div class="hero">
  <h1>DMLog.ai <span>AI Dungeon Master</span></h1>
  <p>Watch a live D&amp;D scene unfold — then bring your own key and play</p>
</div>

<div class="scene-panel">
  <div class="chat">
    <div class="bubble system">\u2694\ufe0f The Caverns of Ashenmoor — Round 3</div>
    <div class="bubble dm"><span class="role">\U0001f3ad Dungeon Master</span>The dragon's lair reeks of sulfur and ancient malice. <em>Vorathrex</em>, an adult red dragon, coils atop a mound of stolen treasure — gold coins cascading like water with every shift of her massive frame. Her amber eyes lock onto your party. <strong>"You dare bring steel into my domain?"</strong> Smoke curls between her teeth. The cavern walls glow faintly orange from veins of molten rock. The air itself seems to breathe, hot and oppressive.</div>
    <div class="bubble player"><span class="role">\u2694\ufe0f Kael — Human Fighter</span>I draw my longsword and step forward, shield raised. "We're here for the Scale of Truth, Vorathrex. Nothing more." I want to see if I can hold her attention.</div>
    <div class="bubble system">\U0001f3b2 Kael rolls Intimidation <span class="dice">d20+3 = <strong>17</strong></span> — Success!</div>
    <div class="bubble dm"><span class="role">\U0001f3ad Dungeon Master</span>Vorathrex's eyes narrow. For a heartbeat — just one — something flickers behind the ancient malice. <em>Respect? Fear?</em> She tilts her enormous head, and a low rumble emanates from deep within her chest. <strong>"Bold words for a creature that lives a mere century."</strong> But she doesn't attack. Not yet. Her tail sweeps behind her, scattering coins. <em>The rest of you feel the temperature drop slightly — she's listening.</em></div>
    <div class="bubble player"><span class="role">\U0001f52e Lyra — Elf Wizard</span>While she's focused on Kael, I begin whispering the incantation for <em>Dimension Door</em>. I need to get behind her — to the pedestal where the Scale of Truth sits, glowing faintly blue in the treasure pile. <span class="dice">d20+7 = <strong>14</strong></span> Arcana check to gauge the distance.</div>
    <div class="bubble dm"><span class="role">\U0001f3ad Dungeon Master</span>Lyra, your fingers trace the familiar sigils in the air. The weave responds — but Vorathrex's head snaps toward you mid-cast. <strong>"A weaver of tricks,"</strong> she hisses. Her eyes flash white-hot. She's going to beat you to it. <em>@Kael, @Theron, @Shadow — you have maybe six seconds before all hell breaks loose. What do you do?</em></div>
    <div class="bubble player"><span class="role">\U0001f941 Shadow — Halfling Rogue</span>I'm already moving. While Lyra was casting, I slipped into the shadows along the cavern wall. Now I sprint for the treasure pile — I need to grab the Scale before anyone breathes fire on it. <span class="dice">d20+9 = <strong class="crit">NAT 20!</strong></span> <span class="dice crit">\u2b50 Stealth — Critical Success!</span></div>
    <div class="bubble dm"><span class="role">\U0001f3ad Dungeon Master</span><em>Critical. The dice have spoken.</em> Shadow, you move like smoke. One moment you're pressed against the cavern wall, the next you're knee-deep in gold coins, fingers closing around the Scale of Truth. It's ice-cold and hums with power. Vorathrex roars — a sound that shakes the entire mountain. Treasure cascades around you. But you have it. <strong>The Scale is yours.</strong> <em>Now you just need to survive the next thirty seconds.</em></div>
    <div class="bubble player"><span class="role">\u271d\ufe0f Theron — Dwarf Cleric</span>I raise my holy symbol and call upon the Dawnfather. "Shield of Faith!" I cast it on Shadow — she's going to need it. Then I ready my Sacred Flame, aiming for Vorathrex's eyes. <span class="dice">d20+5 = <strong>11</strong></span></div>
    <div class="bubble dm"><span class="role">\U0001f3ad Dungeon Master</span>A warm golden light envelops Shadow <em>(+2 AC from Shield of Faith)</em> just as Vorathrex inhales deeply. The cavern dims as firelight is literally sucked into her maw. Theron, your Sacred Flame flickers and dies — the heat of the lair absorbs it. This is it. Vorathrex unleashes a torrent of flame. <span class="dice">d6\u00d78 Fire Breath <strong>= 31 damage</strong></span> Kael and Lyra, you're in the blast zone. <em>Lyra's Dimension Door shimmers — she can escape, but it'll cost her the spell entirely. Kael, that shield won't be enough alone...</em></div>
    <div class="bubble system">\u26a0\ufe0f The dragon's breath weapon fills the cavern. The party faces annihilation.</div>
  </div>
</div>

<div class="cta">
  <h2>Your Turn</h2>
  <p>This is what a DMLog.ai session looks like. The AI DM narrates, tracks rules, and reacts to your choices.</p>
  <div class="cta-buttons">
    <a href="/setup" class="primary">\u2699\ufe0f Set Up Your Game (BYOK)</a>
    <a href="/app">\U0001f3ae Enter the Realm</a>
  </div>
  <div class="byok-bar">
    <input type="password" id="byok-key" placeholder="Paste your OpenAI/Anthropic API key...">
    <button onclick="window.location.href='/setup'">Connect</button>
  </div>
</div>

<div class="actions">
  <a href="/setup">\u2699\ufe0f Setup</a>
  <a href="/health">\u2764\ufe0f Health</a>
  <a href="/api/seed">\U0001f331 Seed</a>
</div>

<div class="fork-bar">
  <h3>Open Source — Self-Host in 60 Seconds</h3>
  <div class="fork-buttons">
    <a class="fork-btn" href="https://github.com/Lucineer/dmlog-ai/fork" target="_blank">
      <svg viewBox="0 0 16 16"><path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm0 2.122a2.25 2.25 0 1 0-1.5 0v.878A2.25 2.25 0 0 0 5.75 8.5h1.5v2.128a2.251 2.251 0 1 0 1.5 0V8.5h1.5a2.25 2.25 0 0 0 2.25-2.25v-.878a2.25 2.25 0 1 0-1.5 0v.878a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 5 6.25v-.878zm3.75 7.378a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm3-8.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5z"/></svg>
      Fork
    </a>
    <a class="fork-btn" href="https://github.com/Lucineer/dmlog-ai" target="_blank">
      <svg viewBox="0 0 16 16"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25zm0 2.445L6.615 5.5a.75.75 0 0 1-.564.41l-3.097.45 2.24 2.184a.75.75 0 0 1 .216.664l-.528 3.084 2.769-1.456a.75.75 0 0 1 .698 0l2.77 1.456-.53-3.084a.75.75 0 0 1 .216-.664l2.24-2.183-3.096-.45a.75.75 0 0 1-.564-.41L8 2.694z"/></svg>
      Star
    </a>
  </div>
  <div class="clone-box">
    <span style="color:#888;font-size:0.8rem">Quick Deploy:</span>
    <code>git clone https://github.com/Lucineer/dmlog-ai.git &amp;&amp; cd dmlog-ai &amp;&amp; npm install &amp;&amp; npx wrangler deploy</code>
  </div>
  <div class="badges">
    <a href="https://github.com/Lucineer/dmlog-ai" target="_blank"><img src="https://img.shields.io/badge/Cloudflare-Workers-orange?logo=cloudflare" alt="Deploy to Cloudflare"></a>
    <a href="https://github.com/Lucineer/dmlog-ai" target="_blank"><img src="https://img.shields.io/badge/Docker-Ready-blue?logo=docker" alt="Docker Ready"></a>
    <a href="https://github.com/Lucineer/dmlog-ai" target="_blank"><img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License"></a>
  </div>
</div>

</body></html>`;
}

// ---------------------------------------------------------------------------
// Static Asset Serving
// ---------------------------------------------------------------------------

function serveStatic(filename: string, contentType: string): Response {
  // Placeholder: In production these would come from ASSETS binding or bundled HTML
  const placeholder: Record<string, string> = {
    'index.html': generateDemoHTML(),
    'app.html': `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DMLog.ai — Game</title><link rel="stylesheet" href="/css/style.css"></head><body><div id="game"></div><script src="/js/app.js"></script></body></html>`,
    'style.css': `/* DMLog.ai Styles */\n* { box-sizing: border-box; margin: 0; padding: 0; }\nbody { font-family: Georgia, 'Times New Roman', serif; background: #1a1a2e; color: #e0e0e0; }\n#app { max-width: 800px; margin: 2rem auto; padding: 2rem; text-align: center; }\nh1 { color: #d4af37; font-size: 2.5rem; margin-bottom: 1rem; }\na { color: #d4af37; }\n`,
    'app.js': `/* DMLog.ai Client */\nconsole.log('DMLog.ai loaded');\n`,
  };

  const content = placeholder[filename] ?? `/* ${filename} */`;
  return new Response(content, {
    headers: { 'Content-Type': contentType, ...corsHeaders() },
  });
}

// ---------------------------------------------------------------------------
// Worker Export
// ---------------------------------------------------------------------------

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return handleRequest(request, env);
  },
};