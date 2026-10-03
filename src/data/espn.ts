import { resolveTeam } from '../core/teams';
import type { Game, GameOdds, GameStatus } from '../core/types';
import { fetchJson, readCache, writeCache } from './cache';

/** ESPN's public (unauthenticated) site API. */
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
export const REGULAR_SEASON_WEEKS = 18;

/* Minimal shape of the parts of ESPN's scoreboard payload we read. */
interface EspnCompetitor {
  homeAway: 'home' | 'away';
  score?: string;
  team: { abbreviation: string; displayName?: string };
}
interface EspnOddsSide {
  moneyLine?: number;
  favorite?: boolean;
}
interface EspnOdds {
  provider?: { name?: string };
  details?: string;
  spread?: number;
  homeTeamOdds?: EspnOddsSide;
  awayTeamOdds?: EspnOddsSide;
  moneyline?: { home?: { close?: { odds?: string }; open?: { odds?: string } }; away?: { close?: { odds?: string }; open?: { odds?: string } } };
  pointSpread?: { home?: { close?: { line?: string }; open?: { line?: string } } };
}
interface EspnEvent {
  id: string;
  date: string;
  week?: { number: number };
  season?: { year: number; type: number };
  status?: { type?: { state?: string; completed?: boolean } };
  competitions: Array<{
    neutralSite?: boolean;
    competitors: EspnCompetitor[];
    odds?: EspnOdds[];
    status?: { type?: { state?: string; completed?: boolean } };
  }>;
}
export interface EspnScoreboard {
  season?: { year: number; type: number };
  week?: { number: number };
  events?: EspnEvent[];
}

function num(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const s = String(v).trim().toUpperCase();
  if (s === 'PK' || s === 'EVEN') return 0;
  const n = Number(s.replace(/^\+/, ''));
  return Number.isFinite(n) ? n : undefined;
}

/** American odds; "EVEN" means +100. */
function mlNum(v: unknown): number | undefined {
  if (typeof v === 'string' && v.trim().toUpperCase() === 'EVEN') return 100;
  return num(v);
}

export function parseEspnOdds(o: EspnOdds | undefined, home: string, away: string): GameOdds | undefined {
  if (!o) return undefined;
  const odds: GameOdds = { provider: o.provider?.name };
  odds.homeMoneyline = o.homeTeamOdds?.moneyLine ?? mlNum(o.moneyline?.home?.close?.odds) ?? mlNum(o.moneyline?.home?.open?.odds);
  odds.awayMoneyline = o.awayTeamOdds?.moneyLine ?? mlNum(o.moneyline?.away?.close?.odds) ?? mlNum(o.moneyline?.away?.open?.odds);

  // `details` is the most stable field: "KC -3.5" or "EVEN".
  const details = o.details?.trim();
  if (details) {
    if (/^(even|pk|pick)/i.test(details)) odds.homeSpread = 0;
    const m = details.match(/^([A-Za-z]{2,4})\s+([+-]?\d+(?:\.\d+)?)/);
    if (m) {
      const fav = resolveTeam(m[1]);
      const line = Math.abs(Number(m[2]));
      if (fav === home) odds.homeSpread = -line;
      else if (fav === away) odds.homeSpread = line;
    }
  }
  if (odds.homeSpread == null) {
    const line = num(o.pointSpread?.home?.close?.line) ?? num(o.pointSpread?.home?.open?.line);
    if (line != null) odds.homeSpread = line;
  }
  if (odds.homeSpread == null && odds.homeMoneyline == null) return undefined;
  return odds;
}

function parseStatus(state: string | undefined, completed: boolean | undefined): GameStatus {
  if (completed || state === 'post') return 'post';
  if (state === 'in') return 'in';
  return 'pre';
}

export function parseEspnScoreboard(sb: EspnScoreboard, season: number, week: number): Game[] {
  const games: Game[] = [];
  for (const ev of sb.events ?? []) {
    const comp = ev.competitions?.[0];
    if (!comp) continue;
    const h = comp.competitors.find((c) => c.homeAway === 'home');
    const a = comp.competitors.find((c) => c.homeAway === 'away');
    const home = h && resolveTeam(h.team.abbreviation);
    const away = a && resolveTeam(a.team.abbreviation);
    if (!home || !away) continue;
    const st = comp.status?.type ?? ev.status?.type;
    const status = parseStatus(st?.state, st?.completed);
    games.push({
      id: ev.id,
      season,
      week: ev.week?.number ?? week,
      kickoff: ev.date,
      home,
      away,
      neutral: !!comp.neutralSite,
      status,
      homeScore: status === 'pre' ? undefined : num(h!.score),
      awayScore: status === 'pre' ? undefined : num(a!.score),
      odds: parseEspnOdds(comp.odds?.[0], home, away),
    });
  }
  return games;
}

export async function fetchCurrentWeek(): Promise<{ season: number; week: number; seasonType: number }> {
  const cached = await readCache<{ season: number; week: number; seasonType: number }>('espn-current');
  if (cached) return cached;
  const sb = await fetchJson<EspnScoreboard>(BASE);
  const season = sb.season?.year ?? new Date().getFullYear();
  const seasonType = sb.season?.type ?? 2;
  let week = sb.week?.number ?? 1;
  if (seasonType === 1) week = 1; // preseason: plan from week 1
  if (seasonType === 3) week = REGULAR_SEASON_WEEKS; // postseason: regular season is over
  const result = { season, week, seasonType };
  await writeCache('espn-current', result, 30 * 60 * 1000);
  return result;
}

export async function fetchWeek(season: number, week: number): Promise<Game[]> {
  const key = `espn-${season}-w${week}`;
  const cached = await readCache<Game[]>(key);
  if (cached) return cached;
  const sb = await fetchJson<EspnScoreboard>(`${BASE}?seasontype=2&week=${week}&dates=${season}`);
  const games = parseEspnScoreboard(sb, season, week);
  const allFinal = games.length > 0 && games.every((g) => g.status === 'post');
  await writeCache(key, games, allFinal ? 7 * 24 * 3600 * 1000 : 10 * 60 * 1000);
  return games;
}

export async function fetchSeason(season: number, weeks = REGULAR_SEASON_WEEKS): Promise<Game[]> {
  const all: Game[] = [];
  // Small batches keep us polite to ESPN while still being quick.
  for (let w = 1; w <= weeks; w += 6) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(6, weeks - w + 1) }, (_, i) => fetchWeek(season, w + i)),
    );
    for (const g of batch) all.push(...g);
  }
  return all;
}
