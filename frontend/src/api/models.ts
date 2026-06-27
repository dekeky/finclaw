import type { GinxResponse } from '../types/rss';
import type { AgentModelProvider, ModelProbeBody } from './agents';
import { getToken } from './auth';

const MODELS_API = '/api/v1/models';

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

export interface ModelProfileSummary {
  display_name: string;
  model: string;
  api_base: string;
  has_api_key: boolean;
}

export interface ModelProfileDetail extends ModelProfileSummary {
  model_name?: string;
  /** Present on GET /models/:name for the authenticated owner. */
  api_key?: string;
}

export interface ModelListBody {
  models: ModelProfileSummary[];
  total: number;
}

export interface CreateModelRequest {
  display_name: string;
  model_name?: string;
  model: string;
  api_base: string;
  api_key: string;
}

export interface UpdateModelRequest {
  display_name: string;
  model_name?: string;
  model: string;
  api_base: string;
  api_key?: string;
}

export function modelDisplayName(m: Pick<ModelProfileSummary, 'display_name'>): string {
  return m.display_name.trim();
}

let modelsListCache: ModelProfileSummary[] | null = null;
let modelsListInflight: Promise<ModelProfileSummary[]> | null = null;

export function getCachedModels(): ModelProfileSummary[] | null {
  return modelsListCache;
}

export function invalidateModelsCache() {
  modelsListCache = null;
}

/** Warm the model list cache (e.g. when entering chat). */
export function prefetchModels(): Promise<ModelProfileSummary[]> {
  if (modelsListInflight) return modelsListInflight;
  modelsListInflight = listModels()
    .then((models) => {
      modelsListCache = models;
      return models;
    })
    .finally(() => {
      modelsListInflight = null;
    });
  return modelsListInflight;
}

/** GET /models — list saved model profiles (updates in-memory cache). */
export async function listModels(): Promise<ModelProfileSummary[]> {
  const res = await fetch(MODELS_API, { headers: authHeaders() });
  const body = await parseGinx<ModelListBody | null>(res);
  const models = body.body?.models ?? [];
  modelsListCache = models;
  return models;
}

/** GET /models/:display_name — fetch one model profile (includes api_key for owner). */
export async function getModel(displayName: string): Promise<ModelProfileDetail> {
  const res = await fetch(`${MODELS_API}/${encodeURIComponent(displayName)}`, { headers: authHeaders() });
  const body = await parseGinx<ModelProfileDetail | null>(res);
  if (!body.body) throw new Error('empty body');
  return body.body;
}

/** POST /models — create a model profile. */
export async function createModel(req: CreateModelRequest): Promise<ModelProfileDetail> {
  const res = await fetch(MODELS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(req),
  });
  const body = await parseGinx<ModelProfileDetail | null>(res);
  if (!body.body) throw new Error('empty body');
  invalidateModelsCache();
  return body.body;
}

/** PUT /models/:display_name — update a model profile. */
export async function updateModel(displayName: string, req: UpdateModelRequest): Promise<ModelProfileDetail> {
  const res = await fetch(`${MODELS_API}/${encodeURIComponent(displayName)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(req),
  });
  const body = await parseGinx<ModelProfileDetail | null>(res);
  if (!body.body) throw new Error('empty body');
  invalidateModelsCache();
  return body.body;
}

/** DELETE /models/:display_name — remove a model profile. */
export async function deleteModel(displayName: string): Promise<void> {
  const res = await fetch(`${MODELS_API}/${encodeURIComponent(displayName)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  await parseGinx<{ deleted: string } | null>(res);
  invalidateModelsCache();
}

/** POST /models/model-probe — test model connectivity. */
export async function probeModelProfile(
  modelProvider: AgentModelProvider,
  displayName?: string,
): Promise<ModelProbeBody> {
  const res = await fetch(`${MODELS_API}/model-probe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      display_name: displayName,
      model_provider: modelProvider,
    }),
  });
  let json: GinxResponse<ModelProbeBody | null> | null = null;
  try {
    json = (await res.json()) as GinxResponse<ModelProbeBody | null>;
  } catch {
    // non-JSON
  }
  if (!json?.body) {
    throw new Error(json?.errMsg || `HTTP ${res.status}`);
  }
  if (json.errMsg) throw new Error(json.errMsg);
  if (!res.ok && !json.body.ok) return json.body;
  if (!res.ok) throw new Error(json.errMsg || `HTTP ${res.status}`);
  return json.body;
}
