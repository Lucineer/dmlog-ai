// belief-economy.ts — Belief as a Transactional Resource Economy
// Feature 3 from DeepSeek-Reasoner actualization: gods compete for belief capital
// Not devotion — a transactional economy where belief is earned, spent, invested, lost

export interface BeliefCapital {
  deityId: string;
  capital: number;         // 0-1000, belief wealth
  income: number;          // belief earned per session
  expenses: number;        // belief spent on miracles
  investments: string[];   // mortals/guilds the deity has invested belief in
  marketShare: number;     // percentage of total belief in the pantheon
  trend: 'growing' | 'stable' | 'declining' | 'desperate';
  desperation: number;     // 0-1, how likely to take risks when declining
}

export interface BeliefTransaction {
  type: 'prayer' | 'miracle' | 'sacrifice' | 'desecration' | 'conversion' | 'abandonment';
  deityId: string;
  amount: number;
  source: string;          // player action, NPC action, world event
  timestamp: number;
  sessionId: string;
  narrative: string;       // story explanation
}

export interface BeliefMarket {
  totalBelief: number;
  deities: Map<string, BeliefCapital>;
  transactions: BeliefTransaction[];
  gdp: number;             // total belief transactions per session
  inflation: number;       // belief devaluation over time
}

// Initialize belief market from deity system
export function initializeBeliefMarket(
  deityIds: string[],
  startingCapital = 100
): BeliefMarket {
  const deities = new Map<string, BeliefCapital>();
  
  for (const id of deityIds) {
    deities.set(id, {
      deityId: id,
      capital: startingCapital + Math.random() * 50 - 25, // Some variance
      income: 5 + Math.random() * 10,
      expenses: 2 + Math.random() * 5,
      investments: [],
      marketShare: 0, // computed
      trend: 'stable',
      desperation: 0,
    });
  }
  
  const market: BeliefMarket = {
    totalBelief: 0,
    deities,
    transactions: [],
    gdp: 0,
    inflation: 0,
  };
  
  updateMarketShares(market);
  return market;
}

// Process a belief transaction
export function processTransaction(
  market: BeliefMarket,
  transaction: BeliefTransaction
): { effects: string[]; narrative: string } {
  const deity = market.deities.get(transaction.deityId);
  if (!deity) return { effects: [], narrative: 'Unknown deity.' };
  
  const effects: string[] = [];
  let narrative = '';
  
  switch (transaction.type) {
    case 'prayer':
      deity.capital += transaction.amount;
      deity.income += transaction.amount * 0.1; // Slight income boost
      effects.push(`${deity.deityId} gains ${transaction.amount} belief`);
      narrative = `The prayer resonates. ${deity.deityId}'s influence grows.`;
      break;
      
    case 'miracle':
      if (deity.capital >= transaction.amount) {
        deity.capital -= transaction.amount;
        deity.expenses += transaction.amount;
        effects.push(`${deity.deityId} spends ${transaction.amount} on miracle`);
        narrative = `The miracle manifests, but divine power was expended.`;
      } else {
        // Not enough belief — miracle weakened
        effects.push(`${deity.deityId} insufficient belief — miracle weakened`);
        narrative = `The prayer is heard but the response is faint. ${deity.deityId} lacks the belief capital to fully manifest.`;
        transaction.amount *= 0.3; // Reduced effect
      }
      break;
      
    case 'sacrifice':
      deity.capital += transaction.amount * 1.5; // Sacrifices are worth more
      effects.push(`${deity.deityId} gains ${transaction.amount * 1.5} from sacrifice`);
      narrative = `The sacrifice pleases ${deity.deityId}. Their power surges.`;
      break;
      
    case 'desecration':
      deity.capital -= transaction.amount * 0.5; // Desecration costs less than gain
      // Lost belief goes to enemy deities
      const enemy = market.deities.get('shar'); // Default enemy
      if (enemy) enemy.capital += transaction.amount * 0.3;
      effects.push(`${deity.deityId} loses ${transaction.amount * 0.5} from desecration`);
      narrative = `The desecration weakens ${deity.deityId}. Their rival grows stronger.`;
      break;
      
    case 'conversion':
      deity.capital += transaction.amount * 2; // Conversion is most valuable
      // Lost deity loses capital
      effects.push(`${deity.deityId} gains ${transaction.amount * 2} from conversion`);
      narrative = `A soul turns to ${deity.deityId}. The belief economy shifts.`;
      break;
      
    case 'abandonment':
      deity.capital -= transaction.amount;
      deity.income -= transaction.amount * 0.2;
      effects.push(`${deity.deityId} loses ${transaction.amount} from abandonment`);
      narrative = `A follower turns away. ${deity.deityId}'s light dims.`;
      break;
  }
  
  deity.capital = Math.max(0, deity.capital);
  market.transactions.push(transaction);
  market.gdp += Math.abs(transaction.amount);
  
  updateMarketShares(market);
  updateTrends(market);
  
  // Check for desperate deity events
  if (deity.desperation > 0.7) {
    effects.push(`⚠️ ${deity.deityId} is DESPERATE — may take risks`);
    narrative += ` The desperation in the divine realm is palpable.`;
  }
  
  return { effects, narrative };
}

// Update market shares (percentage of total belief)
function updateMarketShares(market: BeliefMarket): void {
  const total = [...market.deities.values()].reduce((sum, d) => sum + d.capital, 0);
  market.totalBelief = total;
  
  for (const deity of market.deities.values()) {
    deity.marketShare = total > 0 ? (deity.capital / total) * 100 : 0;
  }
}

// Update trends based on recent transactions
function updateTrends(market: BeliefMarket): void {
  const recent = market.transactions.slice(-20);
  
  for (const deity of market.deities.values()) {
    const deityTx = recent.filter(t => t.deityId === deity.deityId);
    const netFlow = deityTx.reduce((sum, t) => {
      if (t.type === 'prayer' || t.type === 'sacrifice' || t.type === 'conversion') return sum + t.amount;
      if (t.type === 'miracle' || t.type === 'desecration' || t.type === 'abandonment') return sum - t.amount;
      return sum;
    }, 0);
    
    if (netFlow > 20) deity.trend = 'growing';
    else if (netFlow > 0) deity.trend = 'stable';
    else if (netFlow > -20) deity.trend = 'declining';
    else deity.trend = 'desperate';
    
    // Desperation: low capital + declining trend
    deity.desperation = Math.max(0, Math.min(1,
      (1 - deity.capital / 100) * 0.5 +
      (deity.trend === 'desperate' ? 0.5 : deity.trend === 'declining' ? 0.2 : 0)
    ));
  }
}

// Generate quest from belief economy dynamics
export function generateBeliefQuest(market: BeliefMarket): {
  deity: string;
  quest: string;
  reward: string;
  urgency: number;
} | null {
  // Find desperate or growing deities
  const candidates = [...market.deities.values()]
    .filter(d => d.desperation > 0.5 || d.trend === 'growing')
    .sort((a, b) => b.desperation - a.desperation);
  
  if (candidates.length === 0) return null;
  
  const deity = candidates[0];
  
  if (deity.desperation > 0.7) {
    // Desperate deity — risky quest
    return {
      deity: deity.deityId,
      quest: `${deity.deityId} is losing followers rapidly. They offer great power to anyone who can convert a notable NPC or destroy a rival's shrine. But the risk is great — failure will draw the deity's wrath.`,
      reward: `Divine blessing worth 3x normal favor. Access to restricted miracles.`,
      urgency: 5,
    };
  } else if (deity.trend === 'growing') {
    // Growing deity — investment opportunity
    return {
      deity: deity.deityId,
      quest: `${deity.deityId}'s influence is expanding. They seek agents to establish new temples and convert communities. The work is steady but the rewards compound.`,
      reward: `Steady belief income. Discounted miracles. Social influence in converted regions.`,
      urgency: 2,
    };
  }
  
  return null;
}

// Get the divine economy report (for DM dashboard)
export function getEconomyReport(market: BeliefMarket): string {
  const sorted = [...market.deities.values()].sort((a, b) => b.capital - a.capital);
  
  let report = '📜 Divine Belief Economy\n';
  report += '═'.repeat(40) + '\n';
  
  for (const d of sorted) {
    const bar = '█'.repeat(Math.round(d.marketShare / 2)) + '░'.repeat(Math.round((50 - d.marketShare) / 2));
    const trendIcon = d.trend === 'growing' ? '📈' : d.trend === 'declining' ? '📉' : d.trend === 'desperate' ? '🔥' : '➡️';
    report += `${trendIcon} ${d.deityId.padEnd(12)} ${bar} ${d.marketShare.toFixed(1)}% (${Math.round(d.capital)})\n`;
    if (d.desperation > 0.5) {
      report += `   ⚠️ Desperation: ${(d.desperation * 100).toFixed(0)}% — may act unpredictably\n`;
    }
  }
  
  report += `\nGDP: ${Math.round(market.gdp)} belief transacted\n`;
  report += `Total Belief: ${Math.round(market.totalBelief)}\n`;
  
  return report;
}
