import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Text } from 'ink';
import { config } from '../config';
import { NBAMarket, ArbSignal, PaperTrade, EquityPoint, CombinedOrderBook, ConsensusProbabilities } from '../types';
import { fetchNBAMarkets, fetchCombinedOrderBook } from '../fetchers/polymarket';
import { fetchNBAManifoldMarkets } from '../fetchers/manifold';
import { fetchNBAMoneylines, extractBestOdds } from '../fetchers/sportsbook';
import { fetchParlayAPIOdds } from '../fetchers/parlayapi';
import { fetchNBAChampionOdds } from '../fetchers/championship';
import { computeNBAConsensus, findEdgeAgainstConsensus } from '../aggregators/consensus';
import { buildNBAMarket } from '../matchers/event-matcher';
import { detectPureArb } from '../detectors/arb';
import { detectValue, detectBookValue } from '../detectors/value';
import { detectMomentum } from '../detectors/momentum';
import { PaperEngine } from '../execution/paper';
import { log } from '../utils/logger';

function renderSparkline(data: number[], width: number): string {
  if (data.length < 2 || width < 2) return '';
  const chars = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const sampled = data.length > width
    ? data.filter((_, i) => i % Math.ceil(data.length / width) === 0)
    : data;
  const min = Math.min(...sampled);
  const max = Math.max(...sampled);
  const range = max - min || 1;

  return sampled.map(v => {
    const idx = Math.min(Math.floor(((v - min) / range) * (chars.length - 1)), chars.length - 1);
    return chars[idx];
  }).join('');
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour12: false });
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

interface MarketRowProps {
  market: NBAMarket;
}

function MarketRow({ market }: MarketRowProps) {
  const label = truncate(`${market.teamA.split(' ').pop()}/${market.teamB.split(' ').pop()}`, 16);
  return (
    <Box>
      <Box width={18}><Text>{label}</Text></Box>
      <Box width={8} justifyContent="flex-end"><Text>{market.polymarketMidpoint.toFixed(3)}</Text></Box>
      {market.sportsbookImpliedProb !== null ? (
        <Box width={8} justifyContent="flex-end"><Text color="green">{market.sportsbookImpliedProb.toFixed(3)}</Text></Box>
      ) : (
        <Box width={8} justifyContent="flex-end"><Text color="gray">---</Text></Box>
      )}
    </Box>
  );
}

interface SignalRowProps {
  signal: ArbSignal;
}

function SignalRow({ signal }: SignalRowProps) {
  const typeColor = signal.type === 'pure_arb' ? 'yellow' : signal.type === 'value' ? 'cyan' : 'magenta';
  const rawType = signal.type === 'pure_arb' ? 'PURE' : signal.type === 'value' ? 'VALUE' : 'MOME';
  return (
    <Box>
      <Box width={10}><Text color="gray">{formatTime(signal.timestamp)}</Text></Box>
      <Box width={6}><Text color={typeColor}>{rawType}</Text></Box>
      <Box width={18}><Text>{truncate(signal.marketQuestion, 16)}</Text></Box>
      <Box width={8} justifyContent="flex-end"><Text color="green">+{signal.edge.toFixed(1)}%</Text></Box>
    </Box>
  );
}

interface TradeRowProps {
  trade: PaperTrade;
}

function TradeRow({ trade }: TradeRowProps) {
  const statusColor = trade.status === 'open' ? 'cyan' : trade.pnl > 0 ? 'green' : 'red';
  const label = truncate(`${trade.marketQuestion.split(' ').slice(0, 2).join('')}`, 12);
  return (
    <Box>
      <Box width={10}><Text color="gray">{trade.filledAt ? formatTime(trade.filledAt) : '---'}</Text></Box>
      <Box width={6}><Text>{trade.side === 'BOTH' ? 'ARB' : trade.side}</Text></Box>
      <Box width={14}><Text>{label}</Text></Box>
      <Box width={6} justifyContent="flex-end"><Text>{trade.size.toFixed(1)}</Text></Box>
      <Box width={8} justifyContent="flex-end"><Text>{trade.entryPrice.toFixed(3)}</Text></Box>
      <Box width={8} justifyContent="flex-end"><Text color={statusColor}>
        {trade.status === 'open' ? 'OPEN' : `${trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(1)}`}
      </Text></Box>
    </Box>
  );
}

export default function App() {
  const [markets, setMarkets] = useState<NBAMarket[]>([]);
  const [signals, setSignals] = useState<ArbSignal[]>([]);
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [equityData, setEquityData] = useState<EquityPoint[]>([]);
  const [lastScan, setLastScan] = useState<string>('never');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState<string | null>(null);

  const engineRef = useRef<PaperEngine>(new PaperEngine(config.bankroll));
  const lastScanRef = useRef<number>(0);

  const runScan = useCallback(async () => {
    setStatus('scanning');
    setError(null);

    try {
      const [polyMarkets, manifoldMarkets, sportsbookEvents, championshipOdds] = await Promise.all([
        fetchNBAMarkets(),
        fetchNBAManifoldMarkets(),
        fetchNBAMoneylines(),
        fetchNBAChampionOdds(),
      ]);

      const mergedPolyMarkets = [...polyMarkets];
      const seenIds = new Set(polyMarkets.map(m => m.question.toLowerCase()));
      for (const mm of manifoldMarkets) {
        const q = mm.question.toLowerCase();
        if (!seenIds.has(q)) {
          seenIds.add(q);
          mergedPolyMarkets.push(mm);
        }
      }

      const allSignals: ArbSignal[] = [];
      const allMarkets: NBAMarket[] = [];

      const sportsbookProbs = sportsbookEvents
        .map(e => extractBestOdds(e))
        .filter((p): p is NonNullable<typeof p> => p !== null);

      for (const pm of mergedPolyMarkets) {
        const hasTokenIds = pm.clobTokenIds && pm.clobTokenIds.trim().length > 0;
        const combinedBook = hasTokenIds
          ? await fetchCombinedOrderBook(pm.clobTokenIds)
          : null;

        let matchedProb = null;
        for (const sp of sportsbookProbs) {
          const home = sp.teamA;
          const away = sp.teamB;
          const matchResult = (() => {
            const q = pm.question.toLowerCase();
            const spHome = sp.teamA.toLowerCase();
            const spAway = sp.teamB.toLowerCase();
            return (q.includes(spHome) && q.includes(spAway)) ||
                   (q.includes(spAway) && q.includes(spHome));
          })();
          if (matchResult) {
            matchedProb = sp;
            break;
          }
        }

        const market = buildNBAMarket(pm, null, matchedProb, championshipOdds);
        if (!market) continue;
        if (combinedBook) {
          market.polymarketMidpoint = combinedBook.yesMid;
          market.polymarketBestBid = combinedBook.yesBid;
          market.polymarketBestAsk = combinedBook.yesAsk;
        }
        allMarkets.push(market);

        const arbSignal = detectPureArb(market, combinedBook);
        if (arbSignal) allSignals.push(arbSignal);

        const valueSignal = detectValue(market);
        if (valueSignal) allSignals.push(valueSignal);

        const momentumSignal = detectMomentum(market);
        if (momentumSignal) allSignals.push(momentumSignal);
      }

      const engine = engineRef.current;

      for (const signal of allSignals) {
        const market = allMarkets.find(m => m.id === signal.marketId);
        if (!market) continue;

        const pm = mergedPolyMarkets.find(p => p.id === signal.marketId);
        const hasTokenIds = pm?.clobTokenIds && pm.clobTokenIds.trim().length > 0;
        const combinedBook = hasTokenIds
          ? await fetchCombinedOrderBook(pm!.clobTokenIds)
          : null;

        engine.executeTrade(market, signal, combinedBook);
      }

      setMarkets(allMarkets);
      setSignals(prev => [...allSignals, ...prev].slice(0, 50));
      setTrades(engine.getTrades());
      setEquityData(engine.getEquityCurve());
      lastScanRef.current = Date.now();
      setLastScan(formatTime(new Date()));
      setStatus('idle');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log('error', `Scan error: ${message}`);
      setError(message);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    runScan();
    const interval = setInterval(runScan, config.scanIntervalMs);
    return () => clearInterval(interval);
  }, [runScan]);

  const pnl = equityData.length >= 2
    ? equityData[equityData.length - 1].equity - equityData[0].equity
    : 0;
  const pnlPct = equityData.length >= 2 && equityData[0].equity > 0
    ? (pnl / equityData[0].equity) * 100
    : 0;
  const statusColor = status === 'scanning' ? 'yellow' : status === 'error' ? 'red' : 'green';

  const recentSignals = signals.slice(0, 10);
  const recentTrades = trades.slice(-8).reverse();
  const equityValues = equityData.map(e => e.equity);
  const sparkline = renderSparkline(equityValues, 30);

  return (
    <Box flexDirection="column" paddingLeft={1} paddingTop={1}>
      <Box>
        <Text bold color="blue">ARBISHOT LIVE DASHBOARD</Text>
        <Text>  </Text>
        <Text color={statusColor}>({status})</Text>
        <Text>  last scan: </Text>
        <Text color="gray">{lastScan}</Text>
      </Box>

      <Box borderStyle="single" marginTop={1}>
        <Box flexDirection="column" width={40} paddingRight={1}>
          <Text bold underline>NBA MARKETS ({markets.length})</Text>
          <Box marginTop={1}>
            <Box width={18}><Text color="gray">Event</Text></Box>
            <Box width={8} justifyContent="flex-end"><Text color="gray">Poly</Text></Box>
            <Box width={8} justifyContent="flex-end"><Text color="gray">Sports</Text></Box>
          </Box>
          {markets.slice(0, 8).map(m => (
            <MarketRow key={m.id} market={m} />
          ))}
          {markets.length === 0 && (
            <Text color="gray">  No markets loaded</Text>
          )}
        </Box>

        <Box flexDirection="column" width={46} paddingLeft={1}>
          <Text bold underline>ACTIVE SIGNALS ({signals.length})</Text>
          <Box marginTop={1}>
            <Box width={10}><Text color="gray">Time</Text></Box>
            <Box width={6}><Text color="gray">Type</Text></Box>
            <Box width={18}><Text color="gray">Market</Text></Box>
            <Box width={8} justifyContent="flex-end"><Text color="gray">Edge</Text></Box>
          </Box>
          {recentSignals.map(s => (
            <SignalRow key={s.id} signal={s} />
          ))}
          {recentSignals.length === 0 && (
            <Text color="gray">  No signals detected</Text>
          )}
        </Box>
      </Box>

      <Box borderStyle="single" marginTop={1}>
        <Box flexDirection="column" width={88}>
          <Box>
            <Text bold underline>PAPER TRADES ({trades.length})</Text>
            <Text>  </Text>
            <Text>P&L: </Text>
            <Text color={pnl >= 0 ? 'green' : 'red'}>
              ${pnl.toFixed(2)} ({pnlPct.toFixed(1)}%)
            </Text>
          </Box>
          <Box marginTop={1}>
            <Box width={10}><Text color="gray">Time</Text></Box>
            <Box width={6}><Text color="gray">Side</Text></Box>
            <Box width={14}><Text color="gray">Market</Text></Box>
            <Box width={6} justifyContent="flex-end"><Text color="gray">Size</Text></Box>
            <Box width={8} justifyContent="flex-end"><Text color="gray">Entry</Text></Box>
            <Box width={8} justifyContent="flex-end"><Text color="gray">Status</Text></Box>
          </Box>
          {recentTrades.map(t => (
            <TradeRow key={t.id} trade={t} />
          ))}
          {trades.length === 0 && (
            <Text color="gray">  No trades executed</Text>
          )}
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text bold underline>EQUITY CURVE: </Text>
        <Text color="cyan">{sparkline || '(waiting for data)'}</Text>
      </Box>

      {error && (
        <Box marginTop={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}
    </Box>
  );
}
