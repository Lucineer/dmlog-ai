// src/game/npc-memory.ts

export interface NPC {
  id: string;
  name: string;
  race: string;
  class: string;
  appearance: string;
  personality: string;
  voice: string;
  secrets: string[];
  relationships: Record<string, NPCRelation>;
  firstAppearance: number;
  lastSeen: number;
  sessionsAppeared: number;
  location?: string;
  status: 'alive' | 'dead' | 'unknown' | 'transformed';
}

export interface NPCRelation {
  npcId: string;
  type: 'ally' | 'enemy' | 'neutral