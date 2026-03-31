/**
 * CampaignCoordinator: A2A protocol for multi-campaign worlds
 * Enables: shared world events, NPC travel between campaigns, trade
 * Protocol messages: WORLD_EVENT, NPC_TRAVEL, TRADE_OFFER, QUEST_SHARE
 * Exports: CampaignCoordinator class with broadcast(), receive(), getStatus()
 */

// --- Types ---

type A2AMessageType = 'WORLD_EVENT' | 'NPC_TRAVEL' | 'TRADE_OFFER' | 'QUEST_SHARE' | 'STATUS' | 'ACK';

interface A2AMessage {
  id: string;
  type: A2AMessageType;
  from: string;       // campaign ID of sender
  to: string | '*';   // campaign ID of recipient, or '*' for broadcast
  timestamp: number;
  payload: Record<string, unknown>;
  signature: string;
}

interface WorldEventPayload {
  eventName: string;
  description: string;
  affectedRegions: string[];
  severity: 'minor' | 'moderate' | 'major';
  duration: string;
}

interface NPCTravelPayload {
  npcName: string;
  npcStats: Record<string, unknown>;
  originCampaign: string;
  destinationCampaign: string;
  reason: string;
  inventory: string[];
}

interface TradeOfferPayload {
  offeredBy: string;
  items: Array<{ name: string; quantity: number }>;
  requestedItems: Array<{ name: string; quantity: number }>;
  goldOffer: number;
  goldRequested: number;
  expiresAt: number;
}

interface QuestSharePayload {
  questName: string;
  description: string;
  objectives: string[];
  rewards: string[];
  isSharedObjective: boolean; // true = both campaigns contribute to same goal
}

interface CampaignStatus {
  campaignId: string;
  name: string;
  dmName: string;
  playerCount: number;
  currentAct: number;
  currentScene: string;
  activeQuests: number;
  lastActivity: number;
  connectedCampaigns: string[];
}

interface CoordinatorConfig {
  campaignId: string;
  sharedSecret: string;
  peerEndpoints?: string[];
}

// --- Simple message signing (HMAC-like using shared secret) ---

async function signMessage(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function verifySignature(
  message: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const expected = await signMessage(message, secret);
  return expected === signature;
}

// --- CampaignCoordinator ---

export class CampaignCoordinator {
  private readonly config: CoordinatorConfig;
  private readonly peers: Map<string, CampaignStatus> = new Map();
  private readonly messageLog: A2AMessage[] = [];
  private readonly messageHandlers: Map<A2AMessageType, Array<(msg: A2AMessage) => Promise<void>>> = new Map();

  constructor(config: CoordinatorConfig) {
    this.config = config;
  }

  /**
   * Register a handler for a specific message type.
   */
  on(type: A2AMessageType, handler: (msg: A2AMessage) => Promise<void>): void {
    const handlers = this.messageHandlers.get(type) ?? [];
    handlers.push(handler);
    this.messageHandlers.set(type, handlers);
  }

  /**
   * Broadcast a world event to all connected campaigns.
   */
  async broadcast(event: WorldEventPayload): Promise<void> {
    const message = await this.createMessage('WORLD_EVENT', '*', event);
    await this.sendToPeers(message);
  }

  /**
   * Send an NPC to another campaign.
   */
  async sendNPC(npc: NPCTravelPayload): Promise<void> {
    const message = await this.createMessage('NPC_TRAVEL', npc.destinationCampaign, npc);
    await this.sendToPeers(message);
  }

  /**
   * Offer a trade to another campaign.
   */
  async offerTrade(trade: TradeOfferPayload): Promise<void> {
    const message = await this.createMessage('TRADE_OFFER', trade.offeredBy, trade);
    await this.sendToPeers(message);
  }

  /**
   * Share a quest with connected campaigns.
   */
  async shareQuest(quest: QuestSharePayload): Promise<void> {
    const message = await this.createMessage('QUEST_SHARE', '*', quest);
    await this.sendToPeers(message);
  }

  /**
   * Receive and process an incoming A2A message.
   * Verifies signature and dispatches to registered handlers.
   */
  async receive(raw: A2AMessage): Promise<boolean> {
    // Verify signature
    const payloadStr = JSON.stringify(raw.payload);
    const dataToVerify = `${raw.type}:${raw.from}:${raw.to}:${raw.timestamp}:${payloadStr}`;
    const valid = await verifySignature(dataToVerify, raw.signature, this.config.sharedSecret);
    if (!valid) return false;

    this.messageLog.push(raw);

    // Update peer status
    if (raw.type === 'STATUS') {
      const status = raw.payload as unknown as CampaignStatus;
      this.peers.set(status.campaignId, status);
    }

    // Dispatch to handlers
    const handlers = this.messageHandlers.get(raw.type) ?? [];
    for (const handler of handlers) {
      await handler(raw);
    }

    return true;
  }

  /**
   * Get the current status of this campaign and its peers.
   */
  getStatus(): CampaignStatus & { peers: CampaignStatus[] } {
    return {
      campaignId: this.config.campaignId,
      name: '',
      dmName: '',
      playerCount: 0,
      currentAct: 1,
      currentScene: '',
      activeQuests: 0,
      lastActivity: Date.now(),
      connectedCampaigns: Array.from(this.peers.keys()),
      peers: Array.from(this.peers.values()),
    };
  }

  /**
   * Get the message log for debugging/audit.
   */
  getMessageLog(): A2AMessage[] {
    return [...this.messageLog];
  }

  // --- Private helpers ---

  private async createMessage(
    type: A2AMessageType,
    to: string | '*',
    payload: Record<string, unknown>,
  ): Promise<A2AMessage> {
    const timestamp = Date.now();
    const id = `${this.config.campaignId}_${type}_${timestamp}`;
    const payloadStr = JSON.stringify(payload);
    const dataToSign = `${type}:${this.config.campaignId}:${to}:${timestamp}:${payloadStr}`;
    const signature = await signMessage(dataToSign, this.config.sharedSecret);

    return { id, type, from: this.config.campaignId, to, timestamp, payload, signature };
  }

  private async sendToPeers(message: A2AMessage): Promise<void> {
    const endpoints = this.config.peerEndpoints ?? [];
    for (const endpoint of endpoints) {
      try {
        await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message),
        });
      } catch {
        // Peer unreachable — log and continue
      }
    }
  }
}

// --- Re-export types ---
export type {
  A2AMessage,
  A2AMessageType,
  WorldEventPayload,
  NPCTravelPayload,
  TradeOfferPayload,
  QuestSharePayload,
  CampaignStatus,
  CoordinatorConfig,
};
