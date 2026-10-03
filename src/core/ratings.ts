import { TEAM_ABBRS } from './teams';
import type { Game } from './types';
import { devigMoneylines, eloWinProb, probToEloDiff, spreadToWinProb } from './probability';

export const ELO_MEAN = 1500;
export const HOME_FIELD_ELO = 48;
const K = 20;
/** Fraction of each team's rating carried over between seasons. */
const CARRYOVER = 2 / 3;

export type Ratings = Record<string, number>;

function initialRatings(): Ratings {
  return Object.fromEntries(TEAM_ABBRS.map((t) => [t, ELO_MEAN]));
}

function byKickoff(a: Game, b: Game) {
  return a.week - b.week || a.kickoff.localeCompare(b.kickoff);
}

/** Run Elo with a margin-of-victory multiplier (FiveThirtyEight style) over completed games. */
export function runElo(games: Game[], start: Ratings = initialRatings()): Ratings {
  const r: Ratings = { ...start };
  for (const g of [...games].filter((g) => g.status === 'post').sort(byKickoff)) {
    if (g.homeScore == null || g.awayScore == null) continue;
    const rh = r[g.home] ?? ELO_MEAN;
    const ra = r[g.away] ?? ELO_MEAN;
    const diff = rh - ra + (g.neutral ? 0 : HOME_FIELD_ELO);
    const expected = eloWinProb(diff);
    const margin = g.homeScore - g.awayScore;
    const actual = margin > 0 ? 1 : margin < 0 ? 0 : 0.5;
    const winnerDiff = margin >= 0 ? diff : -diff;
    const movMult = Math.log(Math.abs(margin) + 1) * (2.2 / (winnerDiff * 0.001 + 2.2));
    const delta = K * Math.max(movMult, 0.5) * (actual - expected);
    r[g.home] = rh + delta;
    r[g.away] = ra - delta;
  }
  return r;
}

export function regressToMean(r: Ratings, carry = CARRYOVER): Ratings {
  return Object.fromEntries(Object.entries(r).map(([t, v]) => [t, ELO_MEAN + (v - ELO_MEAN) * carry]));
}

/** Home win probability implied by market odds, if any. */
export function marketHomeProb(g: Game): { p: number; source: 'moneyline' | 'spread' } | undefined {
  const o = g.odds;
  if (!o) return undefined;
  if (o.homeWinProb != null && o.homeWinProb > 0 && o.homeWinProb < 1) return { p: o.homeWinProb, source: 'moneyline' };
  if (o.homeMoneyline != null && o.awayMoneyline != null && o.homeMoneyline !== 0 && o.awayMoneyline !== 0) {
    return { p: devigMoneylines(o.homeMoneyline, o.awayMoneyline), source: 'moneyline' };
  }
  if (o.homeSpread != null) return { p: spreadToWinProb(o.homeSpread), source: 'spread' };
  return undefined;
}

/**
 * Blend Elo with the betting market: find ratings that best explain every
 * available line while staying close to Elo (ridge regression toward Elo).
 * Markets react to injuries, QB changes etc. that Elo can't see, so this
 * lets current lines inform projections for weeks that don't have lines yet.
 */
export function blendWithMarket(elo: Ratings, upcoming: Game[], marketWeight = 1.5): Ratings {
  const lines = upcoming
    .filter((g) => g.status === 'pre')
    .map((g) => ({ g, m: marketHomeProb(g) }))
    .filter((x): x is { g: Game; m: NonNullable<ReturnType<typeof marketHomeProb>> } => !!x.m)
    .map(({ g, m }) => ({ home: g.home, away: g.away, hfa: g.neutral ? 0 : HOME_FIELD_ELO, target: probToEloDiff(m.p) }));
  if (!lines.length) return { ...elo };

  // Minimise  w * Σ (r_h - r_a + hfa - target)^2 + Σ (r_t - elo_t)^2  by Gauss-Seidel.
  const r: Ratings = { ...elo };
  const teams = Object.keys(r);
  for (let iter = 0; iter < 200; iter++) {
    let maxChange = 0;
    for (const t of teams) {
      let num = elo[t];
      let den = 1;
      for (const l of lines) {
        if (l.home === t) {
          num += marketWeight * (l.target - l.hfa + r[l.away]);
          den += marketWeight;
        } else if (l.away === t) {
          num += marketWeight * (r[l.home] + l.hfa - l.target);
          den += marketWeight;
        }
      }
      const next = num / den;
      maxChange = Math.max(maxChange, Math.abs(next - r[t]));
      r[t] = next;
    }
    if (maxChange < 0.01) break;
  }
  return r;
}

export function buildRatings(currentGames: Game[], priorGames: Game[]): Ratings {
  const seed = priorGames.length ? regressToMean(runElo(priorGames)) : initialRatings();
  const elo = runElo(currentGames, seed);
  return blendWithMarket(elo, currentGames);
}
