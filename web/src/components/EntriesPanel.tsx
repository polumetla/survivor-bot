import { useState } from 'react';
import { TEAMS } from '../../../src/core/teams';
import type { Entry } from '../../../src/core/types';

interface Props {
  entries: Entry[];
  setEntries: (fn: (es: Entry[]) => Entry[]) => void;
  onImport: () => void;
  week: number;
}

export function EntriesPanel({ entries, setEntries, onImport, week }: Props) {
  const [editing, setEditing] = useState<string | null>(entries[0]?.id ?? null);

  const update = (id: string, fn: (e: Entry) => Entry) => setEntries((es) => es.map((e) => (e.id === id ? fn(e) : e)));

  const toggleTeam = (entry: Entry, team: string) =>
    update(entry.id, (e) => {
      if (e.picks.some((p) => p.team === team)) return { ...e, picks: e.picks.filter((p) => p.team !== team) };
      // Assign the earliest week before the current one that has no pick yet.
      const taken = new Set(e.picks.map((p) => p.week));
      let w = 1;
      while (taken.has(w) && w < week) w++;
      return { ...e, picks: [...e.picks, { week: taken.has(w) ? Math.max(...taken) + 1 : w, team }].sort((a, b) => a.week - b.week) };
    });

  const add = () => {
    const id = `entry-${Date.now().toString(36)}`;
    setEntries((es) => [...es, { id, name: `Entry ${es.length + 1}`, picks: [], alive: true, platform: 'manual' }]);
    setEditing(id);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ entries }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'survivor-entries.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2>Entries</h2>
        <div className="row gap-s">
          <button className="btn small" onClick={onImport}>
            Import
          </button>
          <button className="btn small ghost" onClick={exportJson} title="Download a JSON backup">
            Backup
          </button>
        </div>
      </div>
      <ul className="entry-list">
        {entries.map((e) => {
          const used = new Set(e.picks.map((p) => p.team));
          const open = editing === e.id;
          return (
            <li key={e.id} className={`entry ${e.alive ? '' : 'dead'}`}>
              <div className="entry-row">
                <button className="entry-toggle" onClick={() => setEditing(open ? null : e.id)} aria-expanded={open}>
                  <span className="caret">{open ? '▾' : '▸'}</span>
                  <span className="entry-name">{e.name}</span>
                  {e.platform && e.platform !== 'manual' && <span className="chip">{e.platform}</span>}
                </button>
                <span className="muted small">{used.size} used</span>
              </div>
              {open && (
                <div className="entry-edit">
                  <div className="row gap-s">
                    <input
                      className="grow"
                      value={e.name}
                      onChange={(ev) => update(e.id, (x) => ({ ...x, name: ev.target.value }))}
                      aria-label="Entry name"
                    />
                    <label className="check">
                      <input type="checkbox" checked={e.alive} onChange={(ev) => update(e.id, (x) => ({ ...x, alive: ev.target.checked }))} />
                      Alive
                    </label>
                    <button
                      className="btn small danger"
                      onClick={() => setEntries((es) => es.filter((x) => x.id !== e.id))}
                      aria-label={`Delete ${e.name}`}
                    >
                      ✕
                    </button>
                  </div>
                  <p className="muted small">Tap teams you've already used:</p>
                  <div className="team-grid">
                    {TEAMS.map((t) => {
                      const pick = e.picks.find((p) => p.team === t.abbr);
                      return (
                        <button
                          key={t.abbr}
                          className={`team-chip ${pick ? 'used' : ''} ${pick?.result === 'L' ? 'lost' : ''}`}
                          onClick={() => toggleTeam(e, t.abbr)}
                          title={`${t.city} ${t.name}${pick ? ` — week ${pick.week}` : ''}`}
                        >
                          {t.abbr}
                          {pick && <small>W{pick.week}</small>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <button className="btn ghost full" onClick={add}>
        + Add entry
      </button>
    </div>
  );
}
