import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CACHE_DIR = process.env.CACHE_DIR ?? path.resolve(process.cwd(), '.cache');

interface CacheRecord<T> {
  savedAt: number;
  ttlMs: number;
  data: T;
}

function fileFor(key: string) {
  return path.join(CACHE_DIR, key.replace(/[^a-z0-9._-]/gi, '_') + '.json');
}

export async function readCache<T>(key: string, allowStale = false): Promise<T | undefined> {
  try {
    const rec = JSON.parse(await readFile(fileFor(key), 'utf8')) as CacheRecord<T>;
    if (allowStale || Date.now() - rec.savedAt < rec.ttlMs) return rec.data;
  } catch {
    // missing or corrupt cache entry
  }
  return undefined;
}

export async function writeCache<T>(key: string, data: T, ttlMs: number): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  const rec: CacheRecord<T> = { savedAt: Date.now(), ttlMs, data };
  await writeFile(fileFor(key), JSON.stringify(rec));
}

export async function fetchJson<T = unknown>(url: string, timeoutMs = 15000): Promise<T> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'User-Agent': 'survivor-bot/1.0', Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.replace(/apiKey=[^&]+/, 'apiKey=***')}`);
  return (await res.json()) as T;
}
