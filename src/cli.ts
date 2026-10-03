import { parseArgs } from 'node:util';
import { recommend } from './core/engine';
import { resolveTeam, teamLabel } from './core/teams';
import type { Entry, Strategy } from './core/types';
import { loadSeasonData } from './data/provider';

const { values } = parseArgs({
  options: {
    used: { type: 'string', short: 'u', default: '' },
    week: { type: 'string', short: 'w' },
    strategy: { type: 'string', short: 's', default: 'balanced' },
    horizon: { type: 'string', default: '8' },
    discount: { type: 'string', default: '0.85' },
    demo: { type: 'boolean', default: false },
    top: { type: 'string', default: '10' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(`Usage: npm run suggest -- [options]
  -u, --used KC,BUF,DET   teams already used
  -w, --week N            plan from week N (default: current week)
  -s, --strategy S        survival | balanced | contrarian (default balanced)
      --horizon N         weeks to plan ahead (default 8)
      --discount X        weight for each future week, 0..1 (default 0.85)
      --demo              use synthetic demo data
      --top N             candidates to show (default 10)`);
  process.exit(0);
}

const used = values.used
  .split(/[,\s]+/)
  .filter(Boolean)
  .map((t) => {
    const r = resolveTeam(t);
    if (!r) throw new Error(`Unknown team: ${t}`);
    return r;
  });

const data = await loadSeasonData({ source: values.demo ? 'demo' : undefined, week: values.week ? Number(values.week) : undefined });
for (const w of data.warnings) console.warn(`! ${w}`);

const entry: Entry = { id: 'cli', name: 'CLI entry', alive: true, picks: used.map((team, i) => ({ week: i + 1, team })) };
const { recommendations } = recommend(data, [entry], {
  strategy: values.strategy as Strategy,
  horizon: Number(values.horizon),
  futureDiscount: Number(values.discount),
});
const rec = recommendations[0];
const pct = (x: number) => `${(x * 100).toFixed(1)}%`.padStart(6);

console.log(`\n${data.season} NFL survivor — week ${rec.week} (${data.source} data, ${values.strategy} strategy)`);
console.log(`Recommended: ${rec.recommended.map(teamLabel).join(' + ') || 'none'}\n`);
console.log('Team  Opp      Win%   Pop%  Path%  FV cost  Score');
for (const c of rec.candidates.slice(0, Number(values.top))) {
  console.log(
    `${c.team.padEnd(5)} ${(c.home ? 'vs ' : '@ ') + c.opponent.padEnd(4)} ${pct(c.winProb)} ${pct(c.popularity)} ${pct(c.pathSurvival)} ${pct(c.futureValueCost)}  ${c.score.toFixed(3)}`,
  );
}
console.log('\nBest season path: ' + rec.bestPlan.map((p) => `W${p.week} ${p.team} (${Math.round(p.winProb * 100)}%)`).join(', '));
for (const n of rec.notes) console.log(`note: ${n}`);
