import { detectPureArb } from '../src/detectors/arb';
import { NBAMarket, CombinedOrderBook } from '../src/types';

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

function makeMarket(overrides: Partial<NBAMarket> = {}): NBAMarket {
  return {
    id: 'test-market-1',
    question: 'Who will win series? Thunder vs Lakers',
    teamA: 'Oklahoma City Thunder',
    teamB: 'Los Angeles Lakers',
    marketType: 'series_winner',
    polymarketMidpoint: 0.55,
    polymarketBestBid: 0.54,
    polymarketBestAsk: 0.56,
    sportsbookImpliedProb: null,
    sportsbookTeam: null,
    lastUpdated: new Date(),
    ...overrides,
  };
}

function makeCombinedBook(overrides: Partial<CombinedOrderBook> = {}): CombinedOrderBook {
  return {
    yesTokenId: 'token-yes',
    noTokenId: 'token-no',
    yesBid: 0.55,
    yesAsk: 0.57,
    yesMid: 0.56,
    yesBidSize: 5000,
    yesAskSize: 5000,
    noBid: 0.43,
    noAsk: 0.45,
    noMid: 0.44,
    noBidSize: 5000,
    noAskSize: 5000,
    ...overrides,
  };
}

describe('Pure Arbitrage Detection', () => {
  it('detects arb when YES+NO < 1 - fees', () => {
    const book = makeCombinedBook({ yesAsk: 0.30, noAsk: 0.35 });
    const market = makeMarket();
    const signal = detectPureArb(market, book);
    expect(signal).not.toBeNull();
    expect(signal!.type).toBe('pure_arb');
    expect(signal!.direction).toBe('BOTH');
    expect(signal!.edge).toBeGreaterThan(0);
  });

  it('returns null when NO arb exists (YES+NO >= 1)', () => {
    const book = makeCombinedBook({ yesAsk: 0.50, noAsk: 0.52 });
    const market = makeMarket();
    const signal = detectPureArb(market, book);
    expect(signal).toBeNull();
  });

  it('accounts for fee rate correctly', () => {
    const book = makeCombinedBook({ yesAsk: 0.45, noAsk: 0.48 });
    const market = makeMarket();
    const totalCost = 0.45 + 0.48;
    const feeMultiplier = 1 + 0.005;
    const effective = totalCost * feeMultiplier;
    const edge = (1 - effective) * 100;
    expect(edge).toBeLessThan((1 - totalCost) * 100);
    const signal = detectPureArb(market, book);
    if (edge >= 0.5) {
      expect(signal).not.toBeNull();
    } else {
      expect(signal).toBeNull();
    }
  });

  it('handles null combined book gracefully', () => {
    const market = makeMarket();
    const signal = detectPureArb(market, null);
    expect(signal).toBeNull();
  });

  it('respects minEdgePct threshold', () => {
    const book = makeCombinedBook({ yesAsk: 0.497, noAsk: 0.499 });
    const market = makeMarket();
    const signal = detectPureArb(market, book);
    expect(signal).toBeNull();
  });

  it('handles order book with small sizes', () => {
    const book = makeCombinedBook({
      yesAsk: 0.30, noAsk: 0.35,
      yesAskSize: 1, noAskSize: 1,
    });
    const market = makeMarket();
    const signal = detectPureArb(market, book);
    if (signal) {
      expect(signal.edge).toBeGreaterThan(0);
    }
  });

  it('computes correct edge value', () => {
    const book = makeCombinedBook({ yesAsk: 0.30, noAsk: 0.35 });
    const market = makeMarket();
    const signal = detectPureArb(market, book);
    expect(signal).not.toBeNull();
    const expectedEdge = (1 - ((0.30 + 0.35) * 1.005)) * 100;
    expect(signal!.edge).toBeCloseTo(expectedEdge, 1);
  });
});
