import { kellyCriterion, calculateExpectedValue } from '../src/risk/kelly';

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

describe('Kelly Criterion', () => {
  it('returns positive size for favorable bet', () => {
    const size = kellyCriterion(0.60, 0.55, 0.25, 1000);
    expect(size).toBeGreaterThan(0);
    expect(size).toBeLessThanOrEqual(100);
  });

  it('returns 0 for unfavorable bet (winProb too low)', () => {
    const size = kellyCriterion(0.40, 0.55, 0.25, 1000);
    expect(size).toBe(0);
  });

  it('clamps to max position size', () => {
    const size = kellyCriterion(0.99, 0.51, 1.0, 10000);
    expect(size).toBeLessThanOrEqual(100);
  });

  it('returns 0 for invalid winProb (<= 0)', () => {
    const size = kellyCriterion(0, 0.55, 0.25, 1000);
    expect(size).toBe(0);
  });

  it('returns 0 for invalid winProb (>= 1)', () => {
    const size = kellyCriterion(1, 0.55, 0.25, 1000);
    expect(size).toBe(0);
  });

  it('returns 0 for invalid entry price (<= 0)', () => {
    const size = kellyCriterion(0.60, 0, 0.25, 1000);
    expect(size).toBe(0);
  });

  it('respects fractional Kelly', () => {
    const full = kellyCriterion(0.60, 0.55, 1.0, 1000);
    const quarter = kellyCriterion(0.60, 0.55, 0.25, 1000);
    expect(quarter).toBeLessThan(full);
  });

  it('uses default values from config', () => {
    const size = kellyCriterion(0.60, 0.55);
    expect(size).toBeGreaterThanOrEqual(0);
  });

  it('handles bankroll of zero', () => {
    const size = kellyCriterion(0.60, 0.55, 0.25, 0);
    expect(size).toBe(0);
  });

  it('computes correct Kelly fraction', () => {
    const winProb = 0.60;
    const entryPrice = 0.55;
    const netOdds = (1 / entryPrice) - 1;
    const fullKelly = (winProb * (netOdds + 1) - 1) / netOdds;
    const expected = Math.min(fullKelly * 0.25 * 1000, 100);
    const result = kellyCriterion(winProb, entryPrice, 0.25, 1000);
    expect(result).toBeCloseTo(expected, 0);
  });
});

describe('Expected Value Calculation', () => {
  it('calculates positive EV correctly', () => {
    const ev = calculateExpectedValue(0.60, 0.50, 100);
    const payout = 100 / 0.50;
    expect(ev).toBeCloseTo(0.60 * payout - 100, 2);
  });

  it('returns 0 for zero winProb', () => {
    const ev = calculateExpectedValue(0, 0.50, 100);
    expect(ev).toBe(0);
  });

  it('returns 0 for zero entry', () => {
    const ev = calculateExpectedValue(0.60, 0, 100);
    expect(ev).toBe(0);
  });
});
