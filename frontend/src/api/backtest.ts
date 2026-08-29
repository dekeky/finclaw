import type { GinxResponse } from '../types/rss';
import { getToken } from './auth';

const BACKTEST_API = '/api/v1/backtest';

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

export type IndicatorItem = {
  id: string;
  source: string;
  group: string;
  label: string;
};

export type RunRequest = {
  strategy_name: string;
  symbols?: string[];
  universe?: UniverseKind;
  index?: string | null;
  initial_cash: number;
  start_time: string;
  end_time: string;
  commission_rate?: number;
  min_commission?: number;
  stamp_tax_rate?: number;
  transfer_fee_rate?: number;
  slippage?: number;
  lot_size?: number;
  extra?: string[];
};

export type RunListItem = {
  id: string;
  name?: string;
  status: string;
  strategy_name: string;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  duration_seconds?: number | null;
  symbols: string[];
  request?: RunRequest;
};

export type EquityPoint = {
  time: string;
  equity: number | null;
};

export type PricePoint = {
  symbol: string;
  time: string;
  open?: number | null;
  high?: number | null;
  low?: number | null;
  close: number | null;
  volume?: number | null;
};

export type MarketSymbol = {
  code: string;
  name: string;
  market: string;
  kind: 'stock' | 'index';
};

export type UniverseKind = 'picks' | 'index' | 'all';

export type UniverseSelection = {
  universe: UniverseKind;
  symbols: string[];
  index?: string;
};

export type UniverseIndex = {
  code: string;
  name: string;
  size: number | null;
};

export type BenchmarkSeries = {
  code: string;
  name: string;
  series: PricePoint[];
};

export type BacktestResult = {
  metrics: Record<string, unknown>;
  equity_curve: EquityPoint[];
  trades: Record<string, unknown>[];
  orders: Record<string, unknown>[];
  prices?: PricePoint[];
  benchmarks?: BenchmarkSeries[];
  positions?: {
    symbol: string;
    quantity?: number | null;
    unrealized_pnl?: number | null;
  }[];
};

export type PositionSnapshot = {
  time: string;
  symbol: string;
  quantity?: number | null;
  entry_price?: number | null;
  close?: number | null;
  unrealized_pnl?: number | null;
  market_value?: number | null;
  equity?: number | null;
};

export type RunDetail = {
  id: string;
  name?: string;
  status: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_seconds?: number | null;
  request: RunRequest & { symbols: string[] };
  result?: BacktestResult;
  live_equity?: EquityPoint[];
  source?: string;
  error?: { message: string; traceback?: string | null };
};

export type SubmitRunRequest = {
  strategy_name: string;
  initial_cash: number;
  start_time: string;
  end_time: string;
  universe: UniverseKind;
  symbols?: string[];
  index?: string;
  commission_rate: number;
  min_commission: number;
  stamp_tax_rate: number;
  transfer_fee_rate: number;
  slippage: number;
};

export const api = {
  listIndicators: () =>
    request<{ items: IndicatorItem[] }>(`${BACKTEST_API}/indicators`),

  submitRun: (payload: SubmitRunRequest) =>
    request<{ id: string; status: string }>(`${BACKTEST_API}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),

  listRuns: () =>
    request<{ items: RunListItem[] }>(`${BACKTEST_API}/runs`).then((body) => body),

  getRun: (id: string) =>
    request<RunDetail>(`${BACKTEST_API}/runs/${encodeURIComponent(id)}`),

  renameRun: (id: string, name: string) =>
    request<RunListItem>(`${BACKTEST_API}/runs/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),

  deleteRun: (id: string) =>
    request<{ id: string }>(`${BACKTEST_API}/runs/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  getRunBlotter: (id: string) =>
    request<{ orders: Record<string, unknown>[]; trades: Record<string, unknown>[] }>(
      `${BACKTEST_API}/runs/${encodeURIComponent(id)}/blotter`,
    ),

  getRunPositions: (id: string, query?: { date?: string; symbol?: string }) => {
    const params = new URLSearchParams();
    if (query?.date) params.set('date', query.date);
    if (query?.symbol) params.set('symbol', query.symbol);
    const suffix = params.toString();
    return request<{ items: PositionSnapshot[] }>(
      `${BACKTEST_API}/runs/${encodeURIComponent(id)}/positions${suffix ? `?${suffix}` : ''}`,
    );
  },

  listSymbols: (query?: { q?: string; kind?: 'stock' | 'index'; codes?: string }) => {
    const params = new URLSearchParams();
    if (query?.q) params.set('q', query.q);
    if (query?.kind) params.set('kind', query.kind);
    if (query?.codes) params.set('codes', query.codes);
    const suffix = params.toString();
    return request<{ items: MarketSymbol[] }>(`${BACKTEST_API}/symbols${suffix ? `?${suffix}` : ''}`);
  },

  listUniverseStocks: (q?: string) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    const suffix = params.toString();
    return request<{ items: MarketSymbol[] }>(`${BACKTEST_API}/universe/stocks${suffix ? `?${suffix}` : ''}`);
  },

  listUniverseIndexes: () =>
    request<{ items: UniverseIndex[] }>(`${BACKTEST_API}/universe/indexes`),

  getBars: (codes: string[], startTime: string, endTime: string, indexes: string[] = []) => {
    const params = new URLSearchParams({
      start_time: startTime,
      end_time: endTime,
    });
    if (codes.length) params.set('codes', codes.join(','));
    if (indexes.length) params.set('indexes', indexes.join(','));
    return request<{ items: BenchmarkSeries[] }>(`${BACKTEST_API}/market/bars?${params}`);
  },

  getFina: (codes: string[], startTime?: string, endTime?: string) => {
    const params = new URLSearchParams({ codes: codes.join(',') });
    if (startTime) params.set('start_time', startTime);
    if (endTime) params.set('end_time', endTime);
    return request<{ items: { code: string; name: string; rows: Record<string, unknown>[] }[] }>(
      `${BACKTEST_API}/market/fina?${params}`,
    );
  },
};

export async function submitBacktestRun(req: SubmitRunRequest): Promise<{ id: string; status: string }> {
  return api.submitRun(req);
}

export async function listBacktestRuns(): Promise<RunListItem[]> {
  const body = await api.listRuns();
  return body.items ?? [];
}

export async function getBacktestRun(id: string): Promise<RunDetail> {
  return api.getRun(id);
}

export function runDisplayName(item: { name?: string | null; strategy_name?: string | null }): string {
  return item.name?.trim() || item.strategy_name?.trim() || '';
}

export async function renameBacktestRun(id: string, name: string): Promise<RunListItem> {
  return api.renameRun(id, name);
}

export async function deleteBacktestRun(id: string): Promise<void> {
  await api.deleteRun(id);
}

export async function listMarketSymbols(query?: { q?: string; kind?: 'stock' | 'index'; codes?: string }): Promise<MarketSymbol[]> {
  const body = await api.listSymbols(query);
  return body.items ?? [];
}

export async function getMarketBars(
  codes: string[],
  startTime: string,
  endTime: string,
  indexes: string[] = [],
): Promise<BenchmarkSeries[]> {
  const body = await api.getBars(codes, startTime, endTime, indexes);
  return body.items ?? [];
}

export async function listUniverseStocks(q?: string): Promise<MarketSymbol[]> {
  const body = await api.listUniverseStocks(q);
  return body.items ?? [];
}

export async function listUniverseIndexes(): Promise<UniverseIndex[]> {
  const body = await api.listUniverseIndexes();
  return body.items ?? [];
}

export async function getMarketFina(
  codes: string[],
  startTime?: string,
  endTime?: string,
): Promise<{ code: string; name: string; rows: Record<string, unknown>[] }[]> {
  const body = await api.getFina(codes, startTime, endTime);
  return body.items ?? [];
}
