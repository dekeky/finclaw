export interface AuthUser {
  id: string;
  email: string;
  display_name: string;
}

export interface AuthResponse {
  access_token: string;
  user: AuthUser;
}

export async function register(email: string, password: string, display_name: string): Promise<AuthResponse> {
  const res = await fetch('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, display_name }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || data.errMsg || 'Registration failed');
  }
  const data = await res.json();
  if (data.errMsg) throw new Error(data.errMsg);
  return data.body;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || data.errMsg || 'Login failed');
  }
  const data = await res.json();
  if (data.errMsg) throw new Error(data.errMsg);
  return data.body;
}

export async function refresh(): Promise<{ access_token: string }> {
  const res = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
  });
  if (!res.ok) throw new Error('Token refresh failed');
  const data = await res.json();
  if (data.errMsg) throw new Error(data.errMsg);
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

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setStoredUser(user: AuthUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
