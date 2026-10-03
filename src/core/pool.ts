import type { TeamWeekProb } from './types';

/**
 * Rough model of how the public distributes survivor picks when real pick
 * percentages aren't available: heavy concentration on the biggest favourites.
 */
export function estimatePopularity(week: Record<string, TeamWeekProb>, weekNumber = 1): Record<string, number> {
  const raw: Record<string, number> = {};
  // Later in the season the top teams have been used by much of the field,
  // so picks spread out more.
  const sharpness = Math.max(7, 14 - 0.4 * (weekNumber - 1));
  for (const [team, info] of Object.entries(week)) {
    if (!info.pickable) continue;
    raw[team] = Math.exp(sharpness * (info.winProb - 0.5));
  }
  return normalizeShares(raw);
}

export function normalizeShares(shares: Record<string, number>): Record<string, number> {
  const entries = Object.entries(shares).filter(([, v]) => v > 0 && Number.isFinite(v));
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total <= 0) return {};
  return Object.fromEntries(entries.map(([t, v]) => [t, v / total]));
}

/**
 * Expected fraction of the field still alive given that `team` wins,
 * assuming games are independent (picks of `team`'s opponent all lose).
 */
export function fieldSurvivalIfWins(team: string, week: Record<string, TeamWeekProb>, shares: Record<string, number>): number {
  const opp = week[team]?.opponent;
  let alive = 0;
  for (const [t, s] of Object.entries(shares)) {
    if (t === team) alive += s;
    else if (t === opp) continue;
    else alive += s * (week[t]?.winProb ?? 0.5);
  }
  return Math.max(alive, 1e-4);
}

/**
 * Leverage = 1 / E[field survival | team wins]. Combined with the win
 * probability it gives the pick's expected share of the pot for one week:
 *   EV ∝ p(team) · leverage(team)
 */
export function leverage(team: string, week: Record<string, TeamWeekProb>, shares: Record<string, number>): number {
  return 1 / fieldSurvivalIfWins(team, week, shares);
}
