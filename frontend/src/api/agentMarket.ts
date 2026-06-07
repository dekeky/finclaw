import type { GinxResponse } from '../types/rss';
import { getToken } from './auth';
import type { AgentModelProvider } from './agents';

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Agent 市场模板（与后端 market.AgentMeta 对齐）。 */
export interface MarketTemplate {
  agentName: string;
  category: string;
  displayName: string;
  summary: string;
  latestVersion: string;
  versions: string[];
  updatedAt: string;
}

export interface MarketFileEntry {
  path: string;
  size: number;
}

/** GET /api/v1/market/templates/:name —— 模板详情（含文件树）。 */
export interface MarketTemplateDetail extends MarketTemplate {
  files: MarketFileEntry[];
}

interface MarketTemplateListBody {
  templates: MarketTemplate[];
  total: number;
}

interface MarketCategoriesBody {
  categories: string[];
}

interface MarketFileBody {
  path: string;
  content: string;
}

/** POST /api/v1/market/install —— 从模板创建 Agent。 */
export interface InstallTemplateRequest {
  template: string;
  version?: string;
  name: string;
  /** 复用已有 Agent 的模型配置（含密钥），设置后无需再填 model_provider。 */
  from_agent?: string;
  /** 手动填写模型配置；与 from_agent 二选一。 */
  model_provider?: AgentModelProvider;
}

export interface InstallTemplateResult {
  name: string;
  model_provider: string;
  template: string;
  /** "workspace" | "skill" */
  kind: string;
  skill_dir?: string;
}

async function parseGinx<T>(res: Response): Promise<T> {
  let json: GinxResponse<T> | null = null;
  try {
    json = (await res.json()) as GinxResponse<T>;
  } catch {
    // 非 JSON 响应
  }
  if (!res.ok) {
    throw new Error(json?.errMsg || `HTTP ${res.status}`);
  }
  if (!json) {
    throw new Error('Empty response');
  }
  if (json.errMsg) {
    throw new Error(json.errMsg);
  }
  if (typeof json.code === 'number' && json.code !== 200 && json.code !== 201) {
    throw new Error(`unexpected code: ${json.code}`);
  }
  return json.body;
}

/** GET /api/v1/market/categories —— 市场支持的运行时类别。 */
export async function listMarketCategories(): Promise<string[]> {
  const res = await fetch('/api/v1/market/categories', { headers: authHeaders() });
  const body = await parseGinx<MarketCategoriesBody | null>(res);
  return body?.categories ?? [];
}

/** GET /api/v1/market/templates —— 列出市场模板，可按 category 过滤。 */
export async function listMarketTemplates(category?: string): Promise<MarketTemplate[]> {
  const qs = category ? `?category=${encodeURIComponent(category)}` : '';
  const res = await fetch(`/api/v1/market/templates${qs}`, { headers: authHeaders() });
  const body = await parseGinx<MarketTemplateListBody | null>(res);
  return body?.templates ?? [];
}

/** GET /api/v1/market/templates/:name —— 模板详情。 */
export async function getMarketTemplate(name: string): Promise<MarketTemplateDetail> {
  const res = await fetch(`/api/v1/market/templates/${encodeURIComponent(name)}`, {
    headers: authHeaders(),
  });
  const body = await parseGinx<MarketTemplateDetail | null>(res);
  if (!body) throw new Error('empty body');
  return body;
}

/** GET /api/v1/market/templates/:name/file —— 读取模板内的单个文件内容。 */
export async function getMarketTemplateFile(
  name: string,
  path: string,
  version?: string,
): Promise<string> {
  const params = new URLSearchParams({ path });
  if (version) params.set('version', version);
  const res = await fetch(
    `/api/v1/market/templates/${encodeURIComponent(name)}/file?${params.toString()}`,
    { headers: authHeaders() },
  );
  const body = await parseGinx<MarketFileBody | null>(res);
  return body?.content ?? '';
}

/** POST /api/v1/market/install —— 下载模板并创建 Agent。 */
export async function installMarketTemplate(
  req: InstallTemplateRequest,
): Promise<InstallTemplateResult> {
  const res = await fetch('/api/v1/market/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(req),
  });
  const body = await parseGinx<InstallTemplateResult | null>(res);
  if (!body) throw new Error('empty body');
  return body;
}

/** POST /api/v1/market/upload —— 将 Agent 工作区上传到 AgentHub 市场。 */
export interface UploadAgentRequest {
  agentName: string;
  category?: string;
  version?: string;
  displayName?: string;
  summary?: string;
  uploadToken?: string;
}

export interface UploadAgentResult {
  agentName: string;
  category: string;
  displayName: string;
  summary: string;
  latestVersion: string;
}

export async function uploadAgentToMarket(
  req: UploadAgentRequest,
): Promise<UploadAgentResult> {
  const res = await fetch('/api/v1/market/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(req),
  });
  const body = await parseGinx<UploadAgentResult | null>(res);
  if (!body) throw new Error('empty body');
  return body;
}

export interface GenerateMarketSummaryRequest {
  prompt?: string;
  current_summary?: string;
  display_name?: string;
}

export interface GenerateMarketSummaryBody {
  summary: string;
}

/** POST /api/v1/agents/:name/market-summary/generate —— AI 润色市场简介。 */
export async function generateMarketSummary(
  agentName: string,
  req: GenerateMarketSummaryRequest = {},
): Promise<GenerateMarketSummaryBody> {
  const res = await fetch(
    `/api/v1/agents/${encodeURIComponent(agentName)}/market-summary/generate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(req),
    },
  );
  const body = await parseGinx<GenerateMarketSummaryBody | null>(res);
  if (!body) throw new Error('empty body');
  return body;
}
