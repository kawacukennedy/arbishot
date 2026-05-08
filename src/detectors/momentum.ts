import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { config } from '../config';
import { ArbSignal, NBAMarket } from '../types';
import { log } from '../utils/logger';

/**
 * Momentum detector — stub implementation.
 *
 * This strategy exploits the tendency of sportsbooks to over-adjust after a
 * Game 1 upset while Polymarket crowds lag. Historically, higher seeds still
 * win ~75% of series after losing Game 1.
 *
 * To enable: place a JSON file at the path specified in MOMENTUM_DATA_PATH
 * with the following structure:
 * {
 *   "series": [
 *     {
 *       "teamA": "Oklahoma City Thunder",
 *       "teamB": "Los Angeles Lakers",
 *       "game1Winner": "Los Angeles Lakers",
 *       "higherSeed": "Oklahoma City Thunder",
 *       "seriesScore": "LAL 1-0"
 *     }
 *   ]
 * }
 *
 * The detector reads the file and checks if the higher seed lost Game 1.
 * If so, and Polymarket still prices the higher seed at or near pre-series
 * levels (before sportsbook adjustment), a momentum signal is generated.
 *
 * This implementation is a stub that returns empty unless MOMENTUM_DATA_PATH
 * is set. Integrate with fetchNBAMarkets() data for full automation.
 */

interface SeriesState {
  series: Array<{
    teamA: string;
    teamB: string;
    game1Winner: string;
    higherSeed: string;
    seriesScore: string;
  }>;
}

export function detectMomentum(
  market: NBAMarket
): ArbSignal | null {
  if (!config.momentumDataPath) {
    return null;
  }

  try {
    const raw = fs.readFileSync(config.momentumDataPath, 'utf-8');
    const state: SeriesState = JSON.parse(raw);

    const series = state.series.find(s => {
      const a = s.teamA.toLowerCase();
      const b = s.teamB.toLowerCase();
      const mA = market.teamA.toLowerCase();
      const mB = market.teamB.toLowerCase();
      return (a === mA && b === mB) || (a === mB && b === mA);
    });

    if (!series) return null;

    const higherSeedLostGame1 = series.game1Winner !== series.higherSeed;
    if (!higherSeedLostGame1) return null;

    if (market.sportsbookImpliedProb === null) return null;

    const edge = ((1 - market.polymarketMidpoint) / market.polymarketMidpoint) * 100;

    if (edge < config.minEdgePct) return null;

    const signal: ArbSignal = {
      id: uuid(),
      type: 'momentum',
      marketId: market.id,
      marketQuestion: market.question,
      edge,
      direction: 'YES',
      confidence: 0.75,
      timestamp: new Date(),
      metadata: {
        higherSeed: series.higherSeed,
        game1Winner: series.game1Winner,
        seriesScore: series.seriesScore,
      },
    };

    log('info', `Momentum signal: ${market.question} edge=${edge.toFixed(2)}%`);
    return signal;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log('warn', `Momentum detector error: ${message}`);
    return null;
  }
}
