import { matchEvent, buildNBAMarket } from '../src/matchers/event-matcher';

describe('Event Matching', () => {
  describe('matchEvent', () => {
    it('matches simple team names in question', () => {
      const question = 'Who will win the series? Thunder vs Lakers';
      const sportsbookEvent = { home: 'Oklahoma City Thunder', away: 'Los Angeles Lakers' };
      expect(matchEvent(question, sportsbookEvent)).toBe(true);
    });

    it('matches with different order', () => {
      const question = 'Who will win series? Lakers vs Thunder';
      const sportsbookEvent = { home: 'Oklahoma City Thunder', away: 'Los Angeles Lakers' };
      expect(matchEvent(question, sportsbookEvent)).toBe(true);
    });

    it('uses team aliases correctly', () => {
      const question = 'Who will win series? OKC vs LAL';
      const sportsbookEvent = { home: 'Oklahoma City Thunder', away: 'Los Angeles Lakers' };
      expect(matchEvent(question, sportsbookEvent)).toBe(true);
    });

    it('returns false for non-matching teams', () => {
      const question = 'Who will win series? Thunder vs Lakers';
      const sportsbookEvent = { home: 'Boston Celtics', away: 'Miami Heat' };
      expect(matchEvent(question, sportsbookEvent)).toBe(false);
    });

    it('handles Timberwolves alias', () => {
      const question = 'Who will win series? Spurs vs Timberwolves';
      const sportsbookEvent = { home: 'San Antonio Spurs', away: 'Minnesota Timberwolves' };
      expect(matchEvent(question, sportsbookEvent)).toBe(true);
    });

    it('handles Cavs alias', () => {
      const question = 'Who will win series? Pistons vs Cavs';
      const sportsbookEvent = { home: 'Detroit Pistons', away: 'Cleveland Cavaliers' };
      expect(matchEvent(question, sportsbookEvent)).toBe(true);
    });

    it('handles Sixers alias', () => {
      const question = 'Knicks vs 76ers series winner';
      const sportsbookEvent = { home: 'New York Knicks', away: 'Philadelphia 76ers' };
      expect(matchEvent(question, sportsbookEvent)).toBe(true);
    });
  });

  describe('buildNBAMarket', () => {
    const polyMarket = {
      id: 'poly-1',
      question: 'Who will win series? Thunder vs Lakers',
      outcomes: '["Yes","No"]',
      outcomePrices: '["0.55","0.45"]',
      conditionId: 'cond-1',
      slug: 'thunder-lakers-series',
      volume: '100000',
      liquidity: '50000',
      clobTokenIds: '["token-1","token-2"]',
      startDate: '2026-05-01',
      endDate: '2026-06-30',
    };

    it('builds market with order book data', () => {
      const orderBook = {
        tokenId: 'token-1',
        bestBid: 0.54,
        bestAsk: 0.56,
        midPrice: 0.55,
        bidSize: 5000,
        askSize: 5000,
      };
      const sportsbookProb = {
        teamA: 'Oklahoma City Thunder',
        teamB: 'Los Angeles Lakers',
        probA: 0.62,
        probB: 0.38,
      };
      const market = buildNBAMarket(polyMarket, orderBook, sportsbookProb);
      expect(market).not.toBeNull();
      expect(market!.teamA).toBe('Oklahoma City Thunder');
      expect(market!.teamB).toBe('Los Angeles Lakers');
      expect(market!.polymarketMidpoint).toBe(0.55);
    });

    it('returns null for unrecognizable teams', () => {
      const badMarket = { ...polyMarket, question: 'Random question with no teams' };
      const market = buildNBAMarket(badMarket, null, null);
      expect(market).toBeNull();
    });

    it('handles missing order book by using outcome prices', () => {
      const market = buildNBAMarket(polyMarket, null, null);
      expect(market).not.toBeNull();
      expect(market!.polymarketMidpoint).toBeCloseTo(0.55);
    });
  });
});
