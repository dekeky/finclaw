import type { GinxResponse } from '../types/api';
import type { BacktestResult, EquityPoint, RunRequest, UniverseKind } from './backtest';
import { getToken } from './auth';

const PAPER_API = '/api/v1/paper';

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

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: 'no-store', headers: { ...authHeaders(), ...init?.headers } });
  const body = await parseGinx<T | null>(res);
  if (res.status === 204) return undefined as T;
  if (body.body === null || body.body === undefined) {
    throw new Error('empty body');
  }
  return body.body;
}

export type PaperStatus = 'running' | 'paused' | 'catching_up' | 'failed';

export type PaperSession = {
  id: string;
  name: string;
  status: PaperStatus;
  strategy_name: string;
  strategy_id?: string;
  strategy_missing?: boolean;
  go_live: string;
  engine_start: string;
  last_bar_date?: string;
  last_run_id?: string;
  last_error?: string;
  initial_cash: number;
  equity: number;
  return_pct: number;
  universe: UniverseKind | string;
  symbols?: string[];
  index?: string;
  created_at: string;
  updated_at: string;
  request?: RunRequest & { symbols?: string[] };
  equity_curve?: EquityPoint[];
};

export type PaperSessionDetail = PaperSession & {
  result?: BacktestResult;
  source?: string;
};

export type CreatePaperSessionRequest = {
  name?: string;
  strategy_name?: string;
  strategy_id?: string;
  from_run_id?: string;
  initial_cash?: number;
  universe?: UniverseKind | string;
  symbols?: string[];
  index?: string;
  commission_rate?: number;
  min_commission?: number;
  stamp_tax_rate?: number;
  transfer_fee_rate?: number;
  slippage?: number;
};

export async function listPaperSessions(query?: {
  strategy_name?: string;
  strategy_id?: string;
}): Promise<PaperSession[]> {
  const params = new URLSearchParams();
  if (query?.strategy_name) params.set('strategy_name', query.strategy_name);
  if (query?.strategy_id) params.set('strategy_id', query.strategy_id);
  const suffix = params.toString();
  const body = await request<{ items: PaperSession[] }>(
    `${PAPER_API}/sessions${suffix ? `?${suffix}` : ''}`,
  );
  return body.items ?? [];
}

export async function getPaperSession(id: string): Promise<PaperSessionDetail> {
  return request<PaperSessionDetail>(`${PAPER_API}/sessions/${encodeURIComponent(id)}`);
}

export async function createPaperSession(payload: CreatePaperSessionRequest): Promise<PaperSessionDetail> {
  return request<PaperSessionDetail>(`${PAPER_API}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function renamePaperSession(id: string, name: string): Promise<PaperSession> {
  return request<PaperSession>(`${PAPER_API}/sessions/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export async function pausePaperSession(id: string): Promise<PaperSessionDetail> {
  return request<PaperSessionDetail>(`${PAPER_API}/sessions/${encodeURIComponent(id)}/pause`, {
    method: 'POST',
  });
}

export async function resumePaperSession(id: string): Promise<PaperSessionDetail> {
  return request<PaperSessionDetail>(`${PAPER_API}/sessions/${encodeURIComponent(id)}/resume`, {
    method: 'POST',
  });
}

export async function restartPaperSession(id: string): Promise<PaperSessionDetail> {
  return request<PaperSessionDetail>(`${PAPER_API}/sessions/${encodeURIComponent(id)}/restart`, {
    method: 'POST',
  });
}

export async function syncPaperSession(id: string): Promise<PaperSessionDetail> {
  return request<PaperSessionDetail>(`${PAPER_API}/sessions/${encodeURIComponent(id)}/sync`, {
    method: 'POST',
  });
}

export async function deletePaperSession(id: string): Promise<void> {
  await request<{ id: string }>(`${PAPER_API}/sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
