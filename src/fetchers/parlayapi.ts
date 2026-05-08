import fetch from 'node-fetch';
import { config } from '../config';
import { RawSportsbookOdds } from '../types';
import { log } from '../utils/logger';

async function fetchWithRetry(url: string, headers: Record<string, string>, retries = 3, delay = 2000): Promise<RawSportsbookOdds[]> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(15000),
      });

      if (response.status === 429) {
        log('warn', `Rate limited, attempt ${attempt}/${retries}`);
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, delay * attempt));
          continue;
        }
        return [];
      }

      if (!response.ok) {
        log('error', `API returned status ${response.status}`);
        return [];
      }

      const data = await response.json() as RawSportsbookOdds[];
      return Array.isArray(data) ? data : [];
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log('warn', `Fetch attempt ${attempt} failed: ${message}`);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, delay * attempt));
      }
    }
  }
  return [];
}

export async function fetchParlayAPIOdds(): Promise<RawSportsbookOdds[]> {
  const apiKey = process.env.PARLAY_API_KEY;
  if (!apiKey) {
    log('debug', 'No PARLAY_API_KEY set, skipping ParlayAPI');
    return [];
  }

  const url = `https://parlay-api.com/v1/sports/basketball_nba/odds?apiKey=${apiKey}&regions=us&markets=h2h`;
  log('info', 'Fetching NBA odds from ParlayAPI');

  const events = await fetchWithRetry(url, { 'Accept': 'application/json' });
  log('info', `ParlayAPI: ${events.length} NBA events`);
  return events;
}
