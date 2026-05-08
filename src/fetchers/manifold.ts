import fetch from 'node-fetch';
import { RawPolymarketMarket } from '../types';
import { log } from '../utils/logger';

const MANIFOLD_API = 'https://api.manifold.markets/v0';

export interface ManifoldMarket {
  id: string;
  question: string;
  probability?: number;
  outcomeType: string;
  closeTime?: number;
  createdTime: number;
  volume?: number;
  totalLiquidity?: number;
  mechanism?: string;
  resolution?: string | null;
}

export function manifoldToPolyMarket(m: ManifoldMarket): RawPolymarketMarket {
  const prob = m.probability ?? 0.5;
  return {
    id: `manifold-${m.id}`,
    question: m.question,
    outcomes: '["Yes","No"]',
    outcomePrices: JSON.stringify([prob.toFixed(6), (1 - prob).toFixed(6)]),
    conditionId: m.id,
    slug: m.id,
    volume: String(m.volume ?? 0),
    liquidity: String(m.totalLiquidity ?? 0),
    clobTokenIds: '',
    startDate: new Date(m.createdTime).toISOString(),
    endDate: m.closeTime ? new Date(m.closeTime).toISOString() : '',
    lastTradePrice: prob,
  };
}

export function isNBAMarket(m: ManifoldMarket): boolean {
  if (m.outcomeType !== 'BINARY') return false;
  if (m.resolution !== undefined && m.resolution !== null) return false;
  if (m.probability === undefined) return false;

  const q = m.question.toLowerCase();
  const nbaTeams = [
    'thunder', 'lakers', 'spurs', 'timberwolves', 'pistons', 'cavaliers',
    'knicks', '76ers', 'sixers', 'celtics', 'heat', 'nuggets', 'warriors',
    'mavericks', 'mavs', 'bucks', 'hawks', 'pacers', 'magic', 'raptors',
    'bulls', 'nets', 'rockets', 'clippers', 'suns', 'pelicans',
    'grizzlies', 'jazz', 'blazers', 'kings', 'wizards',
  ];
  const hasTeam = nbaTeams.some(t => q.includes(t));
  if (!hasTeam) return false;

  return q.includes('nba') || q.includes('playoff') || q.includes('basketball');
}

export async function fetchNBAManifoldMarkets(): Promise<RawPolymarketMarket[]> {
  log('info', 'Fetching NBA playoff markets from Manifold Markets API');

  const allMarkets: RawPolymarketMarket[] = [];
  const seen = new Set<string>();

  const searchTerms = ['NBA', 'NBA playoff', 'NBA finals', 'NBA basketball'];

  for (const term of searchTerms) {
    try {
      const url = `${MANIFOLD_API}/search-markets?term=${encodeURIComponent(term)}&limit=100`;
      log('debug', `Manifold search: ${term}`);

      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        log('debug', `Manifold search returned ${response.status} for "${term}"`);
        continue;
      }

      const data = await response.json() as ManifoldMarket[];
      if (!Array.isArray(data) || data.length === 0) continue;

      for (const m of data) {
        if (!isNBAMarket(m)) continue;
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        allMarkets.push(manifoldToPolyMarket(m));
        log('debug', `  Manifold: ${(m.probability! * 100).toFixed(0)}% — ${m.question.slice(0, 80)}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log('debug', `Manifold search "${term}" failed: ${message}`);
    }
  }

  log('info', `Manifold: ${allMarkets.length} NBA playoff markets found`);
  if (allMarkets.length === 0) log('warn', 'No NBA markets found on Manifold');

  return allMarkets;
}
