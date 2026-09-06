const STORAGE_KEY = 'finclaw.rememberedLogin';

export type RememberedLogin = {
  loginId: string;
  password: string;
};

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

export function readRememberedLogin(): RememberedLogin | null {
  if (!canUseStorage()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RememberedLogin>;
    if (typeof parsed.loginId !== 'string' || typeof parsed.password !== 'string') return null;
    const loginId = parsed.loginId.trim();
    if (!loginId || !parsed.password) return null;
    return { loginId, password: parsed.password };
  } catch {
    return null;
  }
}

export function writeRememberedLogin(loginId: string, password: string): void {
  if (!canUseStorage()) return;
  const trimmed = loginId.trim();
  if (!trimmed || !password) {
    clearRememberedLogin();
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ loginId: trimmed, password }));
  } catch {
    // quota / private mode
  }
}

export function clearRememberedLogin(): void {
  if (!canUseStorage()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
