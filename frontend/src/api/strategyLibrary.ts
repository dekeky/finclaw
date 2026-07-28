import type { GinxResponse } from '../types/rss';
import type { StrategyPlatform } from '@/lib/strategyPlatforms';
import type { StrategyDetail } from './strategies';
import { getToken } from './auth';

const LIBRARY_API = '/api/v1/strategy-library';

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseGinx<T>(res: Response): Promise<GinxResponse<T>> {
  let json: GinxResponse<T> | null = null;
  try {
    json = (await res.json()) as GinxResponse<T>;
  } catch {
    // non-JSON
  }
  if (!res.ok) {
    throw new Error(json?.errMsg || `HTTP ${res.status}`);
  }
  if (!json) throw new Error('Empty response');
  if (json.errMsg) throw new Error(json.errMsg);
  if (typeof json.code === 'number' && json.code !== 200 && json.code !== 201) {
    throw new Error(`unexpected code: ${json.code}`);
  }
  return json;
}

export interface StrategyLibrarySummary {
  id: string;
  author_name: string;
  title: string;
  summary: string;
  platform: StrategyPlatform;
  source_name?: string;
  install_count: number;
  created_at: string;
  updated_at: string;
}

export interface StrategyLibraryDetail extends StrategyLibrarySummary {
  script: string;
  user_id: string;
}

export interface StrategyLibraryListBody {
  entries: StrategyLibrarySummary[];
  total: number;
}

export interface ShareStrategyRequest {
  strategy_name: string;
  title?: string;
  summary?: string;
}

export interface InstallLibraryEntryRequest {
  name: string;
}

/** GET /strategy-library — list shared strategies. */
export async function listStrategyLibrary(search?: string): Promise<StrategyLibrarySummary[]> {
  const qs = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
  const res = await fetch(`${LIBRARY_API}${qs}`, { headers: authHeaders() });
  const body = await parseGinx<StrategyLibraryListBody | null>(res);
  return body.body?.entries ?? [];
}

/** GET /strategy-library/:id — fetch one entry with script. */
export async function getStrategyLibraryEntry(id: string): Promise<StrategyLibraryDetail> {
  const res = await fetch(`${LIBRARY_API}/${encodeURIComponent(id)}`, { headers: authHeaders() });
  const body = await parseGinx<StrategyLibraryDetail | null>(res);
  if (!body.body) throw new Error('empty body');
  return body.body;
}

/** POST /strategy-library — share a user strategy to the library. */
export async function shareStrategyToLibrary(req: ShareStrategyRequest): Promise<StrategyLibraryDetail> {
  const res = await fetch(LIBRARY_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(req),
  });
  const body = await parseGinx<StrategyLibraryDetail | null>(res);
  if (!body.body) throw new Error('empty body');
  return body.body;
}

/** POST /strategy-library/:id/install — create a local strategy from library entry. */
export async function installStrategyFromLibrary(id: string, req: InstallLibraryEntryRequest): Promise<StrategyDetail> {
  const res = await fetch(`${LIBRARY_API}/${encodeURIComponent(id)}/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(req),
  });
  const body = await parseGinx<StrategyDetail | null>(res);
  if (!body.body) throw new Error('empty body');
  return body.body;
}

/** DELETE /strategy-library/:id — remove own shared entry. */
export async function deleteStrategyLibraryEntry(id: string): Promise<void> {
  const res = await fetch(`${LIBRARY_API}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  await parseGinx<{ deleted: string } | null>(res);
}
