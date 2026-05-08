export interface RawPolymarketMarket {
  id: string;
  question: string;
  outcomes: string;
  outcomePrices: string;
  conditionId: string;
  slug: string;
  volume: string;
  liquidity: string;
  clobTokenIds: string;
  startDate: string;
  endDate: string;
  bestBid?: number;
  bestAsk?: number;
  lastTradePrice?: number;
}

export interface OrderBookEntry {
  price: string;
  size: string;
}

export interface OrderBook {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
}

export interface OrderBookSummary {
  tokenId: string;
  bestBid: number;
  bestAsk: number;
  midPrice: number;
  bidSize: number;
  askSize: number;
}

export interface RawSportsbookOdds {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: SportsbookBookmaker[];
}

export interface SportsbookBookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: SportsbookMarket[];
}

export interface SportsbookMarket {
  key: string;
  last_update: string;
  outcomes: SportsbookOutcome[];
}

export interface SportsbookOutcome {
  name: string;
  price: number;
}

export interface DeViggedProbabilities {
  teamA: string;
  teamB: string;
  probA: number;
  probB: number;
}

export interface NBAMarket {
  id: string;
  question: string;
  teamA: string;
  teamB: string;
  marketType: 'championship_winner' | 'series_winner' | 'game_winner' | 'other';
  polymarketMidpoint: number;
  polymarketBestBid: number;
  polymarketBestAsk: number;
  sportsbookImpliedProb: number | null;
  sportsbookTeam: string | null;
  lastUpdated: Date;
}

export type SignalType = 'pure_arb' | 'value' | 'momentum';

export type SignalDirection = 'YES' | 'NO' | 'BOTH';

export interface ArbSignal {
  id: string;
  type: SignalType;
  marketId: string;
  marketQuestion: string;
  edge: number;
  direction: SignalDirection;
  confidence: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface PaperTrade {
  id: string;
  signalId: string;
  marketId: string;
  marketQuestion: string;
  side: 'YES' | 'NO' | 'BOTH';
  entryPrice: number;
  size: number;
  expectedValue: number;
  status: 'open' | 'closed' | 'partial';
  pnl: number;
  filledAt: Date | null;
  closedAt: Date | null;
  feePaid: number;
}

export interface EquityPoint {
  timestamp: Date;
  equity: number;
}

export interface JournalSummary {
  totalTrades: number;
  winRate: number;
  totalPnl: number;
  sharpeRatio: number;
}

export interface CombinedOrderBook {
  yesTokenId: string;
  noTokenId: string | null;
  yesBid: number;
  yesAsk: number;
  yesMid: number;
  yesBidSize: number;
  yesAskSize: number;
  noBid: number;
  noAsk: number;
  noMid: number;
  noBidSize: number;
  noAskSize: number;
}

export interface BookOdds {
  bookmakerKey: string;
  bookmakerTitle: string;
  teamA: string;
  teamB: string;
  priceA: number;
  priceB: number;
  deViggedProbA: number;
  deViggedProbB: number;
}

export interface ConsensusProbabilities {
  teamA: string;
  teamB: string;
  avgProbA: number;
  avgProbB: number;
  bookCount: number;
  perBook: BookOdds[];
}

export interface SportEventOdds {
  id: string;
  sportKey: string;
  commenceTime: string;
  homeTeam: string;
  awayTeam: string;
  source: 'odds_api' | 'parlay_api' | 'manifold';
  consensus: ConsensusProbabilities | null;
  rawBookmakers: SportsbookBookmaker[];
}

export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface OutrightsOutcome {
  name: string;
  price: number;
}

export interface ChampionshipOutright {
  teamName: string;
  bestPrice: number;
  impliedProb: number;
  bookCount: number;
  allPrices: Array<{ bookmaker: string; price: number }>;
}
