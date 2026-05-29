import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import * as authApi from '../api/auth';
import type { AuthUser } from '../api/auth';

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(authApi.getStoredUser());
  const [token, setToken] = useState<string | null>(authApi.getToken());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // On mount, validate stored token
    const stored = authApi.getToken();
    if (stored) {
      setToken(stored);
      setUser(authApi.getStoredUser());
    }
    setLoading(false);
  }, []);

  const handleAuth = useCallback((resp: authApi.AuthResponse) => {
    authApi.setToken(resp.access_token);
    authApi.setStoredUser(resp.user);
    setToken(resp.access_token);
    setUser(resp.user);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const resp = await authApi.login(email, password);
    handleAuth(resp);
  }, [handleAuth]);

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    const resp = await authApi.register(email, password, displayName);
    handleAuth(resp);
  }, [handleAuth]);

  const logout = useCallback(() => {
    authApi.clearToken();
    setToken(null);
    setUser(null);
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
