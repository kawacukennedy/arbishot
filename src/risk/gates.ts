import { CombinedOrderBook } from '../types';
import { config } from '../config';
import { log } from '../utils/logger';

export function checkCooldown(
  lastTradeTime: Date | null,
  cooldownMinutes: number = config.cooldownMinutes
): boolean {
  if (lastTradeTime === null) return true;

  const elapsed = (Date.now() - lastTradeTime.getTime()) / (1000 * 60);
  const allowed = elapsed >= cooldownMinutes;

  if (!allowed) {
    log('debug', `Cooldown active: ${elapsed.toFixed(1)}m elapsed, need ${cooldownMinutes}m`);
  }

  return allowed;
}

export function checkMaxDrawdown(
  currentEquity: number,
  peak: number,
  maxDDPercent: number = 20
): boolean {
  if (peak <= 0) return true;

  const ddPercent = ((peak - currentEquity) / peak) * 100;
  const allowed = ddPercent < maxDDPercent;

  if (!allowed) {
    log('warn', `Max drawdown reached: ${ddPercent.toFixed(1)}% (limit ${maxDDPercent}%)`);
  }

  return allowed;
}

export function checkLiquidity(
  combinedBook: CombinedOrderBook | null,
  requiredSize: number
): boolean {
  if (!combinedBook) return false;

  const available = Math.max(combinedBook.yesAskSize, combinedBook.noAskSize);
  const allowed = available >= requiredSize;

  if (!allowed) {
    log('debug', `Insufficient liquidity: need ${requiredSize.toFixed(2)}, have ${available.toFixed(2)}`);
  }

  return allowed;
}

export function shouldTrade(
  lastTradeTime: Date | null,
  currentEquity: number,
  peak: number,
  combinedBook: CombinedOrderBook | null,
  requiredSize: number
): boolean {
  if (!checkCooldown(lastTradeTime)) return false;
  if (!checkMaxDrawdown(currentEquity, peak)) return false;
  if (!checkLiquidity(combinedBook, requiredSize)) return false;
  return true;
}
