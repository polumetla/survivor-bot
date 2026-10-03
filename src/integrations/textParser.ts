import { findTeamsInText } from '../core/teams';
import type { Entry } from '../core/types';
import type { ImportResult } from './types';

const WEEK_RE = /\b(?:week|wk)\s*\.?\s*#?(\d{1,2})\b/i;
const LEADING_WEEK_RE = /^\s*(\d{1,2})\s*[.:)\-–]\s*/;
const ENTRY_RE = /^\s*(?:entry|entry name|team name|name)\s*[:#\-–]\s*(.+)$/i;
const WIN_RE = /\b(win|won|w|correct|advanced|✅)\b/i;
const LOSS_RE = /\b(loss|lost|l|incorrect|eliminated|❌)\b/i;
const TIE_RE = /\b(tie|tied|t)\b/i;
const PENDING_RE = /\b(pending|locked|upcoming|tbd)\b/i;

let counter = 0;
function newEntry(name: string, platform: string): Entry {
  counter++;
  return { id: `${platform}-${Date.now().toString(36)}-${counter}`, name, picks: [], alive: true, platform };
}

/**
 * Heuristic parser for pick histories copied from survivor sites (Splash
 * Sports, RunYourPool, ESPN, Yahoo, spreadsheets...). Handles lines like:
 *   "Entry: Main"            -> starts a new entry
 *   "Week 3: Chiefs  W"      -> pick with result
 *   "4. BUF (L)"             -> leading week number
 *   "KC, BUF, DET"           -> list of used teams (weeks assigned in order)
 */
export function parsePickText(text: string, platform: string, defaultName = 'Imported entry'): ImportResult {
  const warnings: string[] = [];
  const entries: Entry[] = [];
  let cur: Entry | undefined;
  const ensure = () => {
    if (!cur) {
      cur = newEntry(entries.length ? `${defaultName} ${entries.length + 1}` : defaultName, platform);
      entries.push(cur);
    }
    return cur;
  };

  const lines = text.split(/\r?\n/);
  lines.forEach((rawLine, i) => {
    const line = rawLine.trim();
    if (!line) return;
    const entryMatch = line.match(ENTRY_RE);
    if (entryMatch) {
      cur = newEntry(entryMatch[1].trim(), platform);
      entries.push(cur);
      return;
    }
    let rest = line;
    let week: number | undefined;
    const wm = rest.match(WEEK_RE);
    if (wm) {
      week = Number(wm[1]);
      rest = rest.replace(wm[0], ' ');
    } else {
      const lm = rest.match(LEADING_WEEK_RE);
      if (lm) {
        week = Number(lm[1]);
        rest = rest.slice(lm[0].length);
      }
    }
    const teams = findTeamsInText(rest);

    if (!teams.length) {
      if (/eliminated|knocked out/i.test(line) && cur) cur.alive = false;
      // A short line with no team or week is treated as an entry name header.
      else if (week == null && line.length <= 60 && !/^[\d\s%.,:/-]+$/.test(line)) {
        cur = newEntry(line.replace(/[:\-–]+$/, '').trim(), platform);
        entries.push(cur);
      }
      return;
    }

    const e = ensure();
    const nextWeek = () => (e.picks.length ? Math.max(...e.picks.map((p) => p.week)) + 1 : 1);
    const isMatchup = teams.length === 2 && /(@|\bvs\.?\b|\bat\b|\bv\b)/i.test(rest);
    if (teams.length > 1 && !isMatchup && week == null) {
      // A comma/space separated list of used teams.
      for (const t of teams) e.picks.push({ week: nextWeek(), team: t });
      return;
    }
    if (teams.length > 1) {
      warnings.push(`Line ${i + 1}: "${line}" mentions ${teams.join(' and ')}; assumed the pick was ${teams[0]}.`);
    }
    // Strip team names before checking for single-letter result codes.
    const resultText = rest.replace(/\b[A-Z]{2,3}\b/g, ' ');
    let result: Entry['picks'][number]['result'];
    if (LOSS_RE.test(resultText)) result = 'L';
    else if (WIN_RE.test(resultText)) result = 'W';
    else if (TIE_RE.test(resultText)) result = 'T';
    else if (PENDING_RE.test(resultText)) result = 'pending';
    const w = week ?? nextWeek();
    if (e.picks.some((p) => p.week === w && p.team === teams[0])) return;
    e.picks.push({ week: w, team: teams[0], result });
    if (result === 'L') e.alive = false;
  });

  for (const e of entries) {
    e.picks.sort((a, b) => a.week - b.week);
    const seen = new Set<string>();
    for (const p of e.picks) {
      if (seen.has(p.team)) warnings.push(`${e.name}: ${p.team} appears more than once.`);
      seen.add(p.team);
    }
  }
  const withPicks = entries.filter((e) => e.picks.length > 0);
  if (!withPicks.length) warnings.push('No picks were recognised. Try one pick per line, e.g. "Week 1: Chiefs".');
  return { entries: withPicks, warnings };
}
