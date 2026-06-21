import type { GinxResponse } from '../types/rss';

export interface AuthUser {
  id: string;
  account: string;
  display_name: string;
}

export interface AuthResponse {
  access_token: string;
  user: AuthUser;
}

export type VerificationPurpose = 'register' | 'reset_password';

export interface AuthConfig {
  email_verification_enabled: boolean;
}

async function parseGinx<T>(res: Response): Promise<GinxResponse<T>> {
  let json: GinxResponse<T> | null = null;
  try {
    json = (await res.json()) as GinxResponse<T>;
  } catch {
    // non-JSON response
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

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchAuthConfig(): Promise<AuthConfig> {
  const res = await fetch('/api/v1/auth/config');
  const data = await parseGinx<AuthConfig>(res);
  if (!data.body) {
    throw new Error('Auth config not found');
  }
  return data.body;
}

export async function sendVerificationCode(email: string, purpose: VerificationPurpose): Promise<void> {
  const res = await fetch('/api/v1/auth/send-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, purpose }),
  });
  await parseGinx<{ message: string }>(res);
}

export interface RegisterParams {
  account: string;
  password: string;
  display_name: string;
  email?: string;
  code?: string;
}

export async function register(params: RegisterParams): Promise<AuthResponse> {
  const res = await fetch('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await parseGinx<AuthResponse>(res);
  return data.body!;
}

export async function resetPassword(email: string, password: string, code: string): Promise<void> {
  const res = await fetch('/api/v1/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, code }),
  });
  await parseGinx<{ message: string }>(res);
}

export async function login(account: string, password: string): Promise<AuthResponse> {
  const res = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, password }),
  });
  const data = await parseGinx<AuthResponse>(res);
  return data.body!;
}

export async function fetchMe(): Promise<AuthUser> {
  const res = await fetch('/api/v1/auth/me', { headers: authHeaders() });
  const data = await parseGinx<AuthUser>(res);
  if (!data.body) {
    throw new Error('User not found');
  }
  return data.body;
}

export async function refresh(): Promise<{ access_token: string }> {
  const res = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
  });
  const data = await parseGinx<{ access_token: string }>(res);
  if (!data.body?.access_token) {
    throw new Error('Token refresh failed');
  }
  return data.body;
}

const TOKEN_KEY = 'finclaw.auth.token';
const USER_KEY = 'finclaw.auth.user';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function normalizeStoredUser(raw: unknown): AuthUser | null {
  if (!raw || typeof raw !== 'object') return null;
  const u = raw as Record<string, unknown>;
  const id = u.id;
  const display_name = u.display_name;
  const account = u.account ?? u.email;
  if (typeof id !== 'string' || typeof account !== 'string') return null;
  return {
    id,
    account,
    display_name: typeof display_name === 'string' ? display_name : '',
  };
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return normalizeStoredUser(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function setStoredUser(user: AuthUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
