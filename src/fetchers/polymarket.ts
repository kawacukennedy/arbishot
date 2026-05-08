import fetch from 'node-fetch';
import { config } from '../config';
import { RawPolymarketMarket, OrderBook, CombinedOrderBook } from '../types';
import { log } from '../utils/logger';

function safeJsonParseArray(input: string): string[] {
  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // fallback: comma-separated
  }
  return input.split(',').map(s => s.trim().replace(/^\[|\]$/g, '')).filter(Boolean);
}

function safeJsonParseNumbers(input: string): number[] {
  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed)) return parsed.map(v => parseFloat(String(v))).filter(n => !isNaN(n));
  } catch {
    // fallback: comma-separated
  }
  return input.split(',').map(s => parseFloat(s.trim().replace(/^\[|\]$/g, ''))).filter(n => !isNaN(n));
}

function parseClobTokenIds(ids: string): string[] {
  return safeJsonParseArray(ids);
}

export function parseOutcomes(outcomes: string): string[] {
  return safeJsonParseArray(outcomes);
}

export function parseOutcomePrices(prices: string): number[] {
  return safeJsonParseNumbers(prices);
}

function isBinaryMarket(market: RawPolymarketMarket): boolean {
  const parsed = parseOutcomes(market.outcomes);
  return parsed.length === 2 &&
    parsed.some(o => o.toLowerCase() === 'yes') &&
    parsed.some(o => o.toLowerCase() === 'no');
}

function hasNBATeams(question: string): boolean {
  const q = question.toLowerCase();
  const teams = [
    'thunder', 'lakers', 'spurs', 'timberwolves', 'pistons', 'cavaliers',
    'knicks', '76ers', 'celtics', 'heat', 'nuggets', 'warriors',
    'mavericks', 'bucks', 'hawks', 'pacers', 'magic', 'raptors',
    'bulls', 'nets', 'rockets', 'clippers', 'suns', 'pelicans',
    'grizzlies', 'jazz', 'blazers', 'kings', 'wizards',
  ];
  return teams.some(t => q.includes(t));
}

function isNBARelated(question: string): boolean {
  const q = question.toLowerCase();
  return q.includes('nba') || q.includes('playoff') || hasNBATeams(q);
}

function extractMarketsFromEvents(data: unknown[]): RawPolymarketMarket[] {
  const result: RawPolymarketMarket[] = [];
  for (const event of data as Record<string, unknown>[]) {
    const eventMarkets = event['markets'] as RawPolymarketMarket[] | null;
    if (eventMarkets && Array.isArray(eventMarkets)) {
      for (const m of eventMarkets) {
        if (m?.id && m?.question) {
          result.push(m);
        }
      }
    }
  }
  return result;
}

export async function fetchNBAMarkets(): Promise<RawPolymarketMarket[]> {
  log('info', 'Fetching NBA playoffs markets from Gamma API');

  const allMarkets: RawPolymarketMarket[] = [];
  const seen = new Set<string>();
  const errors: string[] = [];

  const strategies = [
    { url: `${config.polymarketGammaUrl}/markets?tag=basketball&closed=false&limit=20`, label: 'markets tag=basketball' },
    { url: `${config.polymarketGammaUrl}/markets?closed=false&limit=50`, label: 'markets all' },
    { url: `${config.polymarketGammaUrl}/events?closed=false&limit=50`, label: 'events all' },
    { url: `${config.polymarketGammaUrl}/markets?tag=nba&closed=false&limit=50`, label: 'markets tag=nba' },
  ];

  for (const strategy of strategies) {
    try {
      log('debug', `Trying: ${strategy.label} — ${strategy.url}`);
      const response = await fetch(strategy.url, {
        headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip, deflate' },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        log('debug', `Strategy returned ${response.status}: ${strategy.label}`);
        continue;
      }

      const data = await response.json() as unknown[];
      if (!Array.isArray(data) || data.length === 0) continue;

      let markets: RawPolymarketMarket[];

      if (strategy.label.startsWith('events')) {
        markets = extractMarketsFromEvents(data);
        log('debug', `  events -> ${markets.length} extracted markets`);
      } else {
        markets = data as RawPolymarketMarket[];
      }

      for (const m of markets) {
        if (!m?.id || !m?.question) continue;
        if (!isBinaryMarket(m)) continue;
        if (!isNBARelated(m.question)) continue;
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        allMarkets.push(m);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${strategy.label}: ${message}`);
      log('debug', `Strategy failed: ${strategy.label} — ${message}`);
    }
  }

  log('info', `Gamma API: ${allMarkets.length} NBA playoffs markets found`);
  if (errors.length > 0) log('debug', `Strategy errors: ${errors.join('; ')}`);
  if (allMarkets.length === 0) log('warn', 'No NBA markets found on Polymarket');

  return allMarkets;
}

async function fetchSingleOrderBook(tokenId: string): Promise<{ bestBid: number; bestAsk: number; bidSize: number; askSize: number } | null> {
  const url = `${config.polymarketClobUrl}/book?token_id=${tokenId}`;
  log('debug', `Fetching order book for token ${tokenId}`);

  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      log('warn', `CLOB API returned status ${response.status} for token ${tokenId}`);
      return null;
    }

    const data = await response.json() as OrderBook;

    if (!data.bids?.length || !data.asks?.length) {
      log('debug', `Empty order book for token ${tokenId}`);
      return null;
    }

    const bestBid = parseFloat(data.bids[0].price);
    const bestAsk = parseFloat(data.asks[0].price);
    const bidSize = data.bids.reduce((sum, b) => sum + parseFloat(b.size), 0);
    const askSize = data.asks.reduce((sum, a) => sum + parseFloat(a.size), 0);

    if (isNaN(bestBid) || isNaN(bestAsk)) {
      log('warn', `Invalid prices in order book for token ${tokenId}`);
      return null;
    }

    return { bestBid, bestAsk, bidSize, askSize };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log('error', `Failed to fetch order book for token ${tokenId}: ${message}`);
    return null;
  }
}

export async function fetchCombinedOrderBook(clobTokenIdsStr: string): Promise<CombinedOrderBook | null> {
  const ids = parseClobTokenIds(clobTokenIdsStr);
  if (ids.length === 0) return null;

  const yesTokenId = ids[0];
  const noTokenId = ids.length > 1 ? ids[1] : null;

  const [yesBook, noBook] = await Promise.all([
    fetchSingleOrderBook(yesTokenId),
    noTokenId ? fetchSingleOrderBook(noTokenId) : Promise.resolve(null),
  ]);

  if (!yesBook) return null;

  return {
    yesTokenId,
    noTokenId,
    yesBid: yesBook.bestBid,
    yesAsk: yesBook.bestAsk,
    yesMid: (yesBook.bestBid + yesBook.bestAsk) / 2,
    yesBidSize: yesBook.bidSize,
    yesAskSize: yesBook.askSize,
    noBid: noBook?.bestBid ?? (1 - yesBook.bestAsk),
    noAsk: noBook?.bestAsk ?? (1 - yesBook.bestBid),
    noMid: noBook ? (noBook.bestBid + noBook.bestAsk) / 2 : (1 - (yesBook.bestBid + yesBook.bestAsk) / 2),
    noBidSize: noBook?.bidSize ?? yesBook.askSize,
    noAskSize: noBook?.askSize ?? yesBook.bidSize,
  };
}
