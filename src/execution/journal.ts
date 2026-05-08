import * as fs from 'fs';
import * as path from 'path';
import { PaperTrade, ArbSignal, JournalSummary } from '../types';
import { log } from '../utils/logger';

const TRADES_FILE = path.resolve(process.cwd(), 'trades.jsonl');
const SIGNALS_FILE = path.resolve(process.cwd(), 'signals.jsonl');

function ensureFile(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '', 'utf-8');
  }
}

export function appendTrade(trade: PaperTrade): void {
  try {
    ensureFile(TRADES_FILE);
    const line = JSON.stringify(trade) + '\n';
    fs.appendFileSync(TRADES_FILE, line, 'utf-8');
    log('info', `Trade ${trade.id} written to journal`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log('error', `Failed to write trade to journal: ${message}`);
  }
}

export function appendSignal(signal: ArbSignal): void {
  try {
    ensureFile(SIGNALS_FILE);
    const line = JSON.stringify(signal) + '\n';
    fs.appendFileSync(SIGNALS_FILE, line, 'utf-8');
    log('info', `Signal ${signal.id} written to signals log`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log('error', `Failed to write signal to journal: ${message}`);
  }
}

export function loadAllTrades(): PaperTrade[] {
  try {
    ensureFile(TRADES_FILE);
    const data = fs.readFileSync(TRADES_FILE, 'utf-8').trim();
    if (!data) return [];
    return data.split('\n').map(line => JSON.parse(line) as PaperTrade);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log('error', `Failed to load trades: ${message}`);
    return [];
  }
}

export function computeSummary(): JournalSummary {
  const trades = loadAllTrades();
  const closed = trades.filter(t => t.status === 'closed');
  const totalTrades = trades.length;
  const winners = closed.filter(t => t.pnl > 0);
  const totalPnl = closed.reduce((sum, t) => sum + t.pnl, 0);
  const winRate = closed.length > 0 ? winners.length / closed.length : 0;

  let sharpeRatio = 0;
  if (closed.length > 1) {
    const returns = closed.map(t => t.pnl / (t.size || 1));
    const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + (r - meanReturn) ** 2, 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);
    sharpeRatio = stdDev > 0 ? (meanReturn / stdDev) * Math.sqrt(252) : 0;
  }

  return { totalTrades, winRate, totalPnl, sharpeRatio };
}

export function generateReport(): void {
  const summary = computeSummary();
  const initialBankroll = process.env.BANKROLL ? parseFloat(process.env.BANKROLL) : 1000;
  const pnlPct = initialBankroll > 0 ? (summary.totalPnl / initialBankroll) * 100 : 0;

  console.log('\n═══════════════════════════════════════════');
  console.log('  ARBISHOT — FINAL REPORT');
  console.log('═══════════════════════════════════════════');
  console.log(`  Total Trades:     ${summary.totalTrades}`);
  console.log(`  Win Rate:         ${(summary.winRate * 100).toFixed(1)}%`);
  console.log(`  Total P&L:        $${summary.totalPnl.toFixed(2)}`);
  console.log(`  Return:           ${pnlPct.toFixed(2)}%`);
  console.log(`  Sharpe Ratio:     ${summary.sharpeRatio.toFixed(2)}`);
  console.log('═══════════════════════════════════════════\n');
}
