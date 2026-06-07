import type { GinxResponse } from '../types/rss';
import { getToken } from './auth';

const AGENTS_API = '/api/v1/agents';

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Agent 列表项（来自后端 GET /api/v1/agents）。 */
export interface AgentSummary {
  name: string;
  has_avatar: boolean;
}

/** Agent 列表响应（来自后端 GET /api/v1/agents）。 */
export interface AgentListBody {
  agents: AgentSummary[];
  total: number;
}

/** 创建 Agent 时使用的模型提供方配置（与后端 ModelProvider 对齐）。 */
export interface AgentModelProvider {
  /** PicoClaw 配置别名；省略时后端用 model 填充，前端无需填写。 */
  model_name?: string;
  /** provider/模型 ID，例如 `deepseek/deepseek-chat`。 */
  model: string;
  /** OpenAI 兼容接口的 BaseURL，例如 `https://api.deepseek.com/v1`。 */
  api_base: string;
  /** API Key（仅本地保存于后端配置，不在前端持久化）。 */
  api_key: string;
}

export interface CreateAgentRequest {
  name: string;
  /** 复用已有 Agent 的模型配置（含密钥），设置后无需再填 model_provider。 */
  from_agent?: string;
  /** 手动填写模型配置；与 from_agent 二选一。 */
  model_provider?: AgentModelProvider;
}

/**
 * PUT /api/v1/agents/:name — 与后端 update 对齐。
 * api_key：可传空字符串；若服务端已有密钥则从当前运行时配置沿用（参见后端 resolveUpdateAPIKey）。
 */
export interface UpdateAgentRequest {
  model_provider: AgentModelProvider;
}

/** POST /api/v1/agents/model-probe — 连通性检查（不保存配置）。 */
export interface ModelProbeBody {
  ok: boolean;
  message: string;
  latency_ms: number;
}

export interface ProbeModelProviderRequest {
  model_provider: AgentModelProvider;
  /** api_key 为空时，从该 Agent 沿用已保存密钥。 */
  agent_name?: string;
}

/** 创建/删除接口返回的结构。 */
export interface AgentStatusBody {
  name: string;
  /** 仅创建时返回。 */
  model_provider?: string;
}

/** GET /api/v1/agents/:name — 服务端可见的模型配置（不含密钥，与后端 agentModelProviderInfo 对齐）。 */
export interface AgentModelProviderInfo {
  /** provider/模型 ID，例如 `deepseek/deepseek-chat`。 */
  model: string;
  api_base: string;
  /** 后端是否配置了非空 API Key（不返回具体内容）。 */
  has_api_key: boolean;
}

/** GET /api/v1/agents/:name — 与后端 agentDetailResp 对齐。 */
export interface AgentDetailBody {
  name: string;
  has_avatar: boolean;
  workspace?: string;
  model_provider: AgentModelProviderInfo;
}

/** PicoClaw 工作区人设文件（AGENT.md / SOUL.md / USER.md）。 */
export interface AgentPersonaFile {
  name: string;
  content: string;
  exists: boolean;
}

export interface AgentWorkspaceFilesBody {
  workspace: string;
  files: AgentPersonaFile[];
}

/** GET /api/v1/agents/:name/skills — 与后端 AgentSkillsSummary 对齐。 */
export interface AgentSubSkillItem {
  name: string;
  description?: string;
  file: string;
}

export interface AgentSkillItem {
  name: string;
  description: string;
  /** workspace | global | builtin */
  source: string;
  /** 磁盘上 skill 所在的文件夹名（用于读取文件内容）。 */
  dir?: string;
  /** AGENT.md frontmatter 未限制时全部为 true；有限制时仅 listed skill 为 true。 */
  active: boolean;
  sub_skills?: AgentSubSkillItem[];
}

/** GET /api/v1/agents/:name/skills/file —— 单个 skill 文件内容。 */
export interface SkillFileBody {
  name: string;
  content: string;
  size: number;
}

export interface AgentSkillsBody {
  workspace: string;
  configured_skills?: string[];
  skills: AgentSkillItem[];
  total_count: number;
}

export type PersonaFileName = 'AGENT.md' | 'SOUL.md' | 'USER.md';

/** 人设文件在 UI 中的展示名称（文件名 AGENT.md 等仅用于 API）。 */
export const PERSONA_FILE_LABELS: Record<PersonaFileName, { title: string }> = {
  'AGENT.md': { title: '行为指南' },
  'SOUL.md': { title: '灵魂' },
  'USER.md': { title: '用户偏好' },
};

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
export async function listAgents(): Promise<AgentSummary[]> {
  const res = await fetch(AGENTS_API, { headers: authHeaders() });
  const body = await parseGinx<AgentListBody | null>(res);
  return body.body?.agents ?? [];
}

/** 带鉴权的 Agent 头像 URL（img 标签可直接使用，Auth 中间件支持 ?token=）。 */
export function agentAvatarUrl(name: string, revision = 0): string | null {
  const token = getToken();
  if (!token) return null;
  const base = `${AGENTS_API}/${encodeURIComponent(name)}/avatar?token=${encodeURIComponent(token)}`;
  return revision > 0 ? `${base}&v=${revision}` : base;
}

/** PATCH /agents/:name/profile —— 重命名 Agent。 */
export async function renameAgent(name: string, newName: string): Promise<AgentStatusBody> {
  const res = await fetch(`${AGENTS_API}/${encodeURIComponent(name)}/profile`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ new_name: newName }),
  });
  const body = await parseGinx<AgentStatusBody | null>(res);
  if (!body.body) throw new Error('empty body');
  return body.body;
}

/** PUT /agents/:name/avatar —— 上传或替换头像（base64 / data URL）。 */
export async function uploadAgentAvatar(name: string, data: string): Promise<{ has_avatar: boolean }> {
  const res = await fetch(`${AGENTS_API}/${encodeURIComponent(name)}/avatar`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ data }),
  });
  const body = await parseGinx<{ has_avatar: boolean } | null>(res);
  if (!body.body) throw new Error('empty body');
  return body.body;
}

/** DELETE /agents/:name/avatar —— 移除自定义头像。 */
export async function deleteAgentAvatar(name: string): Promise<{ has_avatar: boolean }> {
  const res = await fetch(`${AGENTS_API}/${encodeURIComponent(name)}/avatar`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  const body = await parseGinx<{ has_avatar: boolean } | null>(res);
  if (!body.body) throw new Error('empty body');
  return body.body;
}

/** GET /agents/:name —— 查询单个 Agent 的运行时配置摘要（无 API Key）。 */
export async function getAgent(name: string): Promise<AgentDetailBody> {
  const res = await fetch(`${AGENTS_API}/${encodeURIComponent(name)}`, { headers: authHeaders() });
  let json: GinxResponse<AgentDetailBody | null> | null = null;
  try {
    json = (await res.json()) as GinxResponse<AgentDetailBody | null>;
  } catch {
    // 非 JSON（常见于 Gin 原生 404 文本）
  }
  if (!res.ok) {
    if (res.status === 404 && !json?.errMsg) {
      throw new Error(
        'HTTP 404：后端未识别 GET /api/v1/agents/:name（多半未重启旧进程）。请重新编译并重启 Agent（cmd/agent）后再试。',
      );
    }
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
  if (!json.body) {
    throw new Error('empty body');
  }
  return json.body;
}

/** POST /agents —— 创建一个 Agent。 */
export async function createAgent(req: CreateAgentRequest): Promise<AgentStatusBody> {
  const res = await fetch(AGENTS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(req),
  });
  const body = await parseGinx<AgentStatusBody | null>(res);
  if (!body.body) throw new Error('empty body');
  return body.body;
}

/** POST /agents/model-probe —— 测试模型配置连通性。 */
export async function probeModelProvider(
  modelProvider: AgentModelProvider,
  agentName?: string,
): Promise<ModelProbeBody> {
  const payload: ProbeModelProviderRequest = { model_provider: modelProvider };
  if (agentName) payload.agent_name = agentName;
  const res = await fetch(`${AGENTS_API}/model-probe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
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
  if (json.errMsg) {
    throw new Error(json.errMsg);
  }
  if (!res.ok && !json.body.ok) {
    return json.body;
  }
  if (!res.ok) {
    throw new Error(json.errMsg || `HTTP ${res.status}`);
  }
  return json.body;
}

/** PUT /agents/:name —— 更新模型配置并重启该 Agent。 */
export async function updateAgent(name: string, req: UpdateAgentRequest): Promise<AgentStatusBody> {
  const res = await fetch(`${AGENTS_API}/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(req),
  });
  const body = await parseGinx<AgentStatusBody | null>(res);
  if (!body.body) throw new Error('empty body');
  return body.body;
}

/** DELETE /agents/:name —— 停止并删除 Agent（含磁盘工作区与配置）。 */
export async function deleteAgent(name: string): Promise<void> {
  const res = await fetch(`${AGENTS_API}/${encodeURIComponent(name)}`, { method: 'DELETE', headers: authHeaders() });
  await parseGinx<AgentStatusBody | null>(res);
}

/** GET /agents/:name/skills —— 列出 Agent 可用 Skill。 */
export async function getAgentSkills(name: string): Promise<AgentSkillsBody> {
  const res = await fetch(`${AGENTS_API}/${encodeURIComponent(name)}/skills`, { headers: authHeaders() });
  let json: GinxResponse<AgentSkillsBody | null> | null = null;
  try {
    json = (await res.json()) as GinxResponse<AgentSkillsBody | null>;
  } catch {
    // 非 JSON
  }
  if (!res.ok) {
    if (res.status === 404 && !json?.errMsg) {
      throw new Error(
        'HTTP 404：后端未识别 GET /api/v1/agents/:name/skills。请重新编译并重启 Agent（cmd/agent）后再试。',
      );
    }
    throw new Error(json?.errMsg || `HTTP ${res.status}`);
  }
  if (!json) throw new Error('Empty response');
  if (json.errMsg) throw new Error(json.errMsg);
  if (typeof json.code === 'number' && json.code !== 200 && json.code !== 201) {
    throw new Error(`unexpected code: ${json.code}`);
  }
  if (!json.body) throw new Error('empty body');
  return json.body;
}

/** GET /agents/:name/skills/file —— 读取单个 skill 文件内容。 */
export async function getAgentSkillFile(
  name: string,
  source: string,
  skill: string,
  file: string,
): Promise<SkillFileBody> {
  const params = new URLSearchParams({ source, skill, file });
  const res = await fetch(
    `${AGENTS_API}/${encodeURIComponent(name)}/skills/file?${params.toString()}`,
    { headers: authHeaders() },
  );
  let json: GinxResponse<SkillFileBody | null> | null = null;
  try {
    json = (await res.json()) as GinxResponse<SkillFileBody | null>;
  } catch {
    // 非 JSON
  }
  if (!res.ok) {
    if (res.status === 404 && !json?.errMsg) {
      throw new Error(
        'HTTP 404：后端未识别 GET /api/v1/agents/:name/skills/file。请重新编译并重启 Agent（cmd/agent）后再试。',
      );
    }
    throw new Error(json?.errMsg || `HTTP ${res.status}`);
  }
  if (!json) throw new Error('Empty response');
  if (json.errMsg) throw new Error(json.errMsg);
  if (typeof json.code === 'number' && json.code !== 200 && json.code !== 201) {
    throw new Error(`unexpected code: ${json.code}`);
  }
  if (!json.body) throw new Error('empty body');
  return json.body;
}

/** PUT /agents/:name/skills/file —— 写入单个 skill 文件内容。 */
export async function writeAgentSkillFile(
  name: string,
  source: string,
  skill: string,
  file: string,
  content: string,
): Promise<SkillFileBody> {
  const params = new URLSearchParams({ source, skill, file });
  const res = await fetch(
    `${AGENTS_API}/${encodeURIComponent(name)}/skills/file?${params.toString()}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ content }),
    },
  );
  const body = await parseGinx<SkillFileBody | null>(res);
  if (!body.body) throw new Error('empty body');
  return body.body;
}

/** DELETE /agents/:name/skills —— 删除整个 skill 包。 */
export async function deleteAgentSkill(
  name: string,
  source: string,
  skill: string,
): Promise<void> {
  const params = new URLSearchParams({ source, skill });
  const res = await fetch(
    `${AGENTS_API}/${encodeURIComponent(name)}/skills?${params.toString()}`,
    { method: 'DELETE', headers: authHeaders() },
  );
  await parseGinx<unknown>(res);
}

export interface SkillDirEntry {
  name: string;
  size: number;
  mod_time: string;
  is_dir: boolean;
}

export interface SkillDirListBody {
  files: SkillDirEntry[];
}

/** GET /agents/:name/skills/dir —— 列出 skill 包内文件与子目录。 */
export async function listAgentSkillDir(
  name: string,
  source: string,
  skill: string,
  subpath?: string,
): Promise<SkillDirListBody> {
  const params = new URLSearchParams({ source, skill });
  if (subpath) params.set('subpath', subpath);
  const res = await fetch(
    `${AGENTS_API}/${encodeURIComponent(name)}/skills/dir?${params.toString()}`,
    { headers: authHeaders() },
  );
  const body = await parseGinx<SkillDirListBody | null>(res);
  if (!body.body) return { files: [] };
  return body.body;
}

/** DELETE /agents/:name/skills/path —— 删除 skill 包内单个文件或文件夹。 */
export async function deleteAgentSkillPath(
  name: string,
  source: string,
  skill: string,
  path: string,
): Promise<void> {
  const params = new URLSearchParams({ source, skill, path });
  const res = await fetch(
    `${AGENTS_API}/${encodeURIComponent(name)}/skills/path?${params.toString()}`,
    { method: 'DELETE', headers: authHeaders() },
  );
  await parseGinx<unknown>(res);
}

/** GET /agents/:name/workspace-files —— 读取人设 Markdown 文件。 */
export async function getAgentWorkspaceFiles(name: string): Promise<AgentWorkspaceFilesBody> {
  const res = await fetch(`${AGENTS_API}/${encodeURIComponent(name)}/workspace-files`, { headers: authHeaders() });
  const body = await parseGinx<AgentWorkspaceFilesBody | null>(res);
  if (!body.body) throw new Error('empty body');
  return body.body;
}

/** PUT /agents/:name/workspace-files/:file —— 保存单个人设文件。 */
export async function putAgentWorkspaceFile(
  name: string,
  file: PersonaFileName,
  content: string,
): Promise<AgentPersonaFile> {
  const res = await fetch(
    `${AGENTS_API}/${encodeURIComponent(name)}/workspace-files/${encodeURIComponent(file)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ content }),
    },
  );
  const body = await parseGinx<AgentPersonaFile | null>(res);
  if (!body.body) throw new Error('empty body');
  return body.body;
}

/** POST /agents/:name/workspace-files/init —— 为缺失文件写入默认模板。 */
export async function initAgentWorkspaceFiles(name: string): Promise<AgentWorkspaceFilesBody> {
  const res = await fetch(`${AGENTS_API}/${encodeURIComponent(name)}/workspace-files/init`, {
    method: 'POST',
    headers: authHeaders(),
  });
  const body = await parseGinx<AgentWorkspaceFilesBody | null>(res);
  if (!body.body) throw new Error('empty body');
  return body.body;
}

export interface GeneratePersonaFileRequest {
  prompt: string;
  current_content?: string;
}

export interface GeneratePersonaFileBody {
  content: string;
}

/** POST /agents/:name/workspace-files/:file/generate —— 根据提示词 AI 生成人设 Markdown。 */
export async function generateAgentWorkspaceFile(
  name: string,
  file: PersonaFileName,
  req: GeneratePersonaFileRequest,
): Promise<GeneratePersonaFileBody> {
  const res = await fetch(
    `${AGENTS_API}/${encodeURIComponent(name)}/workspace-files/${encodeURIComponent(file)}/generate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(req),
    },
  );
  const body = await parseGinx<GeneratePersonaFileBody | null>(res);
  if (!body.body) throw new Error('empty body');
  return body.body;
}
