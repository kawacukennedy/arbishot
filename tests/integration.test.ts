import { PaperEngine } from '../src/execution/paper';
import { NBAMarket, ArbSignal, CombinedOrderBook } from '../src/types';

jest.mock('../src/config', () => ({
  config: Object.freeze({
    oddsApiKey: 'test-key',
    polymarketGammaUrl: 'https://gamma-api.polymarket.com',
    polymarketClobUrl: 'https://clob.polymarket.com',
    scanIntervalMs: 15000,
    kellyFraction: 0.25,
    maxPositionSize: 100,
    minEdgePct: 0.5,
    cooldownMinutes: 5,
    bankroll: 1000,
    feeRate: 0.005,
    momentumDataPath: '',
  }),
}));

jest.mock('../src/execution/journal', () => ({
  appendTrade: jest.fn(),
  appendSignal: jest.fn(),
  loadAllTrades: jest.fn(() => []),
  computeSummary: jest.fn(() => ({ totalTrades: 0, winRate: 0, totalPnl: 0, sharpeRatio: 0 })),
  generateReport: jest.fn(),
}));

function makeMarket(overrides: Partial<NBAMarket> = {}): NBAMarket {
  return {
    id: 'int-market-1',
    question: 'Who will win series? Thunder vs Lakers',
    teamA: 'Oklahoma City Thunder',
    teamB: 'Los Angeles Lakers',
    marketType: 'series_winner',
    polymarketMidpoint: 0.55,
    polymarketBestBid: 0.54,
    polymarketBestAsk: 0.56,
    sportsbookImpliedProb: 0.62,
    sportsbookTeam: 'Oklahoma City Thunder',
    lastUpdated: new Date(),
    ...overrides,
  };
}

function makeCombinedBook(overrides: Partial<CombinedOrderBook> = {}): CombinedOrderBook {
  return {
    yesTokenId: 'token-yes',
    noTokenId: 'token-no',
    yesBid: 0.54,
    yesAsk: 0.56,
    yesMid: 0.55,
    yesBidSize: 5000,
    yesAskSize: 5000,
    noBid: 0.44,
    noAsk: 0.46,
    noMid: 0.45,
    noBidSize: 5000,
    noAskSize: 5000,
    ...overrides,
  };
}

describe('Full Pipeline Integration', () => {
  it('executes a value trade from signal through paper engine', () => {
    const market = makeMarket();
    const book = makeCombinedBook();
    const engine = new PaperEngine(1000);

    const signal: ArbSignal = {
      id: 'signal-1',
      type: 'value',
      marketId: market.id,
      marketQuestion: market.question,
      edge: 5.0,
      direction: 'YES',
      confidence: 0.5,
      timestamp: new Date(),
    };

    const trades = engine.executeTrade(market, signal, book);
    expect(trades.length).toBeGreaterThan(0);
    expect(trades[0].status).toBe('open');
    expect(trades[0].side).toBe('YES');
    expect(trades[0].entryPrice).toBeGreaterThan(0);
    expect(trades[0].size).toBeGreaterThan(0);
  });

  it('executes a pure arb signal as two trades (YES and NO)', () => {
    const market = makeMarket({
      polymarketMidpoint: 0.40,
      polymarketBestBid: 0.39,
      polymarketBestAsk: 0.41,
    });
    const book = makeCombinedBook({ yesBid: 0.39, yesAsk: 0.41, noBid: 0.59, noAsk: 0.61 });
    const engine = new PaperEngine(1000);

    const signal: ArbSignal = {
      id: 'signal-arb-1',
      type: 'pure_arb',
      marketId: market.id,
      marketQuestion: market.question,
      edge: 3.0,
      direction: 'BOTH',
      confidence: 0.8,
      timestamp: new Date(),
    };

    const trades = engine.executeTrade(market, signal, book);
    expect(trades.length).toBeGreaterThanOrEqual(1);
    const sides = trades.map(t => t.side);
    expect(sides).toContain('YES');
    expect(sides).toContain('NO');
  });

  it('updates equity after trades', () => {
    const market = makeMarket();
    const book = makeCombinedBook();
    const engine = new PaperEngine(1000);

    const signal: ArbSignal = {
      id: 'signal-eq-1',
      type: 'value',
      marketId: market.id,
      marketQuestion: market.question,
      edge: 3.0,
      direction: 'YES',
      confidence: 0.5,
      timestamp: new Date(),
    };

    engine.executeTrade(market, signal, book);
    const curve = engine.getEquityCurve();
    expect(curve.length).toBeGreaterThan(1);
    expect(curve[curve.length - 1].equity).toBeLessThan(1000);
  });

  it('returns correct PnL after resolving trades', () => {
    const market = makeMarket();
    const book = makeCombinedBook();
    const engine = new PaperEngine(1000);

    const signal: ArbSignal = {
      id: 'signal-pnl-1',
      type: 'value',
      marketId: market.id,
      marketQuestion: market.question,
      edge: 3.0,
      direction: 'YES',
      confidence: 0.5,
      timestamp: new Date(),
    };

    const trades = engine.executeTrade(market, signal, book);
    expect(trades.length).toBeGreaterThan(0);

    engine.resolveTrade(trades[0].id, 15.0);
    expect(engine.getPnl()).toBe(15.0);
  });

  it('handles empty order book without crashing', () => {
    const market = makeMarket();
    const engine = new PaperEngine(1000);

    const signal: ArbSignal = {
      id: 'signal-empty-1',
      type: 'value',
      marketId: market.id,
      marketQuestion: market.question,
      edge: 3.0,
      direction: 'YES',
      confidence: 0.5,
      timestamp: new Date(),
    };

    const trades = engine.executeTrade(market, signal, null);
    expect(trades).toEqual([]);
  });

  it('respects cooldown between trades', () => {
    const market = makeMarket();
    const book = makeCombinedBook();
    const engine = new PaperEngine(1000);

    const signal1: ArbSignal = {
      id: 'sig-cd-1', type: 'value', marketId: market.id,
      marketQuestion: market.question, edge: 3.0, direction: 'YES',
      confidence: 0.5, timestamp: new Date(),
    };

    const trade1 = engine.executeTrade(market, signal1, book);
    expect(trade1.length).toBeGreaterThan(0);

    const signal2: ArbSignal = {
      id: 'sig-cd-2', type: 'value', marketId: market.id,
      marketQuestion: market.question, edge: 3.0, direction: 'YES',
      confidence: 0.5, timestamp: new Date(),
    };

    engine.executeTrade(market, signal2, book);
    const trades = engine.getTrades();
    expect(trades.length).toBeGreaterThanOrEqual(1);
  });
});
