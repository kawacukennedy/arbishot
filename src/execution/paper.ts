import { v4 as uuid } from 'uuid';
import { config } from '../config';
import { PaperTrade, ArbSignal, NBAMarket, CombinedOrderBook, EquityPoint } from '../types';
import { log } from '../utils/logger';
import { appendTrade, appendSignal } from './journal';
import { kellyCriterion, calculateExpectedValue } from '../risk/kelly';

export class PaperEngine {
  private trades: PaperTrade[] = [];
  private equityCurve: EquityPoint[] = [];
  private bankroll: number;
  private peak: number;
  private lastTradeTime: Date | null = null;

  constructor(initialBankroll: number = config.bankroll) {
    this.bankroll = initialBankroll;
    this.peak = initialBankroll;
    this.equityCurve.push({ timestamp: new Date(), equity: initialBankroll });
  }

  getBankroll(): number {
    return this.bankroll;
  }

  getPeak(): number {
    return this.peak;
  }

  getLastTradeTime(): Date | null {
    return this.lastTradeTime;
  }

  getTrades(): PaperTrade[] {
    return this.trades;
  }

  getEquityCurve(): EquityPoint[] {
    return [...this.equityCurve];
  }

  simulateFill(
    side: 'YES' | 'NO',
    size: number,
    combinedBook: CombinedOrderBook | null
  ): { filled: number; price: number } {
    if (!combinedBook || size <= 0) {
      return { filled: 0, price: 0 };
    }

    const available = side === 'YES' ? combinedBook.yesAskSize : combinedBook.noAskSize;
    const price = side === 'YES' ? combinedBook.yesAsk : combinedBook.noAsk;

    if (available <= 0 || price <= 0) {
      return { filled: 0, price: 0 };
    }

    if (size <= available) {
      return { filled: size, price };
    }

    log('warn', `Partial fill: requested ${size.toFixed(2)}, available ${available.toFixed(2)}`);
    return { filled: available, price };
  }

  executeTrade(
    market: NBAMarket,
    signal: ArbSignal,
    combinedBook: CombinedOrderBook | null
  ): PaperTrade[] {
    appendSignal(signal);

    const trades: PaperTrade[] = [];

    if (signal.direction === 'BOTH') {
      const yesTrade = this.createSingleTrade(market, signal, 'YES', combinedBook);
      if (yesTrade) trades.push(yesTrade);

      const noTrade = this.createSingleTrade(market, signal, 'NO', combinedBook);
      if (noTrade) trades.push(noTrade);
    } else {
      const trade = this.createSingleTrade(market, signal, signal.direction, combinedBook);
      if (trade) trades.push(trade);
    }

    for (const trade of trades) {
      this.trades.push(trade);
      appendTrade(trade);
      this.lastTradeTime = new Date();

      if (trade.status === 'open') {
        this.bankroll -= trade.size + trade.feePaid;
      }
    }

    this.updateEquity();
    return trades;
  }

  private createSingleTrade(
    market: NBAMarket,
    signal: ArbSignal,
    side: 'YES' | 'NO',
    combinedBook: CombinedOrderBook | null
  ): PaperTrade | null {
    const { filled, price } = this.simulateFill(side, 1.0, combinedBook);
    if (filled <= 0 || price <= 0) {
      log('warn', `Cannot fill ${side} order for ${market.question}`);
      return null;
    }

    let size: number;

    if (signal.type === 'pure_arb') {
      const arbSize = Math.min(config.maxPositionSize / 2, this.bankroll * 0.1);
      size = Math.round(arbSize * 100) / 100;
    } else {
      let winProb: number;
      if (side === 'YES') {
        winProb = market.sportsbookImpliedProb ?? market.polymarketMidpoint;
      } else {
        winProb = 1 - (market.sportsbookImpliedProb ?? market.polymarketMidpoint);
      }
      size = kellyCriterion(winProb, price, config.kellyFraction, this.bankroll);
    }

    if (size <= 0) {
      log('debug', `Size is 0 for ${side} trade on ${market.question}`);
      return null;
    }

    const { filled: actualSize } = this.simulateFill(side, size, combinedBook);
    if (actualSize <= 0) return null;

    const fee = actualSize * config.feeRate;
    const winProbPure = market.sportsbookImpliedProb ?? market.polymarketMidpoint;
    const winProb = side === 'YES' ? winProbPure : 1 - winProbPure;
    const ev = calculateExpectedValue(winProb, price, actualSize);

    const trade: PaperTrade = {
      id: uuid(),
      signalId: signal.id,
      marketId: market.id,
      marketQuestion: market.question,
      side,
      entryPrice: price,
      size: actualSize,
      expectedValue: ev,
      status: 'open',
      pnl: 0,
      filledAt: new Date(),
      closedAt: null,
      feePaid: fee,
    };

    return trade;
  }

  updateEquity(): void {
    const totalPnl = this.trades.reduce((sum, t) => sum + (t.status === 'closed' ? t.pnl : 0), 0);
    const openCost = this.trades
      .filter(t => t.status === 'open')
      .reduce((sum, t) => sum + t.size + t.feePaid, 0);

    const currentEquity = config.bankroll + totalPnl - openCost;
    this.bankroll = currentEquity;

    if (currentEquity > this.peak) {
      this.peak = currentEquity;
    }

    this.equityCurve.push({ timestamp: new Date(), equity: currentEquity });
  }

  getPnl(): number {
    return this.trades
      .filter(t => t.status === 'closed')
      .reduce((sum, t) => sum + t.pnl, 0);
  }

  getOpenTrades(): PaperTrade[] {
    return this.trades.filter(t => t.status === 'open');
  }

  resolveTrade(tradeId: string, finalPnl: number): void {
    const trade = this.trades.find(t => t.id === tradeId);
    if (!trade) {
      log('warn', `Trade ${tradeId} not found for resolution`);
      return;
    }

    trade.status = 'closed';
    trade.pnl = finalPnl;
    trade.closedAt = new Date();
    this.bankroll += finalPnl;
    this.updateEquity();

    log('info', `Trade ${tradeId} resolved with P&L ${finalPnl.toFixed(2)}`);
  }
}
