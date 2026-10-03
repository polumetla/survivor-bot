import { resolveTeam, teamLabel } from '../core/teams';
import type { Entry, EntryRecommendation } from '../core/types';
import { parsePickText } from './textParser';
import type { ImportResult, PlatformAdapter } from './types';

export type { PlatformAdapter, ImportResult } from './types';

function textExport(recs: EntryRecommendation[]) {
  return recs
    .map((r) => `${r.entryName} — Week ${r.week}: ${r.recommended.map(teamLabel).join(' + ') || '(no pick)'}`)
    .join('\n');
}

/**
 * Splash Sports (formerly RunYourPool / OfficeFootballPool) has no public
 * API, so the integration works from the "My Picks"/entry history page:
 * select it, copy, and paste here. The parser is tolerant of the layout.
 * If Splash publishes an API, implement `sync` here and flip `capabilities.sync`.
 */
export const splashAdapter: PlatformAdapter = {
  id: 'splash',
  name: 'Splash Sports',
  description:
    'Paste your entry pick history copied from Splash Sports (or RunYourPool). One block per entry; an entry name line followed by weekly picks.',
  example: 'Entry: Big Dog #1\nWeek 1  Philadelphia Eagles  W\nWeek 2  Baltimore Ravens  W\nWeek 3  DET  Pending',
  capabilities: { import: true, sync: false, submit: false },
  parse: (input) => parsePickText(input, 'splash', 'Splash entry'),
  exportPicks: textExport,
};

export const genericTextAdapter: PlatformAdapter = {
  id: 'text',
  name: 'Other site / free text',
  description: 'ESPN, Yahoo, DraftKings, Underdog, office pool spreadsheets… one pick per line, or a comma-separated list of used teams.',
  example: 'Main entry\nWk 1: Bills\nWk 2: 49ers (L)\n\nSecond entry\nKC, DET, BAL',
  capabilities: { import: true, sync: false, submit: false },
  parse: (input) => parsePickText(input, 'text'),
  exportPicks: textExport,
};

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

const csvEscape = (s: string | number) => (/[",\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s));

export const csvAdapter: PlatformAdapter = {
  id: 'csv',
  name: 'CSV',
  description: 'Columns: entry, week, team, result (optional). Header row required.',
  example: 'entry,week,team,result\nMain,1,PHI,W\nMain,2,BAL,W\nBackup,1,KC,L',
  capabilities: { import: true, sync: false, submit: false },
  parse(input): ImportResult {
    const rows = parseCsv(input.trim());
    const warnings: string[] = [];
    if (rows.length < 2) return { entries: [], warnings: ['CSV needs a header row and at least one pick.'] };
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
    const ei = col('entry', 'entry name', 'name');
    const wi = col('week', 'wk');
    const ti = col('team', 'pick', 'selection');
    const ri = col('result', 'outcome', 'status');
    if (ti < 0) return { entries: [], warnings: ['CSV needs a "team" (or "pick") column.'] };
    const byName = new Map<string, Entry>();
    rows.slice(1).forEach((r, i) => {
      const name = (ei >= 0 ? r[ei]?.trim() : '') || 'Imported entry';
      const team = resolveTeam(r[ti] ?? '');
      if (!team) {
        warnings.push(`Row ${i + 2}: unknown team "${r[ti]}".`);
        return;
      }
      let e = byName.get(name);
      if (!e) {
        e = { id: `csv-${Date.now().toString(36)}-${byName.size}`, name, picks: [], alive: true, platform: 'csv' };
        byName.set(name, e);
      }
      const week = wi >= 0 && r[wi]?.trim() ? Number(r[wi]) : e.picks.length + 1;
      const res = (ri >= 0 ? r[ri] : '')?.trim().toUpperCase();
      const result = res?.startsWith('W') ? 'W' : res?.startsWith('L') ? 'L' : res?.startsWith('T') ? 'T' : undefined;
      e.picks.push({ week, team, result });
      if (result === 'L') e.alive = false;
    });
    return { entries: [...byName.values()], warnings };
  },
  exportPicks(recs) {
    const lines = ['entry,week,team'];
    for (const r of recs) for (const t of r.recommended) lines.push([r.entryName, r.week, t].map(csvEscape).join(','));
    return lines.join('\n');
  },
};

export const jsonAdapter: PlatformAdapter = {
  id: 'json',
  name: 'JSON backup',
  description: 'Restore entries exported from this app ({"entries": [...]}).',
  example: '{"entries":[{"name":"Main","alive":true,"picks":[{"week":1,"team":"PHI"}]}]}',
  capabilities: { import: true, sync: false, submit: false },
  parse(input): ImportResult {
    const warnings: string[] = [];
    let data: unknown;
    try {
      data = JSON.parse(input);
    } catch (e) {
      return { entries: [], warnings: [`Invalid JSON: ${(e as Error).message}`] };
    }
    const list = Array.isArray(data) ? data : (data as { entries?: unknown[] })?.entries;
    if (!Array.isArray(list)) return { entries: [], warnings: ['Expected an array or {"entries": [...]}.'] };
    const entries: Entry[] = list.map((raw, i) => {
      const r = raw as Partial<Entry> & { usedTeams?: string[] };
      const picks = (r.picks ?? (r.usedTeams ?? []).map((team, k) => ({ week: k + 1, team })))
        .map((p) => ({ ...p, team: resolveTeam(String(p.team)) ?? '' }))
        .filter((p) => {
          if (!p.team) warnings.push(`Entry ${i + 1}: dropped an unknown team.`);
          return !!p.team;
        });
      return {
        id: r.id ?? `json-${Date.now().toString(36)}-${i}`,
        name: r.name ?? `Entry ${i + 1}`,
        picks,
        alive: r.alive ?? true,
        platform: r.platform ?? 'json',
      };
    });
    return { entries, warnings };
  },
  exportPicks: (recs) => JSON.stringify(recs.map((r) => ({ entry: r.entryName, week: r.week, picks: r.recommended })), null, 2),
};

export const ADAPTERS: PlatformAdapter[] = [splashAdapter, genericTextAdapter, csvAdapter, jsonAdapter];

export function getAdapter(id: string): PlatformAdapter | undefined {
  return ADAPTERS.find((a) => a.id === id);
}
