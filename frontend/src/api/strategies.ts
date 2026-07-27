import type { GinxResponse } from '../types/rss';
import type { StrategyPlatform } from '@/lib/strategyPlatforms';
import { getToken } from './auth';

const STRATEGIES_API = '/api/v1/strategies';

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

export interface StrategySummary {
  name: string;
  platform: StrategyPlatform;
  path: string;
  updated_at: string;
}

export interface StrategyDetail extends StrategySummary {
  script: string;
  created_at: string;
}

export interface StrategyListBody {
  strategies: StrategySummary[];
  total: number;
}

export interface CreateStrategyRequest {
  name: string;
  platform?: StrategyPlatform;
  script?: string;
  agent?: string;
}

export interface UpdateStrategyRequest {
  name: string;
  platform?: StrategyPlatform;
  script?: string;
}

/** Workspace-relative path for a strategy file. */
export function strategyRelPath(name: string): string {
  return `strategies/${name}.py`;
}

/** GET /strategies — list saved strategies. */
export async function listStrategies(): Promise<StrategySummary[]> {
  const res = await fetch(STRATEGIES_API, { headers: authHeaders() });
  const body = await parseGinx<StrategyListBody | null>(res);
  return body.body?.strategies ?? [];
}

/** GET /strategies/:name — fetch one strategy with script content. */
export async function getStrategy(name: string): Promise<StrategyDetail> {
  const res = await fetch(`${STRATEGIES_API}/${encodeURIComponent(name)}`, { headers: authHeaders() });
  const body = await parseGinx<StrategyDetail | null>(res);
  if (!body.body) throw new Error('empty body');
  return body.body;
}

/** POST /strategies — create a strategy. */
export async function createStrategy(req: CreateStrategyRequest): Promise<StrategyDetail> {
  const res = await fetch(STRATEGIES_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(req),
  });
  const body = await parseGinx<StrategyDetail | null>(res);
  if (!body.body) throw new Error('empty body');
  return body.body;
}

/** PUT /strategies/:name — update a strategy. */
export async function updateStrategy(name: string, req: UpdateStrategyRequest): Promise<StrategyDetail> {
  const res = await fetch(`${STRATEGIES_API}/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(req),
  });
  const body = await parseGinx<StrategyDetail | null>(res);
  if (!body.body) throw new Error('empty body');
  return body.body;
}

/** POST /strategies/:name/sync — push canonical strategy file into agent workspace. */
export async function syncStrategyToAgent(name: string, agent: string): Promise<StrategyDetail> {
  const res = await fetch(`${STRATEGIES_API}/${encodeURIComponent(name)}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ agent }),
  });
  const body = await parseGinx<StrategyDetail | null>(res);
  if (!body.body) throw new Error('empty body');
  return body.body;
}

/** POST /strategies/:name/pull — sync strategy file from agent workspace back to canonical store. */
export async function pullStrategyFromAgent(name: string, agent: string): Promise<StrategyDetail> {
  const res = await fetch(`${STRATEGIES_API}/${encodeURIComponent(name)}/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ agent }),
  });
  const body = await parseGinx<StrategyDetail | null>(res);
  if (!body.body) throw new Error('empty body');
  return body.body;
}

/** DELETE /strategies/:name — remove a strategy. */
export async function deleteStrategy(name: string): Promise<void> {
  const res = await fetch(`${STRATEGIES_API}/${encodeURIComponent(name)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  await parseGinx<{ deleted: string } | null>(res);
}
