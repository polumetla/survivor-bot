import { moneylineToImplied } from '../core/probability';
import { resolveTeam } from '../core/teams';
import type { Game } from '../core/types';
import { fetchJson, readCache, writeCache } from './cache';

/** The Odds API v4 (https://the-odds-api.com) — optional, needs ODDS_API_KEY. */
interface OddsApiEvent {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Array<{
    key: string;
    markets: Array<{ key: 'h2h' | 'spreads' | string; outcomes: Array<{ name: string; price: number; point?: number }> }>;
  }>;
}

export interface ConsensusLine {
  home: string;
  away: string;
  commence: string;
  homeWinProb?: number;
  homeSpread?: number;
  books: number;
}

export function consensusFromOddsApi(events: OddsApiEvent[]): ConsensusLine[] {
  const out: ConsensusLine[] = [];
  for (const ev of events) {
    const home = resolveTeam(ev.home_team);
    const away = resolveTeam(ev.away_team);
    if (!home || !away) continue;
    const probs: number[] = [];
    const spreads: number[] = [];
    for (const b of ev.bookmakers ?? []) {
      for (const m of b.markets ?? []) {
        const h = m.outcomes.find((o) => resolveTeam(o.name) === home);
        const a = m.outcomes.find((o) => resolveTeam(o.name) === away);
        if (!h || !a) continue;
        if (m.key === 'h2h') {
          const ph = moneylineToImplied(h.price);
          const pa = moneylineToImplied(a.price);
          probs.push(ph / (ph + pa));
        } else if (m.key === 'spreads' && h.point != null) {
          spreads.push(h.point);
        }
      }
    }
    const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : undefined);
    out.push({
      home,
      away,
      commence: ev.commence_time,
      homeWinProb: avg(probs),
      homeSpread: avg(spreads),
      books: Math.max(probs.length, spreads.length),
    });
  }
  return out;
}

export async function fetchOddsApiLines(apiKey: string): Promise<ConsensusLine[]> {
  const cached = await readCache<ConsensusLine[]>('oddsapi-nfl');
  if (cached) return cached;
  const url =
    'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds' +
    `?regions=us&markets=h2h,spreads&oddsFormat=american&apiKey=${encodeURIComponent(apiKey)}`;
  const events = await fetchJson<OddsApiEvent[]>(url);
  const lines = consensusFromOddsApi(events);
  // The free tier is ~500 requests/month; cache generously.
  await writeCache('oddsapi-nfl', lines, 60 * 60 * 1000);
  return lines;
}

/** Overlay consensus lines onto matching upcoming games (same teams, kickoff within 2 days). */
export function applyConsensus(games: Game[], lines: ConsensusLine[]): number {
  let applied = 0;
  for (const l of lines) {
    const t = Date.parse(l.commence);
    const g = games.find(
      (g) => g.status === 'pre' && g.home === l.home && g.away === l.away && Math.abs(Date.parse(g.kickoff) - t) < 2 * 86400000,
    );
    if (!g) continue;
    g.odds = {
      ...g.odds,
      homeWinProb: l.homeWinProb ?? g.odds?.homeWinProb,
      homeSpread: l.homeSpread ?? g.odds?.homeSpread,
      provider: `consensus of ${l.books} books`,
    };
    applied++;
  }
  return applied;
}
