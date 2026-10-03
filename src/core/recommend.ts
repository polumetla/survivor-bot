import { solveForced, solvePlan, type PlanInput } from './planner';
import { estimatePopularity, leverage, normalizeShares } from './pool';
import { TEAM_ABBRS } from './teams';
import type { CandidateScore, Entry, EntryRecommendation, ProbTable, RecommendSettings, Strategy } from './types';

/** Weight on log(leverage) in the composite score. */
export const STRATEGY_LAMBDA: Record<Strategy, number> = {
  survival: 0,
  balanced: 0.35,
  contrarian: 0.8,
};

/** Score penalty per other entry of yours already recommended the same team. */
const DIVERSIFY_STEP = 0.06;

export interface RecommendContext {
  probs: ProbTable;
  week: number;
  lastWeek: number;
  settings: RecommendSettings;
}

export function usedTeams(entry: Entry): Set<string> {
  return new Set(entry.picks.map((p) => p.team));
}

function popularityFor(ctx: RecommendContext) {
  const week = ctx.probs[ctx.week] ?? {};
  const given = ctx.settings.popularity && Object.keys(ctx.settings.popularity).length > 0;
  if (given) {
    const scaled = Object.fromEntries(
      Object.entries(ctx.settings.popularity!).map(([t, v]) => [t, v > 1 ? v / 100 : v]),
    );
    return { shares: normalizeShares(scaled), estimated: false };
  }
  return { shares: estimatePopularity(week, ctx.week), estimated: true };
}

export function recommendForEntry(
  entry: Entry,
  ctx: RecommendContext,
  alreadyRecommended: Record<string, number> = {},
): EntryRecommendation {
  const { probs, week, settings } = ctx;
  const notes: string[] = [];
  const picksRequired = settings.picksPerWeek?.[week] ?? 1;
  const used = usedTeams(entry);
  const excluded = new Set(settings.excludeTeams ?? []);
  const available = TEAM_ABBRS.filter((t) => !used.has(t) && !excluded.has(t));
  const horizonEnd = Math.min(ctx.lastWeek, week + Math.max(1, settings.horizon) - 1);
  const weeks: number[] = [];
  for (let w = week; w <= horizonEnd; w++) weeks.push(w);

  const base: PlanInput = {
    probs,
    weeks,
    available,
    picksPerWeek: (w) => settings.picksPerWeek?.[w] ?? 1,
    discount: Math.min(Math.max(settings.futureDiscount, 0), 1),
    baseWeek: week,
  };

  if (!entry.alive) notes.push('This entry is marked eliminated; recommendations are for reference only.');

  const bestPlan = solvePlan(base);
  const futureInput: PlanInput = { ...base, weeks: weeks.filter((w) => w !== week) };
  const futureAll = solvePlan(futureInput);
  const weekProbs = probs[week] ?? {};
  const { shares, estimated } = popularityFor(ctx);
  if (estimated) notes.push('Pick popularity is estimated from win probabilities; enter real pick % for sharper EV.');
  const lambda = STRATEGY_LAMBDA[settings.strategy] ?? 0;

  const candidates: CandidateScore[] = [];
  for (const team of available) {
    const info = weekProbs[team];
    if (!info || !info.pickable) continue;
    const forced = solveForced(base, week, team);
    const futureWithout = solvePlan({ ...futureInput, available: available.filter((t) => t !== team) });
    const fvLog = futureAll.weightedLog - futureWithout.weightedLog;
    const lev = leverage(team, weekProbs, shares);
    const penalty = settings.diversify * DIVERSIFY_STEP * (alreadyRecommended[team] ?? 0);
    candidates.push({
      team,
      opponent: info.opponent,
      home: info.home,
      winProb: info.winProb,
      probSource: info.source,
      popularity: shares[team] ?? 0,
      popularityEstimated: estimated,
      pathSurvival: forced.survival,
      futureValueCost: Math.max(0, 1 - Math.exp(-fvLog)),
      leverage: lev,
      score: forced.weightedLog + lambda * Math.log(lev) - penalty,
      plan: forced.plan,
    });
  }
  candidates.sort((a, b) => b.score - a.score);

  const recommended: string[] = [];
  for (const c of candidates) {
    if (recommended.length >= picksRequired) break;
    // Never take both sides of one game in a multi-pick week.
    if (recommended.some((r) => weekProbs[r]?.opponent === c.team)) continue;
    recommended.push(c.team);
  }
  if (!candidates.length) notes.push('No pickable teams remain this week for this entry.');
  else if (recommended.length < picksRequired) notes.push(`Only ${recommended.length} of ${picksRequired} required picks could be filled.`);
  if (bestPlan.plan.length < weeks.reduce((s, w) => s + base.picksPerWeek(w), 0)) {
    notes.push('Not enough unused teams to cover the full planning horizon.');
  }

  return {
    entryId: entry.id,
    entryName: entry.name,
    week,
    picksRequired,
    recommended,
    candidates,
    bestPlan: bestPlan.plan,
    notes,
  };
}

/** Recommend for several entries, optionally steering them apart to diversify risk. */
export function recommendAll(entries: Entry[], ctx: RecommendContext): EntryRecommendation[] {
  const counts: Record<string, number> = {};
  return entries.map((e) => {
    const rec = recommendForEntry(e, ctx, counts);
    if (e.alive) for (const t of rec.recommended) counts[t] = (counts[t] ?? 0) + 1;
    return rec;
  });
}
