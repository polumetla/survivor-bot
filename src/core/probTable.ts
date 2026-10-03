import type { Game, ProbTable, TeamWeekProb } from './types';
import { HOME_FIELD_ELO, marketHomeProb, type Ratings } from './ratings';
import { clampProb, eloWinProb } from './probability';

/**
 * Win probability for every team in every week from `fromWeek` onward.
 * Priority: user override > market (moneyline, then spread) > rating model.
 */
export function buildProbTable(
  games: Game[],
  ratings: Ratings,
  fromWeek: number,
  overrides: Record<string, number> = {},
): ProbTable {
  const table: ProbTable = {};
  for (const g of games) {
    if (g.week < fromWeek) continue;
    const week = (table[g.week] ??= {});
    const market = g.status === 'pre' ? marketHomeProb(g) : undefined;
    let homeP: number;
    let source: TeamWeekProb['source'];
    if (market) {
      homeP = market.p;
      source = market.source;
    } else {
      const diff = (ratings[g.home] ?? 1500) - (ratings[g.away] ?? 1500) + (g.neutral ? 0 : HOME_FIELD_ELO);
      homeP = eloWinProb(diff);
      source = 'model';
    }
    let awayP = 1 - homeP;
    let homeSource: TeamWeekProb['source'] = source;
    let awaySource: TeamWeekProb['source'] = source;
    const oh = normalizeOverride(overrides[`${g.week}:${g.home}`]);
    const oa = normalizeOverride(overrides[`${g.week}:${g.away}`]);
    if (oh != null) {
      homeP = oh;
      awayP = oa ?? 1 - oh;
      homeSource = 'override';
      awaySource = 'override';
    } else if (oa != null) {
      awayP = oa;
      homeP = 1 - oa;
      homeSource = 'override';
      awaySource = 'override';
    }
    const pickable = g.status === 'pre';
    week[g.home] = { team: g.home, opponent: g.away, home: true, winProb: clampProb(homeP), source: homeSource, gameId: g.id, pickable };
    week[g.away] = { team: g.away, opponent: g.home, home: false, winProb: clampProb(awayP), source: awaySource, gameId: g.id, pickable };
  }
  return table;
}

function normalizeOverride(v: number | undefined): number | undefined {
  if (v == null || Number.isNaN(v)) return undefined;
  return clampProb(v > 1 ? v / 100 : v);
}
