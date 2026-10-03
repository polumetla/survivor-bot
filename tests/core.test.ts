import { describe, expect, it } from 'vitest';
import { solveAssignment } from '../src/core/hungarian';
import { solveForced, solvePlan, type PlanInput } from '../src/core/planner';
import { devigMoneylines, eloWinProb, probToEloDiff, spreadToWinProb } from '../src/core/probability';
import { blendWithMarket, runElo } from '../src/core/ratings';
import { recommendAll, recommendForEntry } from '../src/core/recommend';
import { fieldSurvivalIfWins } from '../src/core/pool';
import { findTeamsInText, resolveTeam } from '../src/core/teams';
import { DEFAULT_SETTINGS, type Entry, type Game, type ProbTable } from '../src/core/types';
import { analyze } from '../src/core/engine';
import { demoSeason } from '../src/data/demo';

describe('probability', () => {
  it('devigs moneylines', () => {
    expect(devigMoneylines(-110, -110)).toBeCloseTo(0.5, 6);
    const p = devigMoneylines(-200, 170);
    expect(p).toBeGreaterThan(0.62);
    expect(p).toBeLessThan(0.66);
  });
  it('converts spreads', () => {
    expect(spreadToWinProb(0)).toBeCloseTo(0.5, 5);
    expect(spreadToWinProb(-7)).toBeGreaterThan(0.69);
    expect(spreadToWinProb(-7)).toBeLessThan(0.71);
    expect(spreadToWinProb(7) + spreadToWinProb(-7)).toBeCloseTo(1, 5);
  });
  it('round-trips elo diffs', () => {
    expect(eloWinProb(probToEloDiff(0.73))).toBeCloseTo(0.73, 6);
  });
});

describe('hungarian', () => {
  function brute(cost: number[][]): number {
    const n = cost.length, m = cost[0].length;
    let best = Infinity;
    const used = new Array(m).fill(false);
    const rec = (i: number, acc: number) => {
      if (i === n) return void (best = Math.min(best, acc));
      for (let j = 0; j < m; j++) if (!used[j]) { used[j] = true; rec(i + 1, acc + cost[i][j]); used[j] = false; }
    };
    rec(0, 0);
    return best;
  }
  it('matches brute force on random rectangular matrices', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let trial = 0; trial < 50; trial++) {
      const n = 1 + Math.floor(rand() * 5), m = n + Math.floor(rand() * 3);
      const cost = Array.from({ length: n }, () => Array.from({ length: m }, () => Math.round(rand() * 100)));
      const a = solveAssignment(cost);
      expect(new Set(a).size).toBe(n);
      expect(a.reduce((s, j, i) => s + cost[i][j], 0)).toBe(brute(cost));
    }
  });
});

function table(rows: Record<number, Record<string, [string, number]>>): ProbTable {
  const t: ProbTable = {};
  for (const [w, teams] of Object.entries(rows)) {
    t[Number(w)] = {};
    for (const [team, [opp, p]] of Object.entries(teams)) {
      t[Number(w)][team] = { team, opponent: opp, home: true, winProb: p, source: 'model', gameId: `${w}-${team}`, pickable: true };
    }
  }
  return t;
}

describe('planner', () => {
  // A is great in week 2, B is decent both weeks: optimal is B in week 1, A in week 2.
  const probs = table({
    1: { A: ['X', 0.8], B: ['Y', 0.75], C: ['Z', 0.6] },
    2: { A: ['X', 0.95], B: ['Y', 0.7], C: ['Z', 0.55] },
  });
  const base: PlanInput = { probs, weeks: [1, 2], available: ['A', 'B', 'C'], picksPerWeek: () => 1, discount: 1, baseWeek: 1 };

  it('saves a team for the week it is most valuable', () => {
    const r = solvePlan(base);
    expect(r.plan.map((p) => p.team)).toEqual(['B', 'A']);
    expect(r.survival).toBeCloseTo(0.75 * 0.95);
  });
  it('greedy pick is worse when forced', () => {
    const f = solveForced(base, 1, 'A');
    expect(f.survival).toBeCloseTo(0.8 * 0.7);
  });
  it('handles bye weeks (team absent) and double-pick weeks', () => {
    const p = table({ 1: { A: ['X', 0.9], B: ['Y', 0.8], C: ['Z', 0.7] }, 2: { B: ['Y', 0.9], C: ['Z', 0.6] } });
    const r = solvePlan({ ...base, probs: p, picksPerWeek: (w) => (w === 1 ? 2 : 1) });
    expect(r.feasible).toBe(true);
    expect(r.plan.filter((x) => x.week === 1).map((x) => x.team).sort()).toEqual(['A', 'C']);
    expect(r.plan.find((x) => x.week === 2)?.team).toBe('B');
  });
});

describe('ratings', () => {
  const g = (week: number, home: string, away: string, hs: number, as: number): Game => ({
    id: `${week}${home}`, season: 2026, week, kickoff: `2026-09-${10 + week}T17:00:00Z`, home, away, neutral: false, status: 'post', homeScore: hs, awayScore: as,
  });
  it('winners gain rating', () => {
    const r = runElo([g(1, 'KC', 'LV', 31, 10)]);
    expect(r.KC).toBeGreaterThan(1500);
    expect(r.LV).toBeLessThan(1500);
    expect(r.KC + r.LV).toBeCloseTo(3000, 6);
  });
  it('market lines pull ratings toward the implied difference', () => {
    const upcoming: Game = { id: 'x', season: 2026, week: 2, kickoff: '2026-09-20T17:00:00Z', home: 'NYJ', away: 'BUF', neutral: false, status: 'pre', odds: { homeMoneyline: 300, awayMoneyline: -380 } };
    const base = runElo([]);
    const r = blendWithMarket(base, [upcoming]);
    expect(r.BUF).toBeGreaterThan(r.NYJ);
  });
});

describe('pool', () => {
  it('field survival excludes the opponent', () => {
    const wk = table({ 1: { A: ['B', 0.8], B: ['A', 0.2], C: ['D', 0.6] } })[1];
    expect(fieldSurvivalIfWins('A', wk, { A: 0.5, B: 0.2, C: 0.3 })).toBeCloseTo(0.5 + 0.3 * 0.6);
  });
});

describe('recommend', () => {
  const data = demoSeason(5);
  const { probs } = analyze(data);
  const ctx = { probs, week: 5, lastWeek: 18, settings: DEFAULT_SETTINGS };
  const entry = (picks: string[]): Entry => ({ id: 'e', name: 'E', alive: true, picks: picks.map((team, i) => ({ week: i + 1, team })) });

  it('never recommends a used team', () => {
    const r1 = recommendForEntry(entry([]), ctx);
    const top = r1.recommended[0];
    const r2 = recommendForEntry(entry([top]), ctx);
    expect(r2.candidates.some((c) => c.team === top)).toBe(false);
    expect(r2.recommended[0]).not.toBe(top);
    for (const p of r2.bestPlan) expect(p.team).not.toBe(top);
  });
  it('season plan uses each team at most once', () => {
    const r = recommendForEntry(entry([]), { ...ctx, settings: { ...DEFAULT_SETTINGS, horizon: 14 } });
    expect(new Set(r.bestPlan.map((p) => p.team)).size).toBe(r.bestPlan.length);
    expect(r.bestPlan.length).toBe(14);
  });
  it('survival strategy with no future weighting picks the biggest favourite', () => {
    const r = recommendForEntry(entry([]), { ...ctx, settings: { ...DEFAULT_SETTINGS, strategy: 'survival', futureDiscount: 0 } });
    const fav = Object.values(probs[5]).sort((a, b) => b.winProb - a.winProb)[0];
    expect(r.recommended[0]).toBe(fav.team);
  });
  it('double-pick weeks never take both sides of a game', () => {
    const r = recommendForEntry(entry([]), { ...ctx, settings: { ...DEFAULT_SETTINGS, picksPerWeek: { 5: 2 } } });
    expect(r.recommended).toHaveLength(2);
    expect(probs[5][r.recommended[0]].opponent).not.toBe(r.recommended[1]);
  });
  it('diversify spreads identical entries across teams', () => {
    const recs = recommendAll([entry([]), { ...entry([]), id: 'f' }], { ...ctx, settings: { ...DEFAULT_SETTINGS, diversify: 10 } });
    expect(recs[0].recommended[0]).not.toBe(recs[1].recommended[0]);
  });
});

describe('teams', () => {
  it('resolves aliases', () => {
    expect(resolveTeam('Kansas City Chiefs')).toBe('KC');
    expect(resolveTeam('WAS')).toBe('WSH');
    expect(resolveTeam('niners')).toBe('SF');
    expect(resolveTeam('New York')).toBeUndefined();
  });
  it('finds teams in free text', () => {
    expect(findTeamsInText('Week 3: Philadelphia Eagles @ NYG (W)')).toEqual(['PHI', 'NYG']);
    expect(findTeamsInText('Los Angeles Rams vs Chargers')).toEqual(['LAR', 'LAC']);
    expect(findTeamsInText('no teams here, just words')).toEqual([]);
  });
});
