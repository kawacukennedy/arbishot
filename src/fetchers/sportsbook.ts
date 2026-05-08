import fetch from 'node-fetch';
import { config } from '../config';
import { RawSportsbookOdds, DeViggedProbabilities } from '../types';
import { log } from '../utils/logger';
import { decimalToImpliedProb, deVig } from '../normalizers/probability';

async function fetchWithRetry(url: string, retries = 3, delay = 2000): Promise<RawSportsbookOdds[]> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });

      if (response.status === 429) {
        log('warn', `Rate limited by Odds API, attempt ${attempt}/${retries}`);
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, delay * attempt));
          continue;
        }
        return [];
      }

      if (!response.ok) {
        log('error', `Odds API returned status ${response.status} ${response.statusText}`);
        return [];
      }

      const data = await response.json() as RawSportsbookOdds[];
      return Array.isArray(data) ? data : [];
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log('warn', `Odds API fetch attempt ${attempt} failed: ${message}`);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, delay * attempt));
      }
    }
  }
  return [];
}

export async function fetchNBAMoneylines(): Promise<RawSportsbookOdds[]> {
  const url = `https://api.the-odds-api.com/v4/sports/basketball_nba/odds/?apiKey=${config.oddsApiKey}&regions=us&markets=h2h&oddsFormat=decimal`;
  log('info', 'Fetching NBA moneylines from The Odds API');

  const events = await fetchWithRetry(url);
  log('info', `Odds API: ${events.length} NBA events`);

  return events;
}

export function extractBestOdds(event: RawSportsbookOdds): DeViggedProbabilities | null {
  if (!event.bookmakers?.length) return null;

  type OutcomePair = { name: string; price: number };
  const bestPrices = new Map<string, number>();

  for (const bookmaker of event.bookmakers) {
    if (!bookmaker.markets?.length) continue;
    for (const market of bookmaker.markets) {
      if (market.key !== 'h2h') continue;
      for (const outcome of market.outcomes) {
        const existing = bestPrices.get(outcome.name) ?? Infinity;
        if (outcome.price < existing) {
          bestPrices.set(outcome.name, outcome.price);
        }
      }
    }
  }

  if (bestPrices.size < 2) return null;

  const entries = Array.from(bestPrices.entries());
  const probA = decimalToImpliedProb(entries[0][1]);
  const probB = decimalToImpliedProb(entries[1][1]);
  const vigFree = deVig(probA, probB);

  return {
    teamA: entries[0][0],
    teamB: entries[1][0],
    probA: vigFree.probA,
    probB: vigFree.probB,
  };
}
