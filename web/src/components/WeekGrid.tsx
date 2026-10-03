import { useMemo, useState } from 'react';
import { TEAMS } from '../../../src/core/teams';
import type { Entry, EntryRecommendation } from '../../../src/core/types';
import type { SeasonResponse } from '../api';

interface Props {
  season: SeasonResponse;
  entries: Entry[];
  recs: EntryRecommendation[];
}

/** Map a win probability to a background colour (red → neutral → green). */
function heat(p: number): string {
  const x = Math.max(0, Math.min(1, (p - 0.3) / 0.6));
  const hue = x * 130;
  const alpha = 0.15 + Math.abs(x - 0.5) * 1.1;
  return `hsla(${hue}, 65%, 45%, ${alpha.toFixed(2)})`;
}

export function WeekGrid({ season, entries, recs }: Props) {
  const [entryId, setEntryId] = useState(entries[0]?.id ?? '');
  const [sort, setSort] = useState<'name' | 'value'>('value');
  const entry = entries.find((e) => e.id === entryId) ?? entries[0];
  const used = new Set(entry?.picks.map((p) => p.team) ?? []);
  const plan = recs.find((r) => r.entryId === entry?.id)?.bestPlan ?? [];
  const planned = new Set(plan.map((p) => `${p.week}:${p.team}`));

  const weeks = useMemo(
    () => Object.keys(season.probs).map(Number).filter((w) => w >= season.currentWeek).sort((a, b) => a - b),
    [season],
  );

  const teams = useMemo(() => {
    const list = TEAMS.map((t) => t.abbr);
    if (sort === 'name') return list.sort();
    // Sort by number of remaining weeks with >= 70% win chance, then by best week.
    const value = (t: string) =>
      weeks.reduce((s, w) => {
        const p = season.probs[w]?.[t]?.winProb ?? 0;
        return s + (p >= 0.7 ? 1 : 0) + p / 100;
      }, 0);
    return list.sort((a, b) => value(b) - value(a));
  }, [sort, weeks, season]);

  return (
    <div className="card">
      <div className="card-head wrap">
        <h2>Season grid</h2>
        <div className="row gap-s wrap">
          <label className="field inline">
            <span>Entry</span>
            <select value={entry?.id} onChange={(e) => setEntryId(e.target.value)}>
              {entries.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <div className="segmented" role="group" aria-label="Sort teams">
            <button className={sort === 'value' ? 'active' : ''} onClick={() => setSort('value')}>
              By value
            </button>
            <button className={sort === 'name' ? 'active' : ''} onClick={() => setSort('name')}>
              A–Z
            </button>
          </div>
        </div>
      </div>
      <p className="muted small">
        Win probability by team and week. <span className="legend planned">Outlined</span> cells are this entry's optimal path; faded rows
        are teams already used. Italic values come from the rating model (no betting line yet).
      </p>
      <div className="grid-wrap">
        <table className="heat">
          <thead>
            <tr>
              <th className="sticky">Team</th>
              {weeks.map((w) => (
                <th key={w}>W{w}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t} className={used.has(t) ? 'used' : ''}>
                <th className="sticky">{t}</th>
                {weeks.map((w) => {
                  const info = season.probs[w]?.[t];
                  if (!info) return <td key={w} className="bye">BYE</td>;
                  return (
                    <td
                      key={w}
                      style={{ background: heat(info.winProb) }}
                      className={`${planned.has(`${w}:${t}`) ? 'planned' : ''} ${info.source === 'model' ? 'model' : ''} ${info.pickable ? '' : 'locked'}`}
                      title={`${t} ${info.home ? 'vs' : '@'} ${info.opponent}: ${(info.winProb * 100).toFixed(1)}% (${info.source})`}
                    >
                      <span className="opp">
                        {info.home ? '' : '@'}
                        {info.opponent}
                      </span>
                      {Math.round(info.winProb * 100)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
