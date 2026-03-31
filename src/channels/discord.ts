/**
 * DiscordChannel: receives Discord interactions, normalizes to game actions, sends responses
 * Handles: slash commands, message commands, button interactions
 * Formats: game responses as Discord embeds with rich formatting
 * Exports: DiscordChannel class with handleInteraction(), sendMessage(), formatEmbed()
 */

// --- Types ---

interface DiscordConfig {
  applicationId: string;
  botToken: string;
  publicKey: string;
}

interface PlayerAction {
  type: 'text' | 'command' | 'roll' | 'character' | 'inventory' | 'play' | 'quick_action';
  content: string;
  metadata: {
    channelId: string;
    userId: string;
    username: string;
    sessionId: string;
    channel: 'discord';
    guildId?: string;
  };
}

interface GameResponse {
  text: string;
  category: 'narrative' | 'combat' | 'system' | 'quest';
  actions?: string[];
  buttons?: Array<{ text: string; data: string }>;
  imageUrl?: string;
}

interface DiscordInteraction {
  id: string;
  type: number; // 1 = PING, 2 = APPLICATION_COMMAND, 3 = MESSAGE_COMPONENT
  data?: InteractionData;
  channel_id?: string;
  guild_id?: string;
  member?: { user: DiscordUser };
  user?: DiscordUser;
  message?: { id: string; channel_id: string };
}

interface InteractionData {
  id: string;
  name: string;
  type?: number;
  options?: Array<{ name: string; value: string | number }>;
  custom_id?: string;
  component_type?: number;
  values?: string[];
}

interface DiscordUser {
  id: string;
  username: string;
  global_name?: string;
}

interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: EmbedField[];
  thumbnail?: { url: string };
  image?: { url: string };
  footer?: { text: string };
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// --- Color map ---

const CATEGORY_COLORS: Record<string, number> = {
  narrative: 0xc9a23c, // gold
  combat: 0xe74c3c,    // red
  system: 0x3498db,    // blue
  quest: 0x2ecc71,     // green
};

// --- Session store ---

const sessions = new Map<string, { id: string; lastActive: number; threadId?: string }>();

function getSession(channelId: string): string {
  const existing = sessions.get(channelId);
  if (existing) {
    existing.lastActive = Date.now();
    return existing.id;
  }
  const id = `dc_${channelId}_${Date.now()}`;
  sessions.set(channelId, { id, lastActive: Date.now() });
  return id;
}

// --- Rate limiter ---

const rateLimits = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;

function checkRateLimit(userId: string): boolean {
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

// --- DiscordChannel ---

export class DiscordChannel {
  private readonly config: DiscordConfig;
  private readonly apiBase = 'https://discord.com/api/v10';

  constructor(config: DiscordConfig) {
    this.config = config;
  }

  /**
   * Handle an incoming Discord interaction.
   * Returns a PlayerAction for game-relevant interactions, or null.
   */
  handleInteraction(interaction: DiscordInteraction): PlayerAction | null {
    // PING — must respond with type 1
    if (interaction.type === 1) {
      return null;
    }

    const user = interaction.member?.user ?? interaction.user;
    if (!user) return null;

    if (!checkRateLimit(user.id)) {
      return null; // silently drop — rate limit response handled by caller
    }

    const channelId = interaction.channel_id ?? '';
    const userId = user.id;
    const username = user.global_name ?? user.username;
    const guildId = interaction.guild_id;
    const sessionId = getSession(channelId);

    // Slash commands
    if (interaction.type === 2 && interaction.data) {
      return this.handleSlashCommand(
        interaction.data,
        channelId,
        userId,
        username,
        guildId,
        sessionId,
      );
    }

    // Button / select menu interactions
    if (interaction.type === 3 && interaction.data) {
      return this.handleComponent(
        interaction.data,
        channelId,
        userId,
        username,
        guildId,
        sessionId,
      );
    }

    return null;
  }

  private handleSlashCommand(
    data: InteractionData,
    channelId: string,
    userId: string,
    username: string,
    guildId: string | undefined,
    sessionId: string,
  ): PlayerAction {
    const base = {
      metadata: { channelId, userId, username, sessionId, channel: 'discord' as const, guildId },
    };

    switch (data.name) {
      case 'play':
        return { type: 'play', content: '', ...base };
      case 'roll': {
        const notation = data.options?.find((o) => o.name === 'notation')?.value ?? '1d20';
        return { type: 'roll', content: String(notation), ...base };
      }
      case 'character':
        return { type: 'character', content: '', ...base };
      case 'inventory':
        return { type: 'inventory', content: '', ...base };
      default:
        return { type: 'text', content: data.name, ...base };
    }
  }

  private handleComponent(
    data: InteractionData,
    channelId: string,
    userId: string,
    username: string,
    guildId: string | undefined,
    sessionId: string,
  ): PlayerAction {
    const base = {
      metadata: { channelId, userId, username, sessionId, channel: 'discord' as const, guildId },
    };

    const customId = data.custom_id ?? '';

    if (customId.startsWith('action:')) {
      return { type: 'quick_action', content: customId.slice(7), ...base };
    }

    // Select menu — target selection
    if (data.component_type === 3 && data.values?.length) {
      return { type: 'text', content: data.values[0], ...base };
    }

    return { type: 'text', content: customId, ...base };
  }

  /**
   * Format a GameResponse into a Discord embed.
   */
  formatEmbed(response: GameResponse): DiscordEmbed {
    const categoryEmoji: Record<string, string> = {
      narrative: '\u{1F4D6}',
      combat: '\u2694\uFE0F',
      system: '\u{1F527}',
      quest: '\u{1F3F7}\uFE0F',
    };

    const emoji = categoryEmoji[response.category] ?? '\u{1F3B2}';
    const color = CATEGORY_COLORS[response.category] ?? CATEGORY_COLORS.system;

    const embed: DiscordEmbed = {
      title: `${emoji} ${response.category.charAt(0).toUpperCase() + response.category.slice(1)}`,
      description: response.text.slice(0, 4096),
      color,
      footer: { text: 'DMLog.ai' },
    };

    if (response.imageUrl) {
      embed.image = { url: response.imageUrl };
    }

    return embed;
  }

  /**
   * Build action buttons for a game response.
   */
  buildActionButtons(): Array<{ type: number; label: string; custom_id: string; style: number }> {
    return [
      { type: 2, label: '\u2694\uFE0F Attack', custom_id: 'action:Attack', style: 4 },
      { type: 2, label: '\u{1F50D} Search', custom_id: 'action:Search', style: 1 },
      { type: 2, label: '\u{1F5E3}\uFE0F Talk', custom_id: 'action:Talk', style: 3 },
      { type: 2, label: '\u{1F6B6} Move', custom_id: 'action:Move', style: 2 },
    ];
  }

  /**
   * Send a GameResponse to a Discord channel.
   */
  async sendMessage(channelId: string, response: GameResponse): Promise<void> {
    const embed = this.formatEmbed(response);
    const components = response.buttons
      ? [
          {
            type: 1,
            components: response.buttons.map((b) => ({
              type: 2,
              label: b.text,
              custom_id: b.data,
              style: 2,
            })),
          },
        ]
      : [{ type: 1, components: this.buildActionButtons() }];

    await fetch(`${this.apiBase}/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bot ${this.config.botToken}`,
      },
      body: JSON.stringify({ embeds: [embed], components }),
    });
  }

  /**
   * Create an interaction response (for slash command acknowledgements).
   */
  async respondToInteraction(interactionId: string, response: GameResponse): Promise<void> {
    const embed = this.formatEmbed(response);
    await fetch(`${this.apiBase}/interactions/${interactionId}/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 4,
        data: { embeds: [embed] },
      }),
    });
  }

  /**
   * Create a thread for a new campaign session.
   */
  async createSessionThread(
    channelId: string,
    campaignName: string,
  ): Promise<string | null> {
    const res = await fetch(`${this.apiBase}/channels/${channelId}/threads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bot ${this.config.botToken}`,
      },
      body: JSON.stringify({
        name: `\u{1F3AE} ${campaignName}`,
        auto_archive_duration: 1440,
        type: 11,
      }),
    });
    const data = await res.json() as { id?: string };
    return data.id ?? null;
  }
}

// --- Re-export types ---
export type {
  DiscordConfig,
  PlayerAction,
  GameResponse,
  DiscordInteraction,
  DiscordEmbed,
};
