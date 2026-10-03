import { useEffect, useState } from 'react';
import type { Entry, EntryRecommendation } from '../../../src/core/types';
import { api, type AdapterInfo } from '../api';

interface Props {
  onClose: () => void;
  onImport: (entries: Entry[], mode: 'merge' | 'replace') => void;
  recs: EntryRecommendation[];
}

export function ImportDialog({ onClose, onImport, recs }: Props) {
  const [adapters, setAdapters] = useState<AdapterInfo[]>([]);
  const [adapterId, setAdapterId] = useState('splash');
  const [input, setInput] = useState('');
  const [preview, setPreview] = useState<{ entries: Entry[]; warnings: string[] }>();
  const [exported, setExported] = useState('');
  const [error, setError] = useState<string>();

  useEffect(() => {
    api.integrations().then(setAdapters).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    setPreview(undefined);
    if (!input.trim()) return;
    const t = setTimeout(() => {
      api.import(adapterId, input).then(setPreview).catch((e) => setError(e.message));
    }, 300);
    return () => clearTimeout(t);
  }, [adapterId, input]);

  const adapter = adapters.find((a) => a.id === adapterId);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    if (file.name.endsWith('.csv')) setAdapterId('csv');
    else if (file.name.endsWith('.json')) setAdapterId('json');
    setInput(text);
  };

  const doExport = async () => {
    const { text } = await api.export(adapterId, recs);
    setExported(text);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard may be blocked; the text is shown for manual copy
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Import entries" onClick={(e) => e.stopPropagation()}>
        <div className="card-head">
          <h2>Import / export picks</h2>
          <button className="btn small ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="adapter-tabs">
          {adapters.map((a) => (
            <button key={a.id} className={`btn small ${a.id === adapterId ? '' : 'ghost'}`} onClick={() => setAdapterId(a.id)}>
              {a.name}
            </button>
          ))}
        </div>
        {adapter && <p className="muted small">{adapter.description}</p>}
        {adapterId === 'splash' && (
          <ol className="muted small steps">
            <li>Open your pool on Splash Sports and go to your entry's pick history.</li>
            <li>Select the page content (Ctrl/Cmd+A), copy, and paste below.</li>
            <li>Check the preview; add an "Entry: name" line above each entry if names aren't detected.</li>
          </ol>
        )}
        <textarea
          rows={9}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={adapter?.example}
          spellCheck={false}
          aria-label="Pasted picks"
        />
        <div className="row gap-s wrap">
          <label className="btn small ghost file">
            Upload file
            <input type="file" accept=".csv,.json,.txt" onChange={(e) => onFile(e.target.files?.[0])} hidden />
          </label>
          <button className="btn small ghost" onClick={() => setInput(adapter?.example ?? '')}>
            Use example
          </button>
          <span className="grow" />
          <button className="btn small ghost" onClick={doExport} disabled={!recs.length} title="Copy this week's recommended picks">
            Export recommendations
          </button>
        </div>

        {error && <div className="notice error">{error}</div>}
        {preview && (
          <div className="preview">
            <h3>Preview</h3>
            {preview.entries.map((e) => (
              <div key={e.id} className="preview-entry">
                <strong>{e.name}</strong> {!e.alive && <span className="chip danger">eliminated</span>}
                <div className="muted small">
                  {e.picks.map((p) => `W${p.week} ${p.team}${p.result && p.result !== 'pending' ? ` (${p.result})` : ''}`).join(' · ')}
                </div>
              </div>
            ))}
            {preview.warnings.map((w) => (
              <div key={w} className="notice small">
                {w}
              </div>
            ))}
            <div className="row gap-s end">
              <button className="btn ghost" disabled={!preview.entries.length} onClick={() => onImport(preview.entries, 'replace')}>
                Replace my entries
              </button>
              <button className="btn" disabled={!preview.entries.length} onClick={() => onImport(preview.entries, 'merge')}>
                Add {preview.entries.length} {preview.entries.length === 1 ? 'entry' : 'entries'}
              </button>
            </div>
          </div>
        )}
        {exported && (
          <div className="preview">
            <h3>Copied to clipboard</h3>
            <pre className="export">{exported}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
