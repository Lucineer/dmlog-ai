/**
 * TelegramChannel: receives Telegram webhooks, normalizes to game actions, sends responses
 * Handles: text messages, /start command, /roll command, inline dice buttons
 * Formats: game responses as Telegram markdown with emoji
 * Exports: TelegramChannel class with handleWebhook(), sendMessage(), formatResponse()
 */

// --- Types ---

interface TelegramConfig {
  botToken: string;
  webhookUrl: string;
  apiBase?: string;
}

interface PlayerAction {
  type: 'text' | 'command' | 'roll' | 'character' | 'inventory' | 'start' | 'quick_action';
  content: string;
  metadata: {
    chatId: number;
    userId: number;
    username: string;
    sessionId: string;
    channel: 'telegram';
  };
}

interface GameResponse {
  text: string;
  category: 'narrative' | 'combat' | 'system' | 'quest';
  actions?: string[];
  buttons?: Array<{ text: string; data: string }>;
  imageUrl?: string;
}

interface TelegramMessage {
  message_id: number;
  chat: { id: number; type: string };
  from?: { id: number; username?: string; first_name?: string };
  text?: string;
  date: number;
}

interface TelegramCallbackQuery {
  id: string;
  from: { id: number; username?: string };
  message?: TelegramMessage;
  data?: string;
}

interface TelegramWebhookBody {
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// --- Session store ---

const sessions = new Map<number, { id: string; lastActive: number }>();

function getSession(chatId: number): string {
  const existing = sessions.get(chatId);
  if (existing) {
    existing.lastActive = Date.now();
    return existing.id;
  }
  const id = `tg_${chatId}_${Date.now()}`;
  sessions.set(chatId, { id, lastActive: Date.now() });
  return id;
}

// --- Rate limiter ---

const rateLimits = new Map<number, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;

function checkRateLimit(userId: number): boolean {
  const now = Date.now();
  const entry = rateLimits.get(userId);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }
  entry.count++;
  return true;
}

// --- TelegramChannel ---

export class TelegramChannel {
  private readonly config: TelegramConfig;
  private readonly apiBase: string;

  constructor(config: TelegramConfig) {
    this.config = config;
    this.apiBase = config.apiBase ?? `https://api.telegram.org/bot${config.botToken}`;
  }

  /**
   * Handle an incoming Telegram webhook payload.
   * Returns a PlayerAction if the message is processable, or null if ignored.
   */
  handleWebhook(body: TelegramWebhookBody): PlayerAction | null {
    // Handle callback queries (inline button presses)
    if (body.callback_query) {
      return this.handleCallbackQuery(body.callback_query);
    }

    // Handle text messages
    if (body.message?.text) {
      return this.handleMessage(body.message);
    }

    return null;
  }

  private handleMessage(msg: TelegramMessage): PlayerAction | null {
    if (!msg.from) return null;

    if (!checkRateLimit(msg.from.id)) {
      void this.sendRaw(msg.chat.id, '_Too many requests. Slow down, adventurer._');
      return null;
    }

    const text = msg.text.trim();
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const username = msg.from.username ?? msg.from.first_name ?? 'Adventurer';
    const sessionId = getSession(chatId);

    // Parse commands
    if (text.startsWith('/start')) {
      return {
        type: 'start',
        content: '',
        metadata: { chatId, userId, username, sessionId, channel: 'telegram' },
      };
    }

    if (text.startsWith('/roll')) {
      const notation = text.slice(5).trim() || '1d20';
      return {
        type: 'roll',
        content: notation,
        metadata: { chatId, userId, username, sessionId, channel: 'telegram' },
      };
    }

    if (text.startsWith('/character')) {
      return {
        type: 'character',
        content: '',
        metadata: { chatId, userId, username, sessionId, channel: 'telegram' },
      };
    }

    if (text.startsWith('/inventory')) {
      return {
        type: 'inventory',
        content: '',
        metadata: { chatId, userId, username, sessionId, channel: 'telegram' },
      };
    }

    // Regular text input
    return {
      type: 'text',
      content: text,
      metadata: { chatId, userId, username, sessionId, channel: 'telegram' },
    };
  }

  private handleCallbackQuery(cb: TelegramCallbackQuery): PlayerAction | null {
    if (!cb.message || !cb.data || !cb.from) return null;

    const chatId = cb.message.chat.id;
    const userId = cb.from.id;
    const username = cb.from.username ?? 'Adventurer';
    const sessionId = getSession(chatId);

    // Acknowledge the callback
    void this.answerCallbackQuery(cb.id);

    if (cb.data.startsWith('action:')) {
      const action = cb.data.slice(7);
      return {
        type: 'quick_action',
        content: action,
        metadata: { chatId, userId, username, sessionId, channel: 'telegram' },
      };
    }

    return {
      type: 'text',
      content: cb.data,
      metadata: { chatId, userId, username, sessionId, channel: 'telegram' },
    };
  }

  /**
   * Format a GameResponse into a Telegram-compatible MarkdownV2 string.
   */
  formatResponse(response: GameResponse): string {
    const emojiMap: Record<string, string> = {
      narrative: '\u{1F4D6}',
      combat: '\u2694\uFE0F',
      system: '\u{1F527}',
      quest: '\u{1F3F7}\uFE0F',
    };

    const emoji = emojiMap[response.category] ?? '\u{1F3B2}';
    const escaped = this.escapeMarkdownV2(response.text);
    return `${emoji} ${escaped}`;
  }

  /**
   * Build an inline keyboard for quick actions.
   */
  buildQuickActionKeyboard(): Array<InlineKeyboardButton[]> {
    const actions = [
      { text: '\u2694\uFE0F Attack', callback_data: 'action:Attack' },
      { text: '\u{1F50D} Search', callback_data: 'action:Search' },
      { text: '\u{1F5E3}\uFE0F Talk', callback_data: 'action:Talk' },
      { text: '\u{1F6B6} Move', callback_data: 'action:Move' },
    ];
    return [actions.slice(0, 2), actions.slice(2, 4)];
  }

  /**
   * Send a GameResponse to a Telegram chat.
   */
  async sendMessage(chatId: number, response: GameResponse): Promise<void> {
    const text = this.formatResponse(response);
    const replyMarkup = response.buttons
      ? {
          inline_keyboard: response.buttons.map((b) => [
            { text: b.text, callback_data: b.data },
          ]),
        }
      : { inline_keyboard: this.buildQuickActionKeyboard() };

    const payload = {
      chat_id: chatId,
      text,
      parse_mode: 'MarkdownV2',
      reply_markup: replyMarkup,
    };

    await fetch(`${this.apiBase}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  /**
   * Send raw text to a chat (for system messages).
   */
  private async sendRaw(chatId: number, text: string): Promise<void> {
    await fetch(`${this.apiBase}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'MarkdownV2' }),
    });
  }

  /**
   * Acknowledge a callback query (stops the loading spinner on the button).
   */
  private async answerCallbackQuery(callbackQueryId: string): Promise<void> {
    await fetch(`${this.apiBase}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId }),
    });
  }

  /**
   * Escape special characters for Telegram MarkdownV2.
   */
  private escapeMarkdownV2(text: string): string {
    const special = /([_*\[\]()~`>#+\-=|{}.!\\])/g;
    return text.replace(special, '\\$1');
  }

  /**
   * Register the webhook with Telegram's servers.
   */
  async registerWebhook(): Promise<void> {
    await fetch(
      `${this.apiBase}/setWebhook?url=${encodeURIComponent(this.config.webhookUrl)}`,
    );
  }
}

// --- Re-export types for consumers ---
export type {
  TelegramConfig,
  PlayerAction,
  GameResponse,
  TelegramWebhookBody,
};
