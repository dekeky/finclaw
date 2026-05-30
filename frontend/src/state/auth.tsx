import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import * as authApi from '../api/auth';
import type { AuthUser } from '../api/auth';

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (account: string, password: string) => Promise<void>;
  register: (account: string, password: string, displayName: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(authApi.getStoredUser());
  const [token, setToken] = useState<string | null>(authApi.getToken());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const stored = authApi.getToken();
      if (!stored) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const me = await authApi.fetchMe();
        if (cancelled) return;
        authApi.setStoredUser(me);
        setToken(stored);
        setUser(me);
      } catch {
        if (cancelled) return;
        authApi.clearToken();
        setToken(null);
        setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAuth = useCallback((resp: authApi.AuthResponse) => {
    authApi.setToken(resp.access_token);
    authApi.setStoredUser(resp.user);
    setToken(resp.access_token);
    setUser(resp.user);
  }, []);

  const login = useCallback(async (account: string, password: string) => {
    const resp = await authApi.login(account, password);
    handleAuth(resp);
  }, [handleAuth]);

  const register = useCallback(async (account: string, password: string, displayName: string) => {
    const resp = await authApi.register(account, password, displayName);
    handleAuth(resp);
  }, [handleAuth]);

  const logout = useCallback(() => {
    authApi.clearToken();
    setToken(null);
    setUser(null);
    window.location.replace('/login');
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
