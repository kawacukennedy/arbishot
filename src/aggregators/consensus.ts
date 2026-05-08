import { RawSportsbookOdds, ConsensusProbabilities, BookOdds } from '../types';
import { log } from '../utils/logger';
import { anyOddsToDecimal, decimalToImpliedProb, deVig } from '../normalizers/probability';

function extractMoneylineOdds(event: RawSportsbookOdds): BookOdds[] {
  const results: BookOdds[] = [];

  for (const book of event.bookmakers) {
    if (!book.markets?.length) continue;

    for (const market of book.markets) {
      if (market.key !== 'h2h') continue;
      if (!market.outcomes || market.outcomes.length < 2) continue;

      const outcomes = market.outcomes;
      const nameA = outcomes[0].name;
      const nameB = outcomes[1].name;

      const priceA = outcomes[0].price;
      const priceB = outcomes[1].price;

      if (priceA <= 0 || priceB <= 0) continue;

      const decimalA = priceA >= 1 ? priceA : anyOddsToDecimal(priceA);
      const decimalB = priceB >= 1 ? priceB : anyOddsToDecimal(priceB);

      const probA = decimalToImpliedProb(decimalA);
      const probB = decimalToImpliedProb(decimalB);
      const vigFree = deVig(probA, probB);

      results.push({
        bookmakerKey: book.key,
        bookmakerTitle: book.title,
        teamA: nameA,
        teamB: nameB,
        priceA: decimalA,
        priceB: decimalB,
        deViggedProbA: vigFree.probA,
        deViggedProbB: vigFree.probB,
      });
      break;
    }
  }

  return results;
}

export function computeConsensus(event: RawSportsbookOdds): ConsensusProbabilities | null {
  const books = extractMoneylineOdds(event);
  if (books.length === 0) return null;

  const teamAName = books[0].teamA;
  const teamBName = books[0].teamB;

  const sumA = books.reduce((s, b) => s + b.deViggedProbA, 0);
  const sumB = books.reduce((s, b) => s + b.deViggedProbB, 0);

  return {
    teamA: teamAName,
    teamB: teamBName,
    avgProbA: sumA / books.length,
    avgProbB: sumB / books.length,
    bookCount: books.length,
    perBook: books,
  };
}

export function findEdgeAgainstConsensus(
  consensus: ConsensusProbabilities,
  bookmakerKey: string,
): { edge: number; direction: 'YES' | 'NO' } | null {
  const book = consensus.perBook.find(b => b.bookmakerKey === bookmakerKey);
  if (!book) return null;

  const edgeA = ((book.deViggedProbA - consensus.avgProbA) / consensus.avgProbA) * 100;
  const edgeB = ((book.deViggedProbB - consensus.avgProbB) / consensus.avgProbB) * 100;

  const absEdgeA = Math.abs(edgeA);
  const absEdgeB = Math.abs(edgeB);

  if (absEdgeA >= absEdgeB && absEdgeA > 0) {
    return { edge: absEdgeA, direction: edgeA > 0 ? 'YES' : 'NO' };
  }
  if (absEdgeB > 0) {
    return { edge: absEdgeB, direction: edgeB > 0 ? 'YES' : 'NO' };
  }
  return null;
}

export function computeNBAConsensus(
  events: RawSportsbookOdds[],
): Map<string, ConsensusProbabilities> {
  log('info', `Computing consensus across ${events.length} NBA events`);
  const map = new Map<string, ConsensusProbabilities>();

  for (const event of events) {
    const consensus = computeConsensus(event);
    if (consensus) {
      map.set(event.id, consensus);
      log('debug', `  ${event.home_team} vs ${event.away_team}: ${consensus.bookCount} books, avg ${(consensus.avgProbA * 100).toFixed(1)}% / ${(consensus.avgProbB * 100).toFixed(1)}%`);
    }
  }

  log('info', `Consensus computed for ${map.size} events`);
  return map;
}
