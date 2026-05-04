import type { GinxResponse } from '../types/rss';

/** Agent 列表响应（来自后端 /agents GET）。 */
export interface AgentListBody {
  agents: string[];
  total: number;
}

/** 创建 Agent 时使用的模型提供方配置（与后端 ModelProvider 对齐）。 */
export interface AgentModelProvider {
  /** 例如 `deepseek-chat`、`gpt-4o`，用于在本地存储路径中区分。 */
  model_name: string;
  /** 实际请求 LLM 时使用的模型名（与 model_name 可不同）。 */
  model: string;
  /** OpenAI 兼容接口的 BaseURL，例如 `https://api.deepseek.com/v1`。 */
  api_base: string;
  /** API Key（仅本地保存于后端配置，不在前端持久化）。 */
  api_key: string;
}

export interface CreateAgentRequest {
  name: string;
  model_provider: AgentModelProvider;
}

/** 创建/删除接口返回的结构。 */
export interface AgentStatusBody {
  name: string;
  /** 仅创建时返回。 */
  model_provider?: string;
}

async function parseGinx<T>(res: Response): Promise<GinxResponse<T>> {
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
  return json;
}

/** GET /agents —— 列出所有 Agent。 */
export async function listAgents(): Promise<string[]> {
  const res = await fetch('/agents');
  const body = await parseGinx<AgentListBody | null>(res);
  return body.body?.agents ?? [];
}

/** POST /agents —— 创建一个 Agent。 */
export async function createAgent(req: CreateAgentRequest): Promise<AgentStatusBody> {
  const res = await fetch('/agents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const body = await parseGinx<AgentStatusBody | null>(res);
  if (!body.body) throw new Error('empty body');
  return body.body;
}

/** DELETE /agents/:name —— 停止并删除 Agent。 */
export async function deleteAgent(name: string): Promise<void> {
  const res = await fetch(`/agents/${encodeURIComponent(name)}`, { method: 'DELETE' });
  await parseGinx<AgentStatusBody | null>(res);
}
