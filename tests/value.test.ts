import { detectValue } from '../src/detectors/value';
import { NBAMarket } from '../src/types';

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
    id: 'test-market-2',
    question: 'Who will win series? Thunder vs Lakers',
    teamA: 'Oklahoma City Thunder',
    teamB: 'Los Angeles Lakers',
    marketType: 'series_winner',
    polymarketMidpoint: 0.55,
    polymarketBestBid: 0.54,
    polymarketBestAsk: 0.56,
    sportsbookImpliedProb: 0.65,
    sportsbookTeam: 'Oklahoma City Thunder',
    lastUpdated: new Date(),
    ...overrides,
  };
}

describe('Value Detection', () => {
  it('detects value when sportsbook prob > polymarket price (buy YES)', () => {
    const market = makeMarket({ polymarketMidpoint: 0.55, sportsbookImpliedProb: 0.65 });
    const signal = detectValue(market);
    expect(signal).not.toBeNull();
    expect(signal!.direction).toBe('YES');
    expect(signal!.type).toBe('value');
    expect(signal!.edge).toBeGreaterThan(0);
  });

  it('detects value when sportsbook prob < polymarket price (buy NO)', () => {
    const market = makeMarket({ polymarketMidpoint: 0.65, sportsbookImpliedProb: 0.55 });
    const signal = detectValue(market);
    expect(signal).not.toBeNull();
    expect(signal!.direction).toBe('NO');
    expect(signal!.type).toBe('value');
    expect(signal!.edge).toBeGreaterThan(0);
  });

  it('returns null when sportsbook prob is null', () => {
    const market = makeMarket({ sportsbookImpliedProb: null });
    const signal = detectValue(market);
    expect(signal).toBeNull();
  });

  it('returns null when edge is below threshold', () => {
    const market = makeMarket({ polymarketMidpoint: 0.50, sportsbookImpliedProb: 0.502 });
    const signal = detectValue(market);
    expect(signal).toBeNull();
  });

  it('computes edge correctly', () => {
    const market = makeMarket({ polymarketMidpoint: 0.50, sportsbookImpliedProb: 0.60 });
    const signal = detectValue(market);
    expect(signal).not.toBeNull();
    const expectedEdge = ((0.60 - 0.50) / 0.50) * 100;
    expect(signal!.edge).toBeCloseTo(expectedEdge, 1);
  });

  it('handles small edge near threshold', () => {
    const market = makeMarket({ polymarketMidpoint: 0.50, sportsbookImpliedProb: 0.501 });
    const signal = detectValue(market);
    const edge = ((0.501 - 0.50) / 0.50) * 100;
    expect(edge).toBeLessThan(0.5);
    expect(signal).toBeNull();
  });

  it('sets confidence proportional to edge', () => {
    const market = makeMarket({ polymarketMidpoint: 0.40, sportsbookImpliedProb: 0.80 });
    const signal = detectValue(market);
    expect(signal).not.toBeNull();
    expect(signal!.confidence).toBeGreaterThan(0);
    expect(signal!.confidence).toBeLessThanOrEqual(1);
  });
});
