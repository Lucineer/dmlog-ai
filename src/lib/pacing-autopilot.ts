// pacing-autopilot.ts — Detect engagement decay and inject kinetic events
// Feature 1 from DeepSeek-Reasoner actualization: reads the table's energy before humans notice

export interface MessageMetric {
  timestamp: number;
  length: number;          // character count
  turnIndex: number;       // position in session
  isOOC: boolean;          // out of character
  isDiceRoll: boolean;
  sentiment?: number;      // -1 to 1
}

export interface EngagementState {
  level: 'high' | 'medium' | 'low' | 'critical';
  trend: 'rising' | 'stable' | 'falling' | 'crashing';
  turnsInState: number;
  recommendation: string;
  suggestedEvent?: PacingEvent;
}

export interface PacingEvent {
  type: 'kinetic' | 'mystery' | 'social' | 'environmental' | 'npc';
  description: string;
  intensity: number;  // 1-5
  triggerCondition: string;
}

// Analyze recent messages to detect engagement state
export function analyzeEngagement(
  messages: MessageMetric[],
  windowSize = 5
): EngagementState {
  if (messages.length < 3) {
    return { level: 'high', trend: 'stable', turnsInState: 0, recommendation: 'Need more data' };
  }
  
  const recent = messages.slice(-windowSize);
  const older = messages.slice(-windowSize * 2, -windowSize);
  
  // Metrics
  const avgLengthRecent = recent.reduce((s, m) => s + m.length, 0) / recent.length;
  const avgLengthOlder = older.length > 0 ? older.reduce((s, m) => s + m.length, 0) / older.length : avgLengthRecent;
  const oocRateRecent = recent.filter(m => m.isOOC).length / recent.length;
  const diceRateRecent = recent.filter(m => m.isDiceRoll).length / recent.length;
  
  // Engagement score (0-1)
  const lengthDecay = older.length > 0 ? avgLengthRecent / avgLengthOlder : 1;
  const oocPenalty = Math.min(0.3, oocRateRecent * 0.3);
  const diceSpamPenalty = diceRateRecent > 0.6 ? 0.2 : 0;
  const score = Math.max(0, Math.min(1, lengthDecay - oocPenalty - diceSpamPenalty));
  
  // Trend detection
  let trend: EngagementState['trend'] = 'stable';
  if (score > 0.8) trend = 'rising';
  else if (score > 0.6) trend = 'stable';
  else if (score > 0.4) trend = 'falling';
  else trend = 'crashing';
  
  // Level
  let level: EngagementState['level'];
  let recommendation: string;
  let suggestedEvent: PacingEvent | undefined;
  
  if (score >= 0.8) {
    level = 'high';
    recommendation = 'Players engaged. Deepen the current scene. Do not interrupt.';
  } else if (score >= 0.6) {
    level = 'medium';
    recommendation = 'Steady engagement. Consider a minor complication or clue.';
  } else if (score >= 0.4) {
    level = 'low';
    recommendation = 'Engagement fading. Introduce a surprise element.';
    suggestedEvent = selectEvent('low');
  } else {
    level = 'critical';
    recommendation = 'Engagement critical. Inject kinetic event immediately.';
    suggestedEvent = selectEvent('critical');
  }
  
  // Count turns in current state
  const turnsInState = recent.filter(m => {
    const mScore = m.length / (avgLengthOlder || 200);
    return mScore < (level === 'critical' ? 0.4 : level === 'low' ? 0.6 : 1);
  }).length;
  
  return { level, trend, turnsInState, recommendation, suggestedEvent };
}

// Select appropriate pacing event based on engagement level
function selectEvent(level: 'low' | 'critical'): PacingEvent {
  const events: PacingEvent[] = [
    {
      type: 'environmental',
      description: 'The lights flicker and die. Something stirs in the darkness.',
      intensity: 3,
      triggerCondition: 'engagement_low_indoor',
    },
    {
      type: 'kinetic',
      description: 'A distant explosion rocks the building. Dust falls from the ceiling.',
      intensity: 4,
      triggerCondition: 'engagement_critical',
    },
    {
      type: 'mystery',
      description: 'A bloodstained note slides under the door. It reads: "They are listening."',
      intensity: 3,
      triggerCondition: 'engagement_low_social',
    },
    {
      type: 'npc',
      description: 'An NPC bursts in, gasping: "You need to see this. Now."',
      intensity: 4,
      triggerCondition: 'engagement_critical_exploration',
    },
    {
      type: 'environmental',
      description: 'The temperature drops suddenly. Your breath forms clouds. Something unnatural approaches.',
      intensity: 3,
      triggerCondition: 'engagement_low_combat',
    },
    {
      type: 'kinetic',
      description: 'The ground trembles. A crack splinters across the floor, and green light seeps through.',
      intensity: 5,
      triggerCondition: 'engagement_critical_stalled',
    },
    {
      type: 'mystery',
      description: 'You notice something that was not there before: a symbol carved into the wall, still fresh.',
      intensity: 2,
      triggerCondition: 'engagement_low_exploration',
    },
    {
      type: 'social',
      description: 'A rival party enters the tavern. They are clearly after the same bounty.',
      intensity: 3,
      triggerCondition: 'engagement_low_town',
    },
  ];
  
  if (level === 'critical') {
    // Higher intensity events for critical engagement
    const critical = events.filter(e => e.intensity >= 4);
    return critical[Math.floor(Math.random() * critical.length)];
  }
  return events[Math.floor(Math.random() * events.length)];
}

// Parse a chat message into metrics
export function parseMessageMetric(
  content: string,
  turnIndex: number
): MessageMetric {
  return {
    timestamp: Date.now(),
    length: content.length,
    turnIndex,
    isOOC: /^\(.*\)$/.test(content.trim()) || content.startsWith('(OOC)'),
    isDiceRoll: /\d+d\d+/i.test(content) || /^\/roll/i.test(content),
  };
}

// Store engagement data for cross-session learning
export interface EngagementRecord {
  sessionId: string;
  domain: string;
  timestamp: number;
  engagementScores: number[];  // per-turn scores
  eventsTriggered: number;
  eventsEffective: number;     // did engagement recover after event?
  avgRecoveryTime: number;     // turns to recover
}

// Track whether a pacing event was effective
export function evaluateEventEffectiveness(
  preEventScore: number,
  postEventScores: number[]
): boolean {
  if (postEventScores.length < 2) return false;
  const avgPost = postEventScores.reduce((a, b) => a + b, 0) / postEventScores.length;
  return avgPost > preEventScore * 1.2; // 20% improvement = effective
}
