import { v4 as uuid } from 'uuid';
import { config } from '../config';
import { ArbSignal, NBAMarket, ConsensusProbabilities } from '../types';
import { log } from '../utils/logger';

export function detectValue(
  market: NBAMarket,
  consensus?: ConsensusProbabilities | null,
): ArbSignal | null {
  if (market.sportsbookImpliedProb === null && !consensus) {
    log('debug', `No probability for market ${market.id}, skipping value detection`);
    return null;
  }

  const polyPrice = market.polymarketMidpoint;
  const sbProb = market.sportsbookImpliedProb ?? consensus?.avgProbA ?? null;

  if (sbProb === null) {
    log('debug', `No probability source for market ${market.id}`);
    return null;
  }

  const edge = ((sbProb - polyPrice) / polyPrice) * 100;
  const absEdge = Math.abs(edge);

  if (absEdge < config.minEdgePct) {
    log('debug', `Value edge ${absEdge.toFixed(2)}% below minimum ${config.minEdgePct}%`);
    return null;
  }

  const direction: 'YES' | 'NO' = sbProb > polyPrice ? 'YES' : 'NO';

  const signal: ArbSignal = {
    id: uuid(),
    type: 'value',
    marketId: market.id,
    marketQuestion: market.question,
    edge: absEdge,
    direction,
    confidence: Math.min(absEdge / 10, 1.0),
    timestamp: new Date(),
    metadata: {
      predictionPrice: polyPrice,
      referenceProb: sbProb,
      referenceProbTeam: market.sportsbookTeam ?? (consensus ? consensus.teamA : null),
      source: consensus ? 'consensus' : 'sportsbook',
    },
  };

  log('info', `Value signal: ${market.question} ${direction} edge=${absEdge.toFixed(2)}%`);
  return signal;
}

export function detectBookValue(
  deViggedProbA: number,
  consensusProbA: number,
  teamA: string,
  teamB: string,
  bookmakerKey: string,
): ArbSignal | null {
  const edge = ((deViggedProbA - consensusProbA) / consensusProbA) * 100;
  const absEdge = Math.abs(edge);

  if (absEdge < config.minEdgePct) return null;

  const direction: 'YES' | 'NO' = edge > 0 ? 'YES' : 'NO';

  const signal: ArbSignal = {
    id: uuid(),
    type: 'value',
    marketId: `book-${bookmakerKey}-${teamA}-${teamB}`.toLowerCase().replace(/\s+/g, '-'),
    marketQuestion: `${teamA} vs ${teamB} (${bookmakerKey})`,
    edge: absEdge,
    direction,
    confidence: Math.min(absEdge / 10, 1.0),
    timestamp: new Date(),
    metadata: {
      bookmaker: bookmakerKey,
      teamA,
      teamB,
      deViggedProbA,
      consensusProbA,
      source: 'book_vs_consensus',
    },
  };

  log('info', `Book value: ${teamA} @ ${bookmakerKey} edge=${absEdge.toFixed(2)}% vs consensus`);
  return signal;
}
