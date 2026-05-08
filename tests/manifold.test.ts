import { isNBAMarket, manifoldToPolyMarket } from '../src/fetchers/manifold';
import { ManifoldMarket } from '../src/fetchers/manifold';

function makeMarket(overrides: Partial<ManifoldMarket> = {}): ManifoldMarket {
  return {
    id: 'test-1',
    question: 'Will the Lakers advance past the first round of the 2026 NBA Playoffs?',
    probability: 0.85,
    outcomeType: 'BINARY',
    closeTime: Date.now() + 86400000,
    createdTime: Date.now() - 86400000,
    volume: 10000,
    totalLiquidity: 5000,
    resolution: null,
    ...overrides,
  };
}

describe('isNBAMarket', () => {
  it('accepts NBA playoff binary market with team name', () => {
    expect(isNBAMarket(makeMarket())).toBe(true);
  });

  it('rejects non-binary markets', () => {
    expect(isNBAMarket(makeMarket({ outcomeType: 'MULTIPLE_CHOICE' }))).toBe(false);
  });

  it('rejects resolved markets', () => {
    expect(isNBAMarket(makeMarket({ resolution: 'YES' }))).toBe(false);
  });

  it('rejects markets without probability', () => {
    expect(isNBAMarket(makeMarket({ probability: undefined }))).toBe(false);
  });

  it('rejects markets with no NBA team in question', () => {
    expect(isNBAMarket(makeMarket({ question: 'Will it rain tomorrow?' }))).toBe(false);
  });

  it('accepts market with team name and "playoff" context', () => {
    expect(isNBAMarket(makeMarket({ question: 'Celtics vs Heat playoff series winner' }))).toBe(true);
  });

  it('accepts market with team name and "NBA" context', () => {
    expect(isNBAMarket(makeMarket({ question: 'NBA: Thunder vs Lakers game winner' }))).toBe(true);
  });

  it('accepts market with team alias like Sixers', () => {
    expect(isNBAMarket(makeMarket({ question: 'Sixers vs Knicks NBA playoffs' }))).toBe(true);
  });

  it('accepts market with Mavs alias', () => {
    expect(isNBAMarket(makeMarket({ question: 'Mavs vs Warriors NBA game' }))).toBe(true);
  });

  it('rejects market with team name but no NBA/playoff/basketball context', () => {
    expect(isNBAMarket(makeMarket({ question: 'Lakers vs Celtics exhibition game' }))).toBe(false);
  });
});

describe('manifoldToPolyMarket', () => {
  it('converts basic market correctly', () => {
    const m = makeMarket({ probability: 0.75 });
    const result = manifoldToPolyMarket(m);

    expect(result.id).toBe('manifold-test-1');
    expect(result.question).toBe(m.question);
    expect(result.outcomes).toBe('["Yes","No"]');
    expect(result.lastTradePrice).toBe(0.75);
    expect(result.clobTokenIds).toBe('');
  });

  it('sets outcomePrices from probability', () => {
    const result = manifoldToPolyMarket(makeMarket({ probability: 0.6 }));
    const prices = JSON.parse(result.outcomePrices).map(Number);
    expect(prices[0]).toBeCloseTo(0.6, 5);
    expect(prices[1]).toBeCloseTo(0.4, 5);
  });

  it('defaults to 0.5 when no probability', () => {
    const result = manifoldToPolyMarket(makeMarket({ probability: undefined }));
    expect(result.lastTradePrice).toBe(0.5);
  });
});


