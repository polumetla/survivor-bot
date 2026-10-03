import { eloWinProb } from '../core/probability';
import { TEAM_ABBRS } from '../core/teams';
import type { Game, SeasonData } from '../core/types';

/**
 * Deterministic synthetic season used when live data is unavailable (offline,
 * blocked network, tests). Schedules and results are fake but structurally
 * realistic: 18 weeks, one bye per team in weeks 5-12, odds on upcoming games.
 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(xs: T[], r: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function gaussian(r: () => number) {
  return Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
}

function probToMoneyline(p: number): number {
  return p >= 0.5 ? -Math.round((100 * p) / (1 - p)) : Math.round((100 * (1 - p)) / p);
}

function generateSeason(season: number, completedThrough: number, oddsThrough: number, seed: number): Game[] {
  const r = rng(seed);
  const strength = Object.fromEntries(TEAM_ABBRS.map((t) => [t, 1500 + 95 * gaussian(r)]));
  const byeOrder = shuffle(TEAM_ABBRS, r);
  const start = Date.UTC(season, 8, 13, 17, 0); // second Sunday of September-ish
  const games: Game[] = [];
  for (let week = 1; week <= 18; week++) {
    const bye = week >= 5 && week <= 12 ? new Set(byeOrder.slice((week - 5) * 4, (week - 4) * 4)) : new Set<string>();
    const playing = shuffle(TEAM_ABBRS.filter((t) => !bye.has(t)), r);
    for (let i = 0; i < playing.length; i += 2) {
      const [home, away] = [playing[i], playing[i + 1]];
      const kickoff = new Date(start + (week - 1) * 7 * 86400000 + (i === 0 ? -3 * 86400000 : 0)).toISOString();
      const pHome = eloWinProb(strength[home] - strength[away] + 48);
      const g: Game = { id: `demo-${season}-${week}-${i / 2}`, season, week, kickoff, home, away, neutral: false, status: 'pre' };
      if (week <= completedThrough) {
        const margin = Math.round((strength[home] - strength[away] + 48) / 25 + 13.45 * gaussian(r)) || 1;
        const base = 17 + Math.floor(r() * 10);
        g.status = 'post';
        g.homeScore = margin > 0 ? base + margin : base;
        g.awayScore = margin > 0 ? base : base - margin;
        // Strengths drift a little week to week, like injuries/form.
        strength[home] += 6 * gaussian(r);
        strength[away] += 6 * gaussian(r);
      } else if (week <= oddsThrough) {
        const noisy = Math.min(0.97, Math.max(0.03, pHome + 0.03 * gaussian(r)));
        const vig = 0.022;
        g.odds = {
          homeMoneyline: probToMoneyline(Math.min(0.985, noisy + vig)),
          awayMoneyline: probToMoneyline(Math.min(0.985, 1 - noisy + vig)),
          homeSpread: Math.round((-(strength[home] - strength[away] + 48) / 25) * 2) / 2,
          provider: 'Demo Book',
        };
      }
      games.push(g);
    }
  }
  return games;
}

export function demoSeason(currentWeek = 5, season = 2026): SeasonData {
  return {
    season,
    currentWeek,
    lastWeek: 18,
    games: generateSeason(season, currentWeek - 1, currentWeek + 1, 2026),
    priorGames: generateSeason(season - 1, 18, 0, 2025),
    source: 'demo',
    warnings: ['Showing DEMO data (synthetic schedule and odds). Live NFL data could not be loaded or DATA_SOURCE=demo.'],
    fetchedAt: new Date().toISOString(),
  };
}
