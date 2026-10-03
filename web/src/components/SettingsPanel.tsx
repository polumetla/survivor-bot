import { useState } from 'react';
import type { RecommendSettings, Strategy } from '../../../src/core/types';
import type { SeasonResponse } from '../api';

interface Props {
  settings: RecommendSettings;
  setSettings: (fn: (s: RecommendSettings) => RecommendSettings) => void;
  week: number;
  season?: SeasonResponse;
}

const STRATEGIES: Array<{ id: Strategy; label: string; hint: string }> = [
  { id: 'survival', label: 'Survival', hint: 'Maximise the chance this entry survives the planned weeks.' },
  { id: 'balanced', label: 'Balanced', hint: 'Mostly survival, with a nudge toward less popular picks.' },
  { id: 'contrarian', label: 'Contrarian', hint: 'Lean into leverage: fade chalk to win big pools outright.' },
];

export function SettingsPanel({ settings, setSettings, week, season }: Props) {
  const [showPop, setShowPop] = useState(false);
  const set = <K extends keyof RecommendSettings>(k: K, v: RecommendSettings[K]) => setSettings((s) => ({ ...s, [k]: v }));
  const weekProbs = season?.probs[week] ?? {};
  const pickable = Object.values(weekProbs)
    .filter((p) => p.pickable)
    .sort((a, b) => b.winProb - a.winProb);
  const doubleThisWeek = (settings.picksPerWeek?.[week] ?? 1) > 1;

  return (
    <div className="card">
      <h2>Strategy</h2>
      <div className="segmented full" role="group" aria-label="Strategy">
        {STRATEGIES.map((s) => (
          <button key={s.id} className={settings.strategy === s.id ? 'active' : ''} onClick={() => set('strategy', s.id)} title={s.hint}>
            {s.label}
          </button>
        ))}
      </div>
      <p className="muted small">{STRATEGIES.find((s) => s.id === settings.strategy)?.hint}</p>

      <label className="field">
        <span>
          Future weeks weight <strong>{settings.futureDiscount.toFixed(2)}</strong>
        </span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.futureDiscount}
          onChange={(e) => set('futureDiscount', Number(e.target.value))}
        />
        <small className="muted">0 = only this week matters · 1 = every future week counts fully</small>
      </label>

      <label className="field">
        <span>
          Plan ahead <strong>{settings.horizon}</strong> weeks
        </span>
        <input type="range" min={1} max={18} step={1} value={settings.horizon} onChange={(e) => set('horizon', Number(e.target.value))} />
      </label>

      <label className="field">
        <span>
          Diversify across my entries <strong>{settings.diversify.toFixed(1)}</strong>
        </span>
        <input type="range" min={0} max={3} step={0.1} value={settings.diversify} onChange={(e) => set('diversify', Number(e.target.value))} />
      </label>

      <label className="check">
        <input
          type="checkbox"
          checked={doubleThisWeek}
          onChange={(e) => set('picksPerWeek', { ...settings.picksPerWeek, [week]: e.target.checked ? 2 : 1 })}
        />
        Week {week} requires two picks
      </label>

      <button className="btn ghost full" onClick={() => setShowPop((v) => !v)} aria-expanded={showPop}>
        {showPop ? 'Hide' : 'Set'} pick popularity (week {week})
      </button>
      {showPop && (
        <div className="pop-editor">
          <p className="muted small">
            Enter the share of your pool on each team (e.g. from Splash's public pick %). Leave blank to use the estimate.
          </p>
          {pickable.map((p) => (
            <label key={p.team} className="pop-row">
              <span>
                {p.team} <small className="muted">{Math.round(p.winProb * 100)}%</small>
              </span>
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                placeholder="%"
                value={settings.popularity?.[p.team] ?? ''}
                onChange={(e) => {
                  const next = { ...settings.popularity };
                  if (e.target.value === '') delete next[p.team];
                  else next[p.team] = Number(e.target.value);
                  set('popularity', next);
                }}
              />
            </label>
          ))}
          {settings.popularity && Object.keys(settings.popularity).length > 0 && (
            <button className="btn small ghost" onClick={() => set('popularity', {})}>
              Clear popularity
            </button>
          )}
        </div>
      )}
    </div>
  );
}
