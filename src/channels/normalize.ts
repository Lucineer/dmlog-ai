/**
 * normalizeInput: converts channel-specific input to standard PlayerAction
 * normalizeOutput: converts game response to channel-specific format
 * Channel types: web, telegram, discord
 * Exports: normalizeInput(), normalizeOutput(), detectChannel()
 */

// --- Types ---

type ChannelType = 'web' | 'telegram' | 'discord';

interface PlayerAction {
  type: 'text' | 'command' | 'roll' | 'character' | 'inventory' | 'start' | 'play' | 'quick_action';
  content: string;
  metadata: {
    channelId?: string | number;
    userId?: string | number;
    username: string;
    sessionId: string;
    channel: ChannelType;
    attachments?: Attachment[];
  };
}

interface GameResponse {
  text: string;
  category: 'narrative' | 'combat' | 'system' | 'quest';
  actions?: string[];
  buttons?: Array<{ text: string; data: string }>;
  imageUrl?: string;
}

interface Attachment {
  type: 'image' | 'file';
  url: string;
  description?: string;
}

interface NormalizedOutput {
  text: string;
  format: 'plain' | 'markdown' | 'markdownv2' | 'discord_embed';
  color?: number;
  buttons?: Array<{ text: string; data: string }>;
  imageUrl?: string;
}

interface RequestHeaders {
  [key: string]: string | undefined;
}

// --- Command patterns ---

const COMMAND_PATTERNS: Array<{ pattern: RegExp; type: PlayerAction['type']; extract: (match: RegExpMatchArray) => string }> = [
  { pattern: /^\/start\b/i, type: 'start', extract: () => '' },
  { pattern: /^\/play\b/i, type: 'play', extract: () => '' },
  { pattern: /^\/roll\s*(.*)/i, type: 'roll', extract: (m) => m[1]?.trim() || '1d20' },
  { pattern: /^\/character\b/i, type: 'character', extract: () => '' },
  { pattern: /^\/inventory\b/i, type: 'inventory', extract: () => '' },
  { pattern: /^\/r\s+(.*)/i, type: 'roll', extract: (m) => m[1]?.trim() || '1d20' },
];

const DICE_NOTATION = /^(\d+)?d(\d+)([+-]\d+)?$/i;

// --- Channel detection ---

/**
 * Detect the channel type from request headers or metadata.
 */
export function detectChannel(headers: RequestHeaders): ChannelType {
  const userAgent = headers['user-agent'] ?? '';
  const xTelegramBot = headers['x-telegram-bot-api-secret-token'];
  const xDiscordSignature = headers['x-signature-ed25519'];

  if (xTelegramBot) return 'telegram';
  if (xDiscordSignature || userAgent.includes('Discord')) return 'discord';
  return 'web';
}

// --- Input normalization ---

/**
 * Normalize raw input from any channel into a standard PlayerAction.
 */
export function normalizeInput(
  raw: {
    text?: string;
    channelId?: string | number;
    userId?: string | number;
    username?: string;
    sessionId?: string;
    channel?: ChannelType;
    attachments?: Attachment[];
  },
): PlayerAction {
  const channel: ChannelType = raw.channel ?? 'web';
  const text = (raw.text ?? '').trim();
  const username = raw.username ?? 'Adventurer';
  const sessionId = raw.sessionId ?? `${channel}_${raw.userId ?? 'anon'}_${Date.now()}`;

  // Strip leading mention pings (e.g. <@123456789>)
  const cleaned = text.replace(/^<@\d+>\s*/, '').trim();

  // Try command patterns
  for (const { pattern, type, extract } of COMMAND_PATTERNS) {
    const match = cleaned.match(pattern);
    if (match) {
      return {
        type,
        content: extract(match),
        metadata: {
          channelId: raw.channelId,
          userId: raw.userId,
          username,
          sessionId,
          channel,
          attachments: raw.attachments,
        },
      };
    }
  }

  // Detect standalone dice notation (e.g. "2d6+3")
  const diceMatch = cleaned.match(DICE_NOTATION);
  if (diceMatch) {
    return {
      type: 'roll',
      content: cleaned,
      metadata: {
        channelId: raw.channelId,
        userId: raw.userId,
        username,
        sessionId,
        channel,
        attachments: raw.attachments,
      },
    };
  }

  // Default: plain text action
  return {
    type: 'text',
    content: cleaned,
    metadata: {
      channelId: raw.channelId,
      userId: raw.userId,
      username,
      sessionId,
      channel,
      attachments: raw.attachments,
    },
  };
}

// --- Output normalization ---

/**
 * Normalize a GameResponse into a channel-specific output format.
 */
export function normalizeOutput(
  response: GameResponse,
  channel: ChannelType,
): NormalizedOutput {
  switch (channel) {
    case 'telegram':
      return formatForTelegram(response);
    case 'discord':
      return formatForDiscord(response);
    case 'web':
    default:
      return formatForWeb(response);
  }
}

const CATEGORY_COLORS: Record<string, number> = {
  narrative: 0xc9a23c,
  combat: 0xe74c3c,
  system: 0x3498db,
  quest: 0x2ecc71,
};

const CATEGORY_EMOJI: Record<string, string> = {
  narrative: '\u{1F4D6}',
  combat: '\u2694\uFE0F',
  system: '\u{1F527}',
  quest: '\u{1F3F7}\uFE0F',
};

function formatForWeb(response: GameResponse): NormalizedOutput {
  return {
    text: response.text,
    format: 'markdown',
    color: CATEGORY_COLORS[response.category],
    buttons: response.buttons,
    imageUrl: response.imageUrl,
  };
}

function formatForTelegram(response: GameResponse): NormalizedOutput {
  const emoji = CATEGORY_EMOJI[response.category] ?? '';
  const escaped = escapeMarkdownV2(response.text);
  return {
    text: `${emoji} ${escaped}`,
    format: 'markdownv2',
    buttons: response.buttons,
    imageUrl: response.imageUrl,
  };
}

function formatForDiscord(response: GameResponse): NormalizedOutput {
  const emoji = CATEGORY_EMOJI[response.category] ?? '';
  const label = response.category.charAt(0).toUpperCase() + response.category.slice(1);
  return {
    text: `${emoji} **${label}**\n\n${response.text}`,
    format: 'discord_embed',
    color: CATEGORY_COLORS[response.category],
    buttons: response.buttons,
    imageUrl: response.imageUrl,
  };
}

/**
 * Escape text for Telegram MarkdownV2.
 */
function escapeMarkdownV2(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

// --- Re-export types ---
export type {
  ChannelType,
  PlayerAction,
  GameResponse,
  Attachment,
  NormalizedOutput,
};
