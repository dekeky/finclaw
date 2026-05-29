import type { GinxResponse } from '../types/rss';
import { getToken } from './auth';

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
  const res = await fetch(`/agents/${encodeURIComponent(name)}/docs${params}`, {
    headers: { ...authHeaders() },
  });
  return parseGinx<DocListBody>(await res.json());
}

export async function getAgentDocFile(name: string, file: string): Promise<DocFileBody> {
  const encodedPath = file.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`/agents/${encodeURIComponent(name)}/docs/${encodedPath}`, {
    headers: { ...authHeaders() },
  });
  return parseGinx<DocFileBody>(await res.json());
}
