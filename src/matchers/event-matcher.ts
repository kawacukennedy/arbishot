import { NBAMarket, OrderBookSummary, DeViggedProbabilities, RawPolymarketMarket, ChampionshipOutright } from '../types';
import { log } from '../utils/logger';
import { parseOutcomePrices } from '../fetchers/polymarket';

const TEAM_ALIASES: Record<string, string[]> = {
  'Oklahoma City Thunder': ['thunder', 'okc', 'oklahoma city'],
  'Los Angeles Lakers': ['lakers', 'la lakers', 'lal'],
  'San Antonio Spurs': ['spurs', 'san antonio'],
  'Minnesota Timberwolves': ['timberwolves', 't-wolves', 'minnesota', 'wolves'],
  'Detroit Pistons': ['pistons', 'detroit'],
  'Cleveland Cavaliers': ['cavaliers', 'cavs', 'cleveland'],
  'New York Knicks': ['knicks', 'new york'],
  'Philadelphia 76ers': ['76ers', 'sixers', 'philadelphia', 'philly'],
  'Boston Celtics': ['celtics', 'boston'],
  'Miami Heat': ['heat', 'miami'],
  'Denver Nuggets': ['nuggets', 'denver'],
  'Golden State Warriors': ['warriors', 'golden state', 'gs'],
  'Dallas Mavericks': ['mavericks', 'mavs', 'dallas'],
  'Milwaukee Bucks': ['bucks', 'milwaukee'],
  'Atlanta Hawks': ['hawks', 'atlanta'],
  'Indiana Pacers': ['pacers', 'indiana'],
  'Orlando Magic': ['magic', 'orlando'],
  'Toronto Raptors': ['raptors', 'toronto'],
  'Chicago Bulls': ['bulls', 'chicago'],
  'Brooklyn Nets': ['nets', 'brooklyn'],
  'Houston Rockets': ['rockets', 'houston'],
  'LA Clippers': ['clippers', 'la clippers', 'lac'],
  'Phoenix Suns': ['suns', 'phoenix'],
  'New Orleans Pelicans': ['pelicans', 'new orleans', 'nola'],
  'Memphis Grizzlies': ['grizzlies', 'memphis'],
  'Utah Jazz': ['jazz', 'utah'],
  'Portland Trail Blazers': ['blazers', 'trail blazers', 'portland'],
  'Sacramento Kings': ['kings', 'sacramento'],
  'Washington Wizards': ['wizards', 'washington'],
};

function normalizeTeamName(name: string): string {
  const lower = name.toLowerCase().trim();
  for (const [canonical, aliases] of Object.entries(TEAM_ALIASES)) {
    if (canonical.toLowerCase() === lower) return canonical;
    for (const alias of aliases) {
      if (lower === alias || lower.includes(alias)) return canonical;
    }
  }
  return name.trim();
}

function extractSingleTeam(question: string): string | null {
  const q = question.toLowerCase();
  for (const [canonical, aliases] of Object.entries(TEAM_ALIASES)) {
    const allNames = [canonical.toLowerCase(), ...aliases];
    for (const name of allNames) {
      if (q.includes(name)) {
        return canonical;
      }
    }
  }
  return null;
}

function extractTeamsFromQuestion(question: string): { teamA: string; teamB: string } | null {
  const q = question.toLowerCase();
  const found: string[] = [];

  for (const [canonical, aliases] of Object.entries(TEAM_ALIASES)) {
    const allNames = [canonical.toLowerCase(), ...aliases];
    for (const name of allNames) {
      if (q.includes(name)) {
        if (!found.includes(canonical)) {
          found.push(canonical);
        }
        break;
      }
    }
    if (found.length >= 2) break;
  }

  if (found.length >= 2) {
    return { teamA: found[0], teamB: found[1] };
  }
  return null;
}

export function matchEvent(
  question: string,
  sportsbookEvent: { home: string; away: string }
): boolean {
  const polyTeams = extractTeamsFromQuestion(question);
  if (!polyTeams) return false;

  const sbHome = normalizeTeamName(sportsbookEvent.home);
  const sbAway = normalizeTeamName(sportsbookEvent.away);

  const polyNormA = normalizeTeamName(polyTeams.teamA);
  const polyNormB = normalizeTeamName(polyTeams.teamB);

  const sbTeams = [sbHome, sbAway];
  return (
    (polyNormA === sbTeams[0] || polyNormA === sbTeams[1]) &&
    (polyNormB === sbTeams[0] || polyNormB === sbTeams[1])
  );
}

function detectMarketType(question: string): NBAMarket['marketType'] {
  const q = question.toLowerCase();
  if (q.includes('finals') || q.includes('champion') || q.includes('championship')) {
    return 'championship_winner';
  }
  if (q.includes('win the series') || q.includes('series winner') || q.includes('conference finals')) {
    return 'series_winner';
  }
  if (q.includes('winner') || q.includes('moneyline') || q.includes('win')) {
    return 'game_winner';
  }
  return 'other';
}

export function buildNBAMarket(
  polyMarket: RawPolymarketMarket,
  orderBook: OrderBookSummary | null,
  sportsbookProb: DeViggedProbabilities | null,
  championshipOutrights?: ChampionshipOutright[],
): NBAMarket | null {
  const marketType = detectMarketType(polyMarket.question);

  let teams = extractTeamsFromQuestion(polyMarket.question);

  if (!teams && marketType === 'championship_winner') {
    const singleTeam = extractSingleTeam(polyMarket.question);
    if (singleTeam) {
      teams = { teamA: singleTeam, teamB: 'Field' };
    }
  }

  if (!teams) {
    log('debug', `Could not extract teams from question: ${polyMarket.question}`);
    return null;
  }

  let polymarketMidpoint = 0.5;
  let polymarketBestBid = 0.5;
  let polymarketBestAsk = 0.5;

  if (orderBook) {
    polymarketMidpoint = orderBook.midPrice;
    polymarketBestBid = orderBook.bestBid;
    polymarketBestAsk = orderBook.bestAsk;
  } else if (polyMarket.bestBid !== undefined && polyMarket.bestAsk !== undefined) {
    polymarketBestBid = polyMarket.bestBid;
    polymarketBestAsk = polyMarket.bestAsk;
    polymarketMidpoint = (polyMarket.bestBid + polyMarket.bestAsk) / 2;
  } else if (polyMarket.lastTradePrice !== undefined && polyMarket.lastTradePrice > 0) {
    polymarketMidpoint = polyMarket.lastTradePrice;
  } else if (polyMarket.outcomePrices) {
    const prices = parseOutcomePrices(polyMarket.outcomePrices);
    if (prices.length >= 2) {
      polymarketMidpoint = prices[0];
      polymarketBestBid = polymarketMidpoint;
      polymarketBestAsk = polymarketMidpoint;
    }
  }

  let sportsbookImpliedProb: number | null = null;
  let sportsbookTeam: string | null = null;

  if (sportsbookProb) {
    const sbTeamA = normalizeTeamName(sportsbookProb.teamA);
    const sbTeamB = normalizeTeamName(sportsbookProb.teamB);

    const polyTeamA = normalizeTeamName(teams.teamA);
    const polyTeamB = normalizeTeamName(teams.teamB);

    if (sbTeamA === polyTeamA || sbTeamA === polyTeamB) {
      sportsbookImpliedProb = sbTeamA === polyTeamA ? sportsbookProb.probA : sportsbookProb.probB;
      sportsbookTeam = sbTeamA === polyTeamA ? sportsbookProb.teamA : sportsbookProb.teamB;
    } else if (sbTeamB === polyTeamA || sbTeamB === polyTeamB) {
      sportsbookImpliedProb = sbTeamB === polyTeamA ? sportsbookProb.probA : sportsbookProb.probB;
      sportsbookTeam = sbTeamB === polyTeamA ? sportsbookProb.teamA : sportsbookProb.teamB;
    }
  }

  if (sportsbookImpliedProb === null && championshipOutrights && marketType === 'championship_winner') {
    const polyTeam = normalizeTeamName(teams.teamA);
    for (const outright of championshipOutrights) {
      if (normalizeTeamName(outright.teamName) === polyTeam) {
        sportsbookImpliedProb = outright.impliedProb;
        sportsbookTeam = outright.teamName;
        break;
      }
    }
  }

  return {
    id: polyMarket.id,
    question: polyMarket.question,
    teamA: teams.teamA,
    teamB: teams.teamB,
    marketType,
    polymarketMidpoint,
    polymarketBestBid,
    polymarketBestAsk,
    sportsbookImpliedProb,
    sportsbookTeam,
    lastUpdated: new Date(),
  };
}
