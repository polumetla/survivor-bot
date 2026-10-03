import express, { type Request } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { analyze, recommend } from '../core/engine';
import { TEAMS } from '../core/teams';
import type { Entry, RecommendSettings } from '../core/types';
import { loadSeasonData } from '../data/provider';
import { ADAPTERS, getAdapter } from '../integrations';

const app = express();
app.use(express.json({ limit: '1mb' }));

function sourceOf(req: Request): 'live' | 'demo' | undefined {
  const s = (req.query.source ?? req.body?.source) as string | undefined;
  return s === 'demo' || s === 'live' ? s : undefined;
}

function weekOf(req: Request): number | undefined {
  const w = Number(req.query.week ?? req.body?.week);
  return Number.isInteger(w) && w >= 1 && w <= 18 ? w : undefined;
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/teams', (_req, res) => res.json(TEAMS));

app.get('/api/season', async (req, res, next) => {
  try {
    const data = await loadSeasonData({ source: sourceOf(req), week: weekOf(req) });
    const { probs, ratings } = analyze(data);
    res.json({
      season: data.season,
      currentWeek: data.currentWeek,
      lastWeek: data.lastWeek,
      source: data.source,
      warnings: data.warnings,
      fetchedAt: data.fetchedAt,
      games: data.games.filter((g) => g.week >= data.currentWeek),
      probs,
      ratings,
    });
  } catch (e) {
    next(e);
  }
});

app.post('/api/recommend', async (req, res, next) => {
  try {
    const entries = (req.body?.entries ?? []) as Entry[];
    if (!Array.isArray(entries)) return res.status(400).json({ error: 'entries must be an array' });
    const settings = (req.body?.settings ?? {}) as Partial<RecommendSettings>;
    const data = await loadSeasonData({ source: sourceOf(req), week: weekOf(req) });
    const { recommendations, settings: used, analysis } = recommend(data, entries, settings);
    res.json({ week: analysis.week, settings: used, recommendations, probs: analysis.probs });
  } catch (e) {
    next(e);
  }
});

app.get('/api/integrations', (_req, res) =>
  res.json(ADAPTERS.map(({ id, name, description, example, capabilities }) => ({ id, name, description, example, capabilities }))),
);

app.post('/api/import', (req, res) => {
  const adapter = getAdapter(String(req.body?.adapter ?? ''));
  if (!adapter) return res.status(400).json({ error: 'unknown adapter' });
  res.json(adapter.parse(String(req.body?.input ?? '')));
});

app.post('/api/export', (req, res) => {
  const adapter = getAdapter(String(req.body?.adapter ?? ''));
  if (!adapter) return res.status(400).json({ error: 'unknown adapter' });
  res.json({ text: adapter.exportPicks(req.body?.recommendations ?? []) });
});

const webDist = path.resolve(process.cwd(), 'dist/web');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`survivor-bot API listening on http://localhost:${port}`));
