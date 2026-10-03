export interface TeamInfo {
  abbr: string;
  city: string;
  name: string;
  conference: 'AFC' | 'NFC';
  division: 'East' | 'North' | 'South' | 'West';
}

/** Canonical abbreviations follow ESPN's conventions. */
export const TEAMS: TeamInfo[] = [
  { abbr: 'BUF', city: 'Buffalo', name: 'Bills', conference: 'AFC', division: 'East' },
  { abbr: 'MIA', city: 'Miami', name: 'Dolphins', conference: 'AFC', division: 'East' },
  { abbr: 'NE', city: 'New England', name: 'Patriots', conference: 'AFC', division: 'East' },
  { abbr: 'NYJ', city: 'New York', name: 'Jets', conference: 'AFC', division: 'East' },
  { abbr: 'BAL', city: 'Baltimore', name: 'Ravens', conference: 'AFC', division: 'North' },
  { abbr: 'CIN', city: 'Cincinnati', name: 'Bengals', conference: 'AFC', division: 'North' },
  { abbr: 'CLE', city: 'Cleveland', name: 'Browns', conference: 'AFC', division: 'North' },
  { abbr: 'PIT', city: 'Pittsburgh', name: 'Steelers', conference: 'AFC', division: 'North' },
  { abbr: 'HOU', city: 'Houston', name: 'Texans', conference: 'AFC', division: 'South' },
  { abbr: 'IND', city: 'Indianapolis', name: 'Colts', conference: 'AFC', division: 'South' },
  { abbr: 'JAX', city: 'Jacksonville', name: 'Jaguars', conference: 'AFC', division: 'South' },
  { abbr: 'TEN', city: 'Tennessee', name: 'Titans', conference: 'AFC', division: 'South' },
  { abbr: 'DEN', city: 'Denver', name: 'Broncos', conference: 'AFC', division: 'West' },
  { abbr: 'KC', city: 'Kansas City', name: 'Chiefs', conference: 'AFC', division: 'West' },
  { abbr: 'LV', city: 'Las Vegas', name: 'Raiders', conference: 'AFC', division: 'West' },
  { abbr: 'LAC', city: 'Los Angeles', name: 'Chargers', conference: 'AFC', division: 'West' },
  { abbr: 'DAL', city: 'Dallas', name: 'Cowboys', conference: 'NFC', division: 'East' },
  { abbr: 'NYG', city: 'New York', name: 'Giants', conference: 'NFC', division: 'East' },
  { abbr: 'PHI', city: 'Philadelphia', name: 'Eagles', conference: 'NFC', division: 'East' },
  { abbr: 'WSH', city: 'Washington', name: 'Commanders', conference: 'NFC', division: 'East' },
  { abbr: 'CHI', city: 'Chicago', name: 'Bears', conference: 'NFC', division: 'North' },
  { abbr: 'DET', city: 'Detroit', name: 'Lions', conference: 'NFC', division: 'North' },
  { abbr: 'GB', city: 'Green Bay', name: 'Packers', conference: 'NFC', division: 'North' },
  { abbr: 'MIN', city: 'Minnesota', name: 'Vikings', conference: 'NFC', division: 'North' },
  { abbr: 'ATL', city: 'Atlanta', name: 'Falcons', conference: 'NFC', division: 'South' },
  { abbr: 'CAR', city: 'Carolina', name: 'Panthers', conference: 'NFC', division: 'South' },
  { abbr: 'NO', city: 'New Orleans', name: 'Saints', conference: 'NFC', division: 'South' },
  { abbr: 'TB', city: 'Tampa Bay', name: 'Buccaneers', conference: 'NFC', division: 'South' },
  { abbr: 'ARI', city: 'Arizona', name: 'Cardinals', conference: 'NFC', division: 'West' },
  { abbr: 'LAR', city: 'Los Angeles', name: 'Rams', conference: 'NFC', division: 'West' },
  { abbr: 'SF', city: 'San Francisco', name: '49ers', conference: 'NFC', division: 'West' },
  { abbr: 'SEA', city: 'Seattle', name: 'Seahawks', conference: 'NFC', division: 'West' },
];

export const TEAM_ABBRS = TEAMS.map((t) => t.abbr);
const BY_ABBR = new Map(TEAMS.map((t) => [t.abbr, t]));

export function teamInfo(abbr: string): TeamInfo | undefined {
  return BY_ABBR.get(abbr);
}

export function teamLabel(abbr: string): string {
  const t = BY_ABBR.get(abbr);
  return t ? `${t.city} ${t.name}` : abbr;
}

/** Alternate abbreviations used by other sites (PFR, Yahoo, Splash, sportsbooks...). */
const ABBR_ALIASES: Record<string, string> = {
  WAS: 'WSH', WFT: 'WSH', LA: 'LAR', STL: 'LAR', JAC: 'JAX', OAK: 'LV', LVR: 'LV', SD: 'LAC',
  GNB: 'GB', KAN: 'KC', KCC: 'KC', NWE: 'NE', NEP: 'NE', NOR: 'NO', NOS: 'NO', SFO: 'SF',
  TAM: 'TB', TBB: 'TB', ARZ: 'ARI', CLV: 'CLE', HST: 'HOU', BLT: 'BAL',
};

/**
 * Words that identify a team on their own. City names shared by two teams
 * ("New York", "Los Angeles") are deliberately excluded.
 */
const NAME_ALIASES: Array<[string, string]> = [];
for (const t of TEAMS) {
  NAME_ALIASES.push([t.name.toLowerCase(), t.abbr]);
  NAME_ALIASES.push([`${t.city} ${t.name}`.toLowerCase(), t.abbr]);
  if (t.city !== 'New York' && t.city !== 'Los Angeles') NAME_ALIASES.push([t.city.toLowerCase(), t.abbr]);
}
NAME_ALIASES.push(
  ['niners', 'SF'], ['bucs', 'TB'], ['commies', 'WSH'], ['football team', 'WSH'], ['jags', 'JAX'],
  ['pats', 'NE'], ['ny giants', 'NYG'], ['ny jets', 'NYJ'], ['la rams', 'LAR'], ['la chargers', 'LAC'],
  ['bolts', 'LAC'], ['phins', 'MIA'], ['cards', 'ARI'], ['vikes', 'MIN'], ['seattle', 'SEA'],
);
// Longest aliases first so "kansas city chiefs" wins over "chiefs".
NAME_ALIASES.sort((a, b) => b[0].length - a[0].length);

/** Resolve a single token or phrase ("KC", "Chiefs", "Kansas City Chiefs", "kan") to a canonical abbr. */
export function resolveTeam(input: string): string | undefined {
  const raw = input.trim();
  if (!raw) return undefined;
  const up = raw.toUpperCase().replace(/[^A-Z]/g, '');
  if (BY_ABBR.has(up)) return up;
  if (ABBR_ALIASES[up]) return ABBR_ALIASES[up];
  const low = raw.toLowerCase().replace(/\s+/g, ' ');
  for (const [alias, abbr] of NAME_ALIASES) if (low === alias) return abbr;
  return undefined;
}

/**
 * Find every team mentioned in a free-form line of text, in order of appearance.
 * Used by paste-import adapters where formats vary between sites.
 */
export function findTeamsInText(text: string): string[] {
  const found: Array<{ idx: number; abbr: string }> = [];
  const taken: boolean[] = new Array(text.length).fill(false);
  const low = text.toLowerCase();
  const mark = (idx: number, len: number) => {
    for (let i = idx; i < idx + len; i++) taken[i] = true;
  };
  const free = (idx: number, len: number) => {
    for (let i = idx; i < idx + len; i++) if (taken[i]) return false;
    return true;
  };
  const isBoundary = (i: number) => i < 0 || i >= text.length || !/[a-z0-9]/i.test(text[i]);

  for (const [alias, abbr] of NAME_ALIASES) {
    let from = 0;
    while (true) {
      const idx = low.indexOf(alias, from);
      if (idx < 0) break;
      from = idx + 1;
      if (isBoundary(idx - 1) && isBoundary(idx + alias.length) && free(idx, alias.length)) {
        found.push({ idx, abbr });
        mark(idx, alias.length);
      }
    }
  }
  // Abbreviations must be standalone uppercase-ish tokens to avoid matching ordinary words.
  const tokenRe = /\b([A-Za-z]{2,3})\b/g;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(text))) {
    const tok = m[1];
    if (tok !== tok.toUpperCase()) continue;
    const abbr = BY_ABBR.has(tok) ? tok : ABBR_ALIASES[tok];
    if (abbr && free(m.index, tok.length)) {
      found.push({ idx: m.index, abbr });
      mark(m.index, tok.length);
    }
  }
  return found.sort((a, b) => a.idx - b.idx).map((f) => f.abbr);
}
