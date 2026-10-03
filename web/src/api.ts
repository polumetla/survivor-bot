import type { Entry, EntryRecommendation, Game, ProbTable, RecommendSettings } from '../../src/core/types';
import type { ImportResult } from '../../src/integrations/types';

export interface SeasonResponse {
  season: number;
  currentWeek: number;
  lastWeek: number;
  source: 'live' | 'demo';
  warnings: string[];
  fetchedAt: string;
  games: Game[];
  probs: ProbTable;
  ratings: Record<string, number>;
}

export interface AdapterInfo {
  id: string;
  name: string;
  description: string;
  example: string;
  capabilities: { import: boolean; sync: boolean; submit: boolean };
}

async function call<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}

const q = (source: string, week?: number) => `source=${source}${week ? `&week=${week}` : ''}`;

export const api = {
  season: (source: string, week?: number) => call<SeasonResponse>(`/api/season?${q(source, week)}`),
  recommend: (source: string, entries: Entry[], settings: RecommendSettings, week?: number) =>
    call<{ week: number; recommendations: EntryRecommendation[]; probs: ProbTable }>(`/api/recommend?${q(source, week)}`, { entries, settings }),
  integrations: () => call<AdapterInfo[]>('/api/integrations'),
  import: (adapter: string, input: string) => call<ImportResult>('/api/import', { adapter, input }),
  export: (adapter: string, recommendations: EntryRecommendation[]) => call<{ text: string }>('/api/export', { adapter, recommendations }),
};
