import type { GinxResponse } from '../types/rss';
import { getToken } from './auth';
import type { PricePoint } from './backtest';

const AGENTS_API = '/api/v1/agents';

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function parseGinx<T>(res: GinxResponse<T | null>): T {
  if (res.code !== 200 && res.code !== 201) throw new Error(res.errMsg || 'request failed');
  if (res.body == null) throw new Error('empty body');
  return res.body;
}

export interface CreateShareBody {
  kind: 'doc' | 'skill';
  path?: string;
  source?: string;
  skill_dir?: string;
}

export interface CreateShareResult {
  token: string;
  url: string;
}

/** POST /agents/:name/share —— 创建公开分享链接（skills 等 per-agent 资产）。 */
export async function createAgentAssetShare(
  name: string,
  body: CreateShareBody,
): Promise<CreateShareResult> {
  const res = await fetch(`${AGENTS_API}/${encodeURIComponent(name)}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as GinxResponse<CreateShareResult | null>;
  if (!res.ok) throw new Error(json.errMsg || `HTTP ${res.status}`);
  return parseGinx(json);
}

/** POST /account/docs/share —— 为账户共享文档创建公开分享链接。 */
export async function createAccountDocShare(path: string): Promise<CreateShareResult> {
  const res = await fetch('/api/v1/account/docs/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ path }),
  });
  const json = (await res.json()) as GinxResponse<CreateShareResult | null>;
  if (!res.ok) throw new Error(json.errMsg || `HTTP ${res.status}`);
  return parseGinx(json);
}

export interface PublicShareMeta {
  token: string;
  kind: 'doc' | 'skill' | 'strategy';
  name: string;
  path?: string;
  is_dir: boolean;
  size?: number;
  content?: string;
  agent_name?: string;
  platform?: string;
  script?: string;
  runs?: unknown[];
}

/** GET /api/public/share/:token?format=json —— 无需登录读取分享内容元数据。 */
export async function fetchPublicShare(token: string): Promise<PublicShareMeta> {
  const res = await fetch(`/api/public/share/${encodeURIComponent(token)}?format=json`);
  const json = (await res.json()) as GinxResponse<PublicShareMeta | null> & { error?: string };
  if (!res.ok) throw new Error(json.errMsg || json.error || `HTTP ${res.status}`);
  if (json.body) return json.body;
  throw new Error(json.errMsg || 'empty body');
}

export function publicShareDownloadUrl(token: string): string {
  return `/api/public/share/${encodeURIComponent(token)}?download=1`;
}

/** GET /api/public/share/:token/bars —— 分享页个股 K 线，无需登录。 */
export async function fetchPublicShareBars(
  token: string,
  code: string,
  startTime: string,
  endTime: string,
): Promise<PricePoint[]> {
  const params = new URLSearchParams({
    code,
    start_time: startTime,
    end_time: endTime,
  });
  const res = await fetch(`/api/public/share/${encodeURIComponent(token)}/bars?${params}`);
  const json = (await res.json()) as GinxResponse<{ items?: { code: string; series?: PricePoint[] }[] } | null> & {
    error?: string;
  };
  if (!res.ok) throw new Error(json.errMsg || json.error || `HTTP ${res.status}`);
  const items = json.body?.items ?? [];
  return items.find((item) => item.code === code)?.series ?? items[0]?.series ?? [];
}
