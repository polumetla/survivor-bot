import { describe, expect, it } from 'vitest';
import { parseEspnScoreboard, type EspnScoreboard } from '../src/data/espn';
import { applyConsensus, consensusFromOddsApi } from '../src/data/oddsApi';
import { demoSeason } from '../src/data/demo';

const scoreboard: EspnScoreboard = {
  season: { year: 2026, type: 2 },
  week: { number: 5 },
  events: [
    {
      id: '401',
      date: '2026-10-04T17:00Z',
      week: { number: 5 },
      competitions: [
        {
          neutralSite: false,
          status: { type: { state: 'pre', completed: false } },
          competitors: [
            { homeAway: 'home', score: '0', team: { abbreviation: 'KC' } },
            { homeAway: 'away', score: '0', team: { abbreviation: 'LV' } },
          ],
          odds: [{ provider: { name: 'ESPN BET' }, details: 'KC -9.5', homeTeamOdds: { moneyLine: -450 }, awayTeamOdds: { moneyLine: 350 } }],
        },
      ],
    },
    {
      id: '402',
      date: '2026-10-02T00:15Z',
      competitions: [
        {
          neutralSite: true,
          status: { type: { state: 'post', completed: true } },
          competitors: [
            { homeAway: 'home', score: '20', team: { abbreviation: 'WSH' } },
            { homeAway: 'away', score: '27', team: { abbreviation: 'NYG' } },
          ],
          odds: [{ details: 'NYG -2.5', moneyline: { home: { close: { odds: '+120' } }, away: { close: { odds: '-140' } } } }],
        },
      ],
    },
  ],
};

describe('ESPN parser', () => {
  it('parses games, scores and odds', () => {
    const games = parseEspnScoreboard(scoreboard, 2026, 5);
    expect(games).toHaveLength(2);
    const [kc, wsh] = games;
    expect(kc).toMatchObject({ home: 'KC', away: 'LV', status: 'pre', week: 5, homeScore: undefined });
    expect(kc.odds).toMatchObject({ homeSpread: -9.5, homeMoneyline: -450, awayMoneyline: 350 });
    expect(wsh).toMatchObject({ home: 'WSH', away: 'NYG', status: 'post', neutral: true, homeScore: 20, awayScore: 27, week: 5 });
    expect(wsh.odds).toMatchObject({ homeSpread: 2.5, homeMoneyline: 120, awayMoneyline: -140 });
  });
});

describe('The Odds API consensus', () => {
  it('averages devigged prices across books and overlays games', () => {
    const lines = consensusFromOddsApi([
      {
        id: 'a', commence_time: '2026-10-04T17:00:00Z', home_team: 'Kansas City Chiefs', away_team: 'Las Vegas Raiders',
        bookmakers: [
          { key: 'dk', markets: [{ key: 'h2h', outcomes: [{ name: 'Kansas City Chiefs', price: -400 }, { name: 'Las Vegas Raiders', price: 320 }] }] },
          { key: 'fd', markets: [{ key: 'h2h', outcomes: [{ name: 'Kansas City Chiefs', price: -500 }, { name: 'Las Vegas Raiders', price: 380 }] }, { key: 'spreads', outcomes: [{ name: 'Kansas City Chiefs', price: -110, point: -9.5 }, { name: 'Las Vegas Raiders', price: -110, point: 9.5 }] }] },
        ],
      },
    ]);
    expect(lines[0].home).toBe('KC');
    expect(lines[0].homeWinProb).toBeGreaterThan(0.76);
    expect(lines[0].homeWinProb).toBeLessThan(0.82);
    expect(lines[0].homeSpread).toBe(-9.5);
    const games = parseEspnScoreboard(scoreboard, 2026, 5);
    expect(applyConsensus(games, lines)).toBe(1);
    expect(games[0].odds?.homeWinProb).toBe(lines[0].homeWinProb);
  });
});

describe('demo season', () => {
  it('has a realistic structure', () => {
    const d = demoSeason(5);
    const perTeam: Record<string, number> = {};
    for (const g of d.games) for (const t of [g.home, g.away]) perTeam[t] = (perTeam[t] ?? 0) + 1;
    expect(Object.keys(perTeam)).toHaveLength(32);
    expect(Object.values(perTeam).every((n) => n === 17)).toBe(true);
    expect(d.games.filter((g) => g.week < 5).every((g) => g.status === 'post')).toBe(true);
    expect(d.games.filter((g) => g.week === 5).every((g) => g.odds)).toBe(true);
  });
});
