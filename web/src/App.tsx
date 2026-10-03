import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Entry, EntryRecommendation, RecommendSettings } from '../../src/core/types';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { api, type SeasonResponse } from './api';
import { EntriesPanel } from './components/EntriesPanel';
import { ImportDialog } from './components/ImportDialog';
import { Recommendations } from './components/Recommendations';
import { SettingsPanel } from './components/SettingsPanel';
import { WeekGrid } from './components/WeekGrid';
import { usePersistentState } from './storage';

const STARTER: Entry[] = [{ id: 'entry-1', name: 'My entry', picks: [], alive: true, platform: 'manual' }];

type Tab = 'picks' | 'grid';

export function App() {
  const [source, setSource] = usePersistentState<'live' | 'demo'>('sb.source', 'live');
  const [entries, setEntries] = usePersistentState<Entry[]>('sb.entries', STARTER);
  const [settings, setSettings] = usePersistentState<RecommendSettings>('sb.settings', DEFAULT_SETTINGS);
  const [weekOverride, setWeekOverride] = useState<number | undefined>();
  const [season, setSeason] = useState<SeasonResponse>();
  const [recs, setRecs] = useState<EntryRecommendation[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [tab, setTab] = usePersistentState<Tab>('sb.tab', 'picks');

  useEffect(() => {
    setLoading(true);
    setError(undefined);
    api
      .season(source, weekOverride)
      .then(setSeason)
      .catch((e) => setError(String(e.message ?? e)))
      .finally(() => setLoading(false));
  }, [source, weekOverride]);

  useEffect(() => {
    if (!season) return;
    const t = setTimeout(() => {
      api
        .recommend(source, entries, settings, weekOverride)
        .then((r) => setRecs(r.recommendations))
        .catch((e) => setError(String(e.message ?? e)));
    }, 250);
    return () => clearTimeout(t);
  }, [season, entries, settings, source, weekOverride]);

  const week = season?.currentWeek ?? 1;
  const recordPick = useCallback(
    (entryId: string, team: string) =>
      setEntries((es) =>
        es.map((e) =>
          e.id !== entryId ? e : { ...e, picks: [...e.picks.filter((p) => p.week !== week), { week, team, result: 'pending' as const }] },
        ),
      ),
    [setEntries, week],
  );

  const activeEntries = useMemo(() => entries.filter((e) => e.alive), [entries]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            🏈
          </span>
          <div>
            <h1>Survivor Bot</h1>
            <p className="muted">NFL survivor pick predictor &amp; season planner</p>
          </div>
        </div>
        <div className="topbar-controls">
          {season && (
            <label className="field inline">
              <span>Week</span>
              <select value={weekOverride ?? ''} onChange={(e) => setWeekOverride(e.target.value ? Number(e.target.value) : undefined)}>
                <option value="">Current ({season.currentWeek})</option>
                {Array.from({ length: season.lastWeek }, (_, i) => i + 1).map((w) => (
                  <option key={w} value={w}>
                    Week {w}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="segmented" role="group" aria-label="Data source">
            {(['live', 'demo'] as const).map((s) => (
              <button key={s} className={source === s ? 'active' : ''} onClick={() => setSource(s)}>
                {s === 'live' ? 'Live data' : 'Demo'}
              </button>
            ))}
          </div>
        </div>
      </header>

      {season && (
        <div className="status-line">
          <span className={`badge ${season.source}`}>{season.source === 'live' ? 'LIVE' : 'DEMO'}</span>
          <span>
            {season.season} season · planning from <strong>week {week}</strong> · {activeEntries.length} active{' '}
            {activeEntries.length === 1 ? 'entry' : 'entries'}
          </span>
          {loading && <span className="muted">refreshing…</span>}
        </div>
      )}
      {season?.warnings.map((w) => (
        <div key={w} className="notice">
          {w}
        </div>
      ))}
      {error && <div className="notice error">{error}</div>}

      <main className="layout">
        <aside className="sidebar">
          <EntriesPanel entries={entries} setEntries={setEntries} onImport={() => setImportOpen(true)} week={week} />
          <SettingsPanel settings={settings} setSettings={setSettings} week={week} season={season} />
        </aside>
        <section className="content">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'picks'} className={tab === 'picks' ? 'active' : ''} onClick={() => setTab('picks')}>
              Recommendations
            </button>
            <button role="tab" aria-selected={tab === 'grid'} className={tab === 'grid' ? 'active' : ''} onClick={() => setTab('grid')}>
              Season grid
            </button>
          </div>
          {!season && !error && <div className="card muted">Loading schedule and odds…</div>}
          {season && tab === 'picks' && <Recommendations recs={recs} entries={entries} onUsePick={recordPick} />}
          {season && tab === 'grid' && <WeekGrid season={season} entries={entries} recs={recs} />}
        </section>
      </main>

      {importOpen && (
        <ImportDialog
          onClose={() => setImportOpen(false)}
          onImport={(imported, mode) => {
            setEntries((es) => (mode === 'replace' ? imported : [...es, ...imported]));
            setImportOpen(false);
          }}
          recs={recs}
        />
      )}

      <footer className="footer muted">
        Win probabilities come from no-vig betting lines when available and a market-calibrated Elo model otherwise. For entertainment;
        not betting advice.
      </footer>
    </div>
  );
}
