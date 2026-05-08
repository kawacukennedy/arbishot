import fetch from 'node-fetch';
import { config } from '../config';
import { ChampionshipOutright, SportsbookBookmaker } from '../types';
import { log } from '../utils/logger';
import { decimalToImpliedProb } from '../normalizers/probability';

async function fetchWithRetry(url: string, retries = 3, delay = 2000): Promise<ChampionshipOutright[]> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000),
      });

      if (response.status === 429) {
        log('warn', `Rate limited on championship fetch, attempt ${attempt}/${retries}`);
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, delay * attempt));
          continue;
        }
        return [];
      }

      if (!response.ok) {
        log('error', `Championship API returned status ${response.status}`);
        return [];
      }

      const events = await response.json() as Array<{
        id: string;
        bookmakers: SportsbookBookmaker[];
      }>;

      if (!Array.isArray(events) || events.length === 0) return [];

      const teamPrices = new Map<string, Array<{ bookmaker: string; price: number }>>();

      for (const event of events) {
        for (const book of event.bookmakers || []) {
          for (const market of book.markets || []) {
            if (market.key !== 'outrights') continue;
            for (const outcome of market.outcomes || []) {
              if (outcome.price <= 0) continue;
              const existing = teamPrices.get(outcome.name) || [];
              existing.push({ bookmaker: book.title, price: outcome.price });
              teamPrices.set(outcome.name, existing);
            }
          }
        }
      }

      const results: ChampionshipOutright[] = [];
      for (const [teamName, prices] of teamPrices) {
        const bestPrice = Math.min(...prices.map(p => p.price));
        results.push({
          teamName,
          bestPrice,
          impliedProb: decimalToImpliedProb(bestPrice),
          bookCount: new Set(prices.map(p => p.bookmaker)).size,
          allPrices: prices,
        });
      }

      results.sort((a, b) => a.bestPrice - b.bestPrice);
      return results;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log('warn', `Championship fetch attempt ${attempt} failed: ${message}`);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, delay * attempt));
      }
    }
  }
  return [];
}

export async function fetchNBAChampionOdds(): Promise<ChampionshipOutright[]> {
  const url = `https://api.the-odds-api.com/v4/sports/basketball_nba_championship_winner/odds/?apiKey=${config.oddsApiKey}&regions=us&oddsFormat=decimal`;
  log('info', 'Fetching NBA Championship winner odds from The Odds API');

  const results = await fetchWithRetry(url);
  log('info', `Championship odds: ${results.length} teams`);

  return results;
}
