import { describe, expect, it } from 'vitest';
import { csvAdapter, genericTextAdapter, jsonAdapter, splashAdapter } from '../src/integrations';

describe('Splash / text import', () => {
  it('parses entry blocks with weeks and results', () => {
    const r = splashAdapter.parse(`Entry: Big Dog #1
Week 1  Philadelphia Eagles  W
Week 2  Baltimore Ravens  W
Week 3  DET  Pending

Entry: Longshot
Week 1  Chiefs  L`);
    expect(r.entries).toHaveLength(2);
    expect(r.entries[0]).toMatchObject({ name: 'Big Dog #1', alive: true, platform: 'splash' });
    expect(r.entries[0].picks).toEqual([
      { week: 1, team: 'PHI', result: 'W' },
      { week: 2, team: 'BAL', result: 'W' },
      { week: 3, team: 'DET', result: 'pending' },
    ]);
    expect(r.entries[1]).toMatchObject({ name: 'Longshot', alive: false });
  });
  it('handles headers, leading week numbers and comma lists', () => {
    const r = genericTextAdapter.parse(`Main entry
Wk 1: Bills
2. 49ers (L)

Second entry
KC, DET, BAL`);
    expect(r.entries.map((e) => e.name)).toEqual(['Main entry', 'Second entry']);
    expect(r.entries[0].picks.map((p) => [p.week, p.team, p.result])).toEqual([[1, 'BUF', undefined], [2, 'SF', 'L']]);
    expect(r.entries[0].alive).toBe(false);
    expect(r.entries[1].picks.map((p) => [p.week, p.team])).toEqual([[1, 'KC'], [2, 'DET'], [3, 'BAL']]);
  });
  it('warns when a matchup line is ambiguous', () => {
    const r = genericTextAdapter.parse('Week 4: Rams @ 49ers');
    expect(r.entries[0].picks[0].team).toBe('LAR');
    expect(r.warnings.join(' ')).toMatch(/assumed/);
  });
});

describe('CSV import/export', () => {
  it('parses rows and groups by entry', () => {
    const r = csvAdapter.parse('entry,week,team,result\nMain,1,PHI,W\nMain,2,"Baltimore Ravens",W\nBackup,1,KC,L\nBackup,2,XYZ,');
    expect(r.entries).toHaveLength(2);
    expect(r.entries[0].picks.map((p) => p.team)).toEqual(['PHI', 'BAL']);
    expect(r.entries[1].alive).toBe(false);
    expect(r.warnings).toHaveLength(1);
  });
  it('exports recommendations', () => {
    const text = csvAdapter.exportPicks([{ entryId: 'a', entryName: 'Main, #1', week: 5, picksRequired: 1, recommended: ['MIN'], candidates: [], bestPlan: [], notes: [] }]);
    expect(text).toBe('entry,week,team\n"Main, #1",5,MIN');
  });
});

describe('JSON import', () => {
  it('accepts usedTeams shorthand', () => {
    const r = jsonAdapter.parse('[{"name":"A","usedTeams":["chiefs","WAS"]}]');
    expect(r.entries[0].picks).toEqual([{ week: 1, team: 'KC' }, { week: 2, team: 'WSH' }]);
  });
});
