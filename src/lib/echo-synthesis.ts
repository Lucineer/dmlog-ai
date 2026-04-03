// echo-synthesis.ts — Cross-Campaign Echo Synthesis
// Feature 2 from DeepSeek-Reasoner actualization: reintroduce echoes of past stories

export interface MemorableMoment {
  id: string;
  sessionId: string;
  campaignId: string;
  timestamp: number;
  description: string;
  emotionalValence: number;    // -1 (tragic) to 1 (triumphant)
  tags: string[];              // ['combat', 'betrayal', 'sacrifice', 'humor']
  characters: string[];        // NPCs and players involved
  location: string;
  engagementScore: number;     // how engaged players were
  echoCount: number;           // how many times this has been referenced
  lastEchoed: number;          // last time this was referenced
}

export interface EchoCandidate {
  moment: MemorableMoment;
  relevance: number;           // 0-1, how relevant to current scene
  recency: number;             // 0-1, faded over time (but never to 0)
  resonance: number;           // 0-1, emotional match to current mood
  diversity: number;           // 0-1, prefer moments not recently echoed
  score: number;               // weighted combination
}

// Extract memorable moments from session transcript
export function extractMemorableMoments(
  sessionId: string,
  campaignId: string,
  messages: { role: string; content: string; engagementScore?: number }[]
): MemorableMoment[] {
  const moments: MemorableMoment[] = [];
  
  // Simple heuristic: long messages + high engagement = memorable
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const content = msg.content.toLowerCase();
    
    // Detect emotional intensity
    let emotionalValence = 0;
    const triumphantWords = ['victory', 'cheer', 'celebrate', 'hero', 'triumph', 'saved', 'won', 'finally'];
    const tragicWords = ['death', 'sacrifice', 'betrayal', 'loss', 'fallen', 'grief', 'goodbye', 'no!'];
    
    for (const w of triumphantWords) if (content.includes(w)) emotionalValence += 0.3;
    for (const w of tragicWords) if (content.includes(w)) emotionalValence -= 0.3;
    emotionalValence = Math.max(-1, Math.min(1, emotionalValence));
    
    // Only capture high-intensity moments
    if (Math.abs(emotionalValence) >= 0.3 && msg.content.length > 100) {
      // Extract tags from content
      const tags: string[] = [];
      if (/fight|attack|slash|fireball|sword/i.test(content)) tags.push('combat');
      if (/talk|negotiate|persuade|convince/i.test(content)) tags.push('social');
      if (/discover|find|secret|hidden/i.test(content)) tags.push('discovery');
      if (/sacrifice|die|death|fallen/i.test(content)) tags.push('tragedy');
      if (/laugh|joke|funny|prank/i.test(content)) tags.push('humor');
      if (/betray|lie|deceive|trick/i.test(content)) tags.push('betrayal');
      if (/romance|love|kiss|embrace/i.test(content)) tags.push('romance');
      
      if (tags.length > 0) {
        moments.push({
          id: `moment-${sessionId}-${i}`,
          sessionId,
          campaignId,
          timestamp: Date.now(),
          description: msg.content.slice(0, 300),
          emotionalValence,
          tags,
          characters: [], // extracted by NPC detection separately
          location: '',   // extracted by scene detection separately
          engagementScore: msg.engagementScore || 0.5,
          echoCount: 0,
          lastEchoed: 0,
        });
      }
    }
  }
  
  return moments;
}

// Find the best echo to inject into current scene
export function findBestEcho(
  currentScene: {
    mood: number;          // emotional valence of current scene
    tags: string[];        // current scene tags
    characters: string[];  // currently present NPCs
    location: string;
  },
  moments: MemorableMoment[],
  maxAgeDays = 90
): EchoCandidate | null {
  if (moments.length === 0) return null;
  
  const now = Date.now();
  const maxAge = maxAgeDays * 86400000;
  
  const candidates = moments
    .filter(m => {
      const age = now - m.timestamp;
      return age < maxAge; // Not too old
    })
    .map(moment => {
      // Relevance: tag overlap with current scene
      const tagOverlap = moment.tags.filter(t => currentScene.tags.includes(t)).length;
      const relevance = moment.tags.length > 0 ? tagOverlap / moment.tags.length : 0;
      
      // Recency: exponential decay, but with a floor
      const age = now - moment.timestamp;
      const recency = Math.max(0.1, Math.exp(-age / (30 * 86400000)));
      
      // Resonance: emotional match
      const resonance = 1 - Math.abs(moment.emotionalValence - currentScene.mood) / 2;
      
      // Diversity: prefer moments not recently echoed
      const timeSinceEcho = moment.lastEchoed ? now - moment.lastEchoed : maxAge;
      const diversity = Math.min(1, timeSinceEcho / (7 * 86400000));
      
      // Character bonus: if a moment's character is present
      const charOverlap = moment.characters.filter(c => currentScene.characters.includes(c)).length;
      const charBonus = charOverlap > 0 ? 0.2 : 0;
      
      // Weighted score
      const score = relevance * 0.35 + recency * 0.15 + resonance * 0.3 + diversity * 0.2 + charBonus;
      
      return { moment, relevance, recency, resonance, diversity, score };
    })
    .filter(c => c.relevance > 0 || c.resonance > 0.5) // Must have SOME connection
    .sort((a, b) => b.score - a.score);
  
  // Don't echo too frequently
  if (candidates.length > 0 && candidates[0].score > 0.3) {
    return candidates[0];
  }
  
  return null;
}

// Generate echo dialogue from a memorable moment
export function generateEchoDialogue(
  echo: EchoCandidate,
  currentContext: string
): string {
  const moment = echo.moment;
  
  // Choose echo style based on emotional valence
  if (moment.emotionalValence > 0.3) {
    // Positive echo — warm callback
    return `As ${currentContext}, a memory surfaces — ${moment.description.slice(0, 100)}... The feeling of that moment lingers, coloring the present with familiar warmth.`;
  } else if (moment.emotionalValence < -0.3) {
    // Negative echo — haunting callback  
    return `Something about this scene triggers an echo of the past... ${moment.description.slice(0, 100)}... The weight of that memory hangs heavy in the air.`;
  } else {
    // Neutral echo — subtle callback
    return `A familiar pattern emerges — reminiscent of ${moment.description.slice(0, 80)}... History rhymes.`;
  }
}

// Update echo tracking after an echo is used
export function recordEcho(moment: MemorableMoment): MemorableMoment {
  return {
    ...moment,
    echoCount: moment.echoCount + 1,
    lastEchoed: Date.now(),
  };
}
