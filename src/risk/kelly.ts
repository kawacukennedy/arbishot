import { config } from '../config';
import { log } from '../utils/logger';

export function kellyCriterion(
  winProb: number,
  entryPrice: number,
  fraction: number = config.kellyFraction,
  bankroll: number = config.bankroll
): number {
  if (winProb <= 0 || winProb >= 1) {
    log('warn', `Invalid win probability for Kelly: ${winProb}`);
    return 0;
  }

  if (entryPrice <= 0) {
    log('warn', `Invalid entry price for Kelly: ${entryPrice}`);
    return 0;
  }

  const netOdds = (1 / entryPrice) - 1;

  if (netOdds <= 0) {
    log('warn', `Net odds <= 0 (entryPrice=${entryPrice}), cannot size position`);
    return 0;
  }

  const fullKelly = (winProb * (netOdds + 1) - 1) / netOdds;

  if (fullKelly <= 0) {
    log('debug', `Kelly formula yields non-positive bet (f=${fullKelly.toFixed(4)})`);
    return 0;
  }

  const sized = fullKelly * fraction * bankroll;

  const clamped = Math.min(sized, config.maxPositionSize);

  log('debug', `Kelly: winProb=${winProb.toFixed(4)} entry=${entryPrice.toFixed(4)} fullKelly=${fullKelly.toFixed(4)} sized=${clamped.toFixed(2)}`);
  return Math.round(clamped * 100) / 100;
}

export function calculateExpectedValue(
  winProb: number,
  entryPrice: number,
  size: number
): number {
  if (winProb <= 0 || entryPrice <= 0 || size <= 0) return 0;
  const payout = size / entryPrice;
  const cost = size;
  return (winProb * payout) - cost;
}
