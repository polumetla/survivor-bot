import { solveAssignment } from './hungarian';
import type { ProbTable } from './types';

const INFEASIBLE = 1e6;

export interface PlanInput {
  probs: ProbTable;
  weeks: number[];
  available: string[];
  picksPerWeek: (week: number) => number;
  /** Per-week weight multiplier; weight for week index i is discount^i. */
  discount: number;
  /** First week of the plan, used as index 0 for discounting. */
  baseWeek: number;
}

export interface PlanResult {
  plan: Array<{ week: number; team: string; winProb: number }>;
  /** Σ weight_w · log p over the plan (higher is better). */
  weightedLog: number;
  /** Π p over the plan. */
  survival: number;
  feasible: boolean;
}

function weight(week: number, input: PlanInput) {
  return Math.pow(input.discount, week - input.baseWeek);
}

/**
 * Choose distinct teams for every pick slot in the given weeks maximising the
 * (discounted) log survival probability — an assignment problem solved exactly.
 */
export function solvePlan(input: PlanInput): PlanResult {
  const slots: number[] = [];
  for (const w of input.weeks) for (let k = 0; k < input.picksPerWeek(w); k++) slots.push(w);
  // Not enough teams left to cover the whole horizon: plan as far as possible.
  while (slots.length > input.available.length) slots.pop();
  if (!slots.length) return { plan: [], weightedLog: 0, survival: 1, feasible: true };

  const cost = slots.map((w) =>
    input.available.map((t) => {
      const info = input.probs[w]?.[t];
      if (!info || !info.pickable) return INFEASIBLE;
      return -weight(w, input) * Math.log(info.winProb);
    }),
  );
  const assignment = solveAssignment(cost);

  const plan: PlanResult['plan'] = [];
  let weightedLog = 0;
  let survival = 1;
  let feasible = true;
  assignment.forEach((col, i) => {
    const w = slots[i];
    const team = input.available[col];
    const info = input.probs[w]?.[team];
    if (!info || !info.pickable) {
      feasible = false;
      survival = 0;
      return;
    }
    plan.push({ week: w, team, winProb: info.winProb });
    weightedLog += weight(w, input) * Math.log(info.winProb);
    survival *= info.winProb;
  });
  plan.sort((a, b) => a.week - b.week || b.winProb - a.winProb);
  return { plan, weightedLog: feasible ? weightedLog : -INFEASIBLE, survival, feasible };
}

/** Best plan given that `team` is used in `week` (one of that week's slots). */
export function solveForced(input: PlanInput, week: number, team: string): PlanResult {
  const info = input.probs[week]?.[team];
  if (!info || !info.pickable) return { plan: [], weightedLog: -INFEASIBLE, survival: 0, feasible: false };
  const rest = solvePlan({
    ...input,
    available: input.available.filter((t) => t !== team),
    picksPerWeek: (w) => (w === week ? input.picksPerWeek(w) - 1 : input.picksPerWeek(w)),
  });
  const plan = [{ week, team, winProb: info.winProb }, ...rest.plan].sort(
    (a, b) => a.week - b.week || b.winProb - a.winProb,
  );
  return {
    plan,
    weightedLog: weight(week, input) * Math.log(info.winProb) + rest.weightedLog,
    survival: info.winProb * rest.survival,
    feasible: rest.feasible,
  };
}
