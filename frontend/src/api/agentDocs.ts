import type { GinxResponse } from '../types/rss';
import { getToken } from './auth';
import { saveResponseAsDownload } from '@/lib/downloadResponse';
/**
 * 账户级共享文档 API。
 *
 * 文档已从单个 agent 的个人工作区抽离到「账户共享文档目录」：
 * 同一账户下所有 agent 看到/编辑的是同一份文档，因此这些接口不再带 agent 名。
 * 会话前缀固定为 /api/v1/account/docs。
 */
const ACCOUNT_DOCS_API = '/api/v1/account/docs';

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function parseGinx<T>(res: GinxResponse<T>): T {
  if (res.code !== 200) throw new Error(res.errMsg || 'request failed');
  return res.body;
}

export interface DocFileEntry {
  name: string;
  size: number;
  mod_time: string;
  is_dir: boolean;
}

export interface DocListBody {
  files: DocFileEntry[];
}

export interface DocFileBody {
  name: string;
  content: string;
  size: number;
}

/** GET /account/docs?subpath= —— 列出账户共享文档目录下的文件。 */
export async function listAccountDocs(subpath?: string): Promise<DocListBody> {
  const params = subpath ? `?subpath=${encodeURIComponent(subpath)}` : '';
  const res = await fetch(`${ACCOUNT_DOCS_API}${params}`, {
    headers: { ...authHeaders() },
  });
  return parseGinx<DocListBody>(await res.json());
}

/** GET /account/docs/:file —— 读取一个账户共享文档。 */
export async function getAccountDocFile(file: string): Promise<DocFileBody> {
  const encodedPath = file.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`${ACCOUNT_DOCS_API}/${encodedPath}`, {
    headers: { ...authHeaders() },
  });
  return parseGinx<DocFileBody>(await res.json());
}

/** PUT /account/docs/:file —— 新建或覆盖账户共享文档。 */
export async function writeAccountDocFile(
  file: string,
  content: string,
): Promise<DocFileBody> {
  const encodedPath = file.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`${ACCOUNT_DOCS_API}/${encodedPath}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ content }),
  });
  return parseGinx<DocFileBody>(await res.json());
}

/** GET /account/docs/:file?download=1 —— 下载文件或文件夹（文件夹为 ZIP）。 */
export async function downloadAccountDocFile(file: string, isDir = false): Promise<void> {
  const encodedPath = file.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`${ACCOUNT_DOCS_API}/${encodedPath}?download=1`, {
    headers: { ...authHeaders() },
  });
  const baseName = file.split('/').pop() ?? file;
  const fallbackName = isDir ? `${baseName}.zip` : baseName;
  await saveResponseAsDownload(res, fallbackName);
}

/** DELETE /account/docs/:file —— 删除账户共享文档（文件或目录）。 */
export async function deleteAccountDocPath(file: string): Promise<void> {
  const encodedPath = file.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`${ACCOUNT_DOCS_API}/${encodedPath}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  });
  parseGinx<unknown>(await res.json());
}

export interface PolishDocBody {
  content: string;
}

/**
 * POST /account/docs/polish —— 使用指定 agent 的模型配置对共享文档做 AI 润色。
 * agent 选填但润色依赖其 LLM 配置，前端会带上当前对话的 agent。
 */
export async function polishAccountDoc(
  agent: string,
  body: { prompt: string; current_content?: string },
): Promise<PolishDocBody> {
  const res = await fetch(`${ACCOUNT_DOCS_API}/polish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ ...body, agent }),
  });
  return parseGinx<PolishDocBody>(await res.json());
}
