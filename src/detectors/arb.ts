import { v4 as uuid } from 'uuid';
import { config } from '../config';
import { ArbSignal, NBAMarket, CombinedOrderBook } from '../types';
import { log } from '../utils/logger';

export function detectPureArb(
  market: NBAMarket,
  combinedBook: CombinedOrderBook | null
): ArbSignal | null {
  if (!combinedBook) {
    log('debug', `No order book for market ${market.id}, skipping arb detection`);
    return null;
  }

  const askYes = combinedBook.yesAsk;
  const askNo = combinedBook.noAsk;

  if (askYes <= 0 || askNo <= 0) {
    log('debug', `Invalid ask prices for arb: askYes=${askYes}, askNo=${askNo}`);
    return null;
  }

  const totalCost = askYes + askNo;
  const feeMultiplier = 1 + config.feeRate;
  const effectiveCost = totalCost * feeMultiplier;

  if (effectiveCost >= 1.0) {
    return null;
  }

  const edge = (1.0 - effectiveCost) * 100;

  if (edge < config.minEdgePct) {
    log('debug', `Arb edge ${edge.toFixed(2)}% below minimum ${config.minEdgePct}%`);
    return null;
  }

  const signal: ArbSignal = {
    id: uuid(),
    type: 'pure_arb',
    marketId: market.id,
    marketQuestion: market.question,
    edge,
    direction: 'BOTH',
    confidence: Math.min(edge / 5, 1.0),
    timestamp: new Date(),
    metadata: {
      askYes,
      askNo,
      totalCost,
      effectiveCost,
      feeRate: config.feeRate,
    },
  };

  log('info', `Pure arb signal: ${market.question} edge=${edge.toFixed(2)}%`);
  return signal;
}
