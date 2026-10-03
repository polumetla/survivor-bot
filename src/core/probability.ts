/** Historical standard deviation of NFL final margin vs the closing spread. */
export const SPREAD_SIGMA = 13.45;

export function moneylineToImplied(ml: number): number {
  return ml < 0 ? -ml / (-ml + 100) : 100 / (ml + 100);
}

/** Remove the bookmaker's vig from a two-way moneyline. Returns the home win probability. */
export function devigMoneylines(homeMl: number, awayMl: number): number {
  const h = moneylineToImplied(homeMl);
  const a = moneylineToImplied(awayMl);
  return h / (h + a);
}

/** Abramowitz–Stegun approximation of the standard normal CDF (error < 7.5e-8). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x > 0 ? 1 - p : p;
}

/** Win probability for a team given its spread (negative = favored). */
export function spreadToWinProb(spread: number): number {
  return normalCdf(-spread / SPREAD_SIGMA);
}

/** Elo-style logistic win probability from a rating difference (already including home field). */
export function eloWinProb(ratingDiff: number): number {
  return 1 / (1 + Math.pow(10, -ratingDiff / 400));
}

/** Inverse of eloWinProb: rating difference implied by a win probability. */
export function probToEloDiff(p: number): number {
  const q = Math.min(Math.max(p, 0.001), 0.999);
  return 400 * Math.log10(q / (1 - q));
}

export function clampProb(p: number): number {
  return Math.min(Math.max(p, 0.001), 0.999);
}
