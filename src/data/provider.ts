import type { SeasonData } from '../core/types';
import { demoSeason } from './demo';
import { fetchCurrentWeek, fetchSeason, REGULAR_SEASON_WEEKS } from './espn';
import { applyConsensus, fetchOddsApiLines } from './oddsApi';

export interface ProviderOptions {
  source?: 'live' | 'demo';
  oddsApiKey?: string;
  /** Override the detected current week. */
  week?: number;
}

let memo: { at: number; key: string; data: SeasonData } | undefined;

export async function loadSeasonData(opts: ProviderOptions = {}): Promise<SeasonData> {
  const source = opts.source ?? (process.env.DATA_SOURCE === 'demo' ? 'demo' : 'live');
  const key = `${source}:${opts.week ?? ''}`;
  if (memo && memo.key === key && Date.now() - memo.at < 5 * 60 * 1000) return memo.data;

  let data: SeasonData;
  if (source === 'demo') {
    data = demoSeason(opts.week ?? 5);
  } else {
    try {
      data = await loadLive(opts);
    } catch (err) {
      data = demoSeason(opts.week ?? 5);
      data.warnings.unshift(`Live data failed: ${(err as Error).message}`);
    }
  }
  memo = { at: Date.now(), key, data };
  return data;
}

async function loadLive(opts: ProviderOptions): Promise<SeasonData> {
  const warnings: string[] = [];
  const current = await fetchCurrentWeek();
  const [games, priorGames] = await Promise.all([
    fetchSeason(current.season),
    fetchSeason(current.season - 1).catch((e) => {
      warnings.push(`Prior season unavailable for rating seed: ${(e as Error).message}`);
      return [];
    }),
  ]);
  if (!games.length) throw new Error(`No games found for ${current.season}`);

  // ESPN's "current week" flips on Tuesday; if every game in it is final, move on.
  let week = opts.week ?? current.week;
  while (!opts.week && week < REGULAR_SEASON_WEEKS && games.filter((g) => g.week === week).every((g) => g.status === 'post')) {
    week++;
  }
  if (current.seasonType === 3) warnings.push('The regular season is over; survivor planning is not meaningful until next season.');

  const key = opts.oddsApiKey ?? process.env.ODDS_API_KEY;
  if (key) {
    try {
      const n = applyConsensus(games, await fetchOddsApiLines(key));
      if (!n) warnings.push('The Odds API returned no lines matching the schedule.');
    } catch (e) {
      warnings.push(`The Odds API failed, using ESPN odds only: ${(e as Error).message}`);
    }
  }

  return {
    season: current.season,
    currentWeek: week,
    lastWeek: Math.max(...games.map((g) => g.week)),
    games,
    priorGames,
    source: 'live',
    warnings,
    fetchedAt: new Date().toISOString(),
  };
}
