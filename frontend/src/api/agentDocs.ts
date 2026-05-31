import type { GinxResponse } from '../types/rss';
import { getToken } from './auth';

const AGENTS_API = '/api/v1/agents';

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

export async function listAgentDocs(name: string, subpath?: string): Promise<DocListBody> {
  const params = subpath ? `?subpath=${encodeURIComponent(subpath)}` : '';
  const res = await fetch(`${AGENTS_API}/${encodeURIComponent(name)}/docs${params}`, {
    headers: { ...authHeaders() },
  });
  return parseGinx<DocListBody>(await res.json());
}

export async function getAgentDocFile(name: string, file: string): Promise<DocFileBody> {
  const encodedPath = file.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`${AGENTS_API}/${encodeURIComponent(name)}/docs/${encodedPath}`, {
    headers: { ...authHeaders() },
  });
  return parseGinx<DocFileBody>(await res.json());
}

export async function writeAgentDocFile(
  name: string,
  file: string,
  content: string,
): Promise<DocFileBody> {
  const encodedPath = file.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`${AGENTS_API}/${encodeURIComponent(name)}/docs/${encodedPath}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ content }),
  });
  return parseGinx<DocFileBody>(await res.json());
}

export async function deleteAgentDocPath(name: string, file: string): Promise<void> {
  const encodedPath = file.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`${AGENTS_API}/${encodeURIComponent(name)}/docs/${encodedPath}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  });
  parseGinx<unknown>(await res.json());
}
