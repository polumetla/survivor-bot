import { useState } from 'react';
import { teamLabel } from '../../../src/core/teams';
import type { CandidateScore, Entry, EntryRecommendation } from '../../../src/core/types';

const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;

const SOURCE_LABEL: Record<string, string> = {
  moneyline: 'Moneyline (no-vig)',
  spread: 'Point spread',
  model: 'Elo model',
  override: 'Your override',
};

interface Props {
  recs: EntryRecommendation[];
  entries: Entry[];
  onUsePick: (entryId: string, team: string) => void;
}

export function Recommendations({ recs, entries, onUsePick }: Props) {
  if (!recs.length) return <div className="card muted">Add an entry to get recommendations.</div>;
  return (
    <div className="stack">
      {recs.map((r) => (
        <EntryCard key={r.entryId} rec={r} entry={entries.find((e) => e.id === r.entryId)} onUsePick={onUsePick} />
      ))}
    </div>
  );
}

function EntryCard({ rec, entry, onUsePick }: { rec: EntryRecommendation; entry?: Entry; onUsePick: Props['onUsePick'] }) {
  const [showAll, setShowAll] = useState(false);
  const top = rec.recommended.map((t) => rec.candidates.find((c) => c.team === t)).filter(Boolean) as CandidateScore[];
  const rows = showAll ? rec.candidates : rec.candidates.slice(0, 8);
  const best = rec.candidates[0]?.score ?? 0;
  const pickedThisWeek = entry?.picks.find((p) => p.week === rec.week);

  return (
    <article className={`card rec ${entry?.alive === false ? 'dead' : ''}`}>
      <div className="card-head">
        <h2>{rec.entryName}</h2>
        <span className="muted small">Week {rec.week}</span>
      </div>

      <div className="hero-picks">
        {top.map((c) => (
          <div key={c.team} className="hero">
            <div className="hero-label muted small">Recommended pick</div>
            <div className="hero-team">
              <span className="abbr">{c.team}</span>
              <span>
                <strong>{teamLabel(c.team)}</strong>
                <span className="muted">
                  {' '}
                  {c.home ? 'vs' : '@'} {c.opponent}
                </span>
              </span>
            </div>
            <div className="hero-stats">
              <Stat label="Win chance" value={pct(c.winProb)} />
              <Stat label={c.popularityEstimated ? 'Est. popularity' : 'Popularity'} value={pct(c.popularity)} />
              <Stat label={`Survive thru plan`} value={pct(c.pathSurvival, 1)} />
            </div>
            <button
              className="btn small"
              disabled={pickedThisWeek?.team === c.team}
              onClick={() => entry && onUsePick(entry.id, c.team)}
              title="Mark this team as this entry's pick for the week"
            >
              {pickedThisWeek?.team === c.team ? 'Locked in ✓' : 'Lock in pick'}
            </button>
          </div>
        ))}
        {!top.length && <p className="muted">No pick available.</p>}
      </div>
      {pickedThisWeek && !rec.recommended.includes(pickedThisWeek.team) && (
        <div className="notice small">This entry is currently set to {teamLabel(pickedThisWeek.team)} for week {rec.week}.</div>
      )}

      {rec.notes.map((n) => (
        <p key={n} className="muted small">
          ⓘ {n}
        </p>
      ))}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Team</th>
              <th>Opp</th>
              <th title="Win probability this week">Win</th>
              <th title="Share of the field expected on this team">Pop</th>
              <th title="Chance of surviving every planned week if you take this team now">Path</th>
              <th title="How much of your future plan's value this pick spends">FV cost</th>
              <th title="Strength relative to the top-rated pick under your strategy (100% = best)">Rel.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.team} className={rec.recommended.includes(c.team) ? 'hl' : ''}>
                <td>
                  <strong>{c.team}</strong>
                </td>
                <td className="muted">
                  {c.home ? 'vs' : '@'} {c.opponent}
                </td>
                <td>
                  <Bar value={c.winProb} title={SOURCE_LABEL[c.probSource]} />
                </td>
                <td>{pct(c.popularity)}</td>
                <td>{pct(c.pathSurvival, 1)}</td>
                <td className={c.futureValueCost > 0.05 ? 'warn' : ''}>{pct(c.futureValueCost, 1)}</td>
                <td className="num">{pct(Math.exp(c.score - best))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rec.candidates.length > 8 && (
        <button className="btn small ghost" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Show fewer' : `Show all ${rec.candidates.length}`}
        </button>
      )}

      <h3>Best season path</h3>
      <div className="plan">
        {rec.bestPlan.map((p) => (
          <div key={`${p.week}-${p.team}`} className="plan-step" title={teamLabel(p.team)}>
            <span className="muted small">W{p.week}</span>
            <strong>{p.team}</strong>
            <span className="small">{pct(p.winProb)}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="muted small">{label}</div>
    </div>
  );
}

function Bar({ value, title }: { value: number; title?: string }) {
  return (
    <div className="bar" title={title}>
      <div className="bar-fill" style={{ width: pct(value) }} />
      <span>{pct(value)}</span>
    </div>
  );
}
