import { buildProbTable } from './probTable';
import { buildRatings, type Ratings } from './ratings';
import { recommendAll } from './recommend';
import type { Entry, EntryRecommendation, ProbTable, RecommendSettings, SeasonData } from './types';
import { DEFAULT_SETTINGS } from './types';

export interface Analysis {
  week: number;
  ratings: Ratings;
  probs: ProbTable;
}

export function analyze(data: SeasonData, settings: Partial<RecommendSettings> = {}, week = data.currentWeek): Analysis {
  // Elo learns from every completed game; upcoming market lines refine it.
  const ratings = buildRatings(data.games, data.priorGames);
  const probs = buildProbTable(data.games, ratings, week, settings.probOverrides);
  return { week, ratings, probs };
}

export function recommend(
  data: SeasonData,
  entries: Entry[],
  partial: Partial<RecommendSettings> = {},
  week = data.currentWeek,
): { analysis: Analysis; settings: RecommendSettings; recommendations: EntryRecommendation[] } {
  const settings: RecommendSettings = { ...DEFAULT_SETTINGS, ...partial };
  const analysis = analyze(data, settings, week);
  const recommendations = recommendAll(entries, { probs: analysis.probs, week, lastWeek: data.lastWeek, settings });
  return { analysis, settings, recommendations };
}
