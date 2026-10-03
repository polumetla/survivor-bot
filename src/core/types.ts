export type GameStatus = 'pre' | 'in' | 'post';

export interface GameOdds {
  /** American moneyline for the home team, e.g. -180. */
  homeMoneyline?: number;
  awayMoneyline?: number;
  /** Point spread from the home team's perspective (negative = home favored). */
  homeSpread?: number;
  /** Consensus no-vig home win probability (e.g. averaged across sportsbooks). */
  homeWinProb?: number;
  provider?: string;
}

export interface Game {
  id: string;
  season: number;
  week: number;
  kickoff: string; // ISO timestamp
  home: string;
  away: string;
  neutral: boolean;
  status: GameStatus;
  homeScore?: number;
  awayScore?: number;
  odds?: GameOdds;
}

export interface SeasonData {
  season: number;
  currentWeek: number;
  lastWeek: number;
  games: Game[];
  /** Completed games from the prior season, used to seed team ratings. */
  priorGames: Game[];
  source: 'live' | 'demo';
  warnings: string[];
  fetchedAt: string;
}

export type ProbSource = 'moneyline' | 'spread' | 'model' | 'override';

export interface TeamWeekProb {
  team: string;
  opponent: string;
  home: boolean;
  winProb: number;
  source: ProbSource;
  gameId: string;
  /** False when the game has already kicked off or finished. */
  pickable: boolean;
}

/** week -> team -> probability info (teams on bye are absent). */
export type ProbTable = Record<number, Record<string, TeamWeekProb>>;

export interface Entry {
  id: string;
  name: string;
  /** Teams already used, optionally keyed by week. */
  picks: Array<{ week: number; team: string; result?: 'W' | 'L' | 'T' | 'pending' }>;
  alive: boolean;
  /** Source integration, e.g. "splash", "manual". */
  platform?: string;
}

export type Strategy = 'survival' | 'balanced' | 'contrarian';

export interface RecommendSettings {
  strategy: Strategy;
  /** Weight applied per week into the future (1 = all weeks equal, 0 = only this week matters). */
  futureDiscount: number;
  /** How many weeks ahead (including current) to plan. */
  horizon: number;
  /** Number of picks required per week (e.g. { 17: 2 } for a double-pick week). */
  picksPerWeek?: Record<number, number>;
  /** Pick popularity overrides for the current week, team -> share (0..1 or 0..100). */
  popularity?: Record<string, number>;
  /** Per-game win probability overrides for any week, keyed `${week}:${team}`. */
  probOverrides?: Record<string, number>;
  /** Penalise picking the same team across multiple of your own entries (0 = off). */
  diversify: number;
  /** Teams the user never wants to pick. */
  excludeTeams?: string[];
}

export const DEFAULT_SETTINGS: RecommendSettings = {
  strategy: 'balanced',
  futureDiscount: 0.85,
  horizon: 8,
  diversify: 0.5,
};

export interface CandidateScore {
  team: string;
  opponent: string;
  home: boolean;
  winProb: number;
  probSource: ProbSource;
  popularity: number;
  popularityEstimated: boolean;
  /** Probability of surviving every planned week if this team is picked now. */
  pathSurvival: number;
  /** Relative loss in planned-path value vs saving this team (0 = no future value spent). */
  futureValueCost: number;
  /** Ratio of your equity to the field's if you pick this team (higher = more contrarian edge). */
  leverage: number;
  score: number;
  plan: Array<{ week: number; team: string; winProb: number }>;
}

export interface EntryRecommendation {
  entryId: string;
  entryName: string;
  week: number;
  picksRequired: number;
  recommended: string[];
  candidates: CandidateScore[];
  bestPlan: Array<{ week: number; team: string; winProb: number }>;
  notes: string[];
}
