import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/state/auth';

/** 执行写入前校验登录；未登录则跳转登录页并带上回跳地址。 */
export function useRequireAuth() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const requireAuth = useCallback((): boolean => {
    if (loading) return false;
    if (user) return true;
    const from = location.pathname + location.search;
    navigate('/login', { state: { from } });
    return false;
  }, [user, loading, navigate, location]);

  return { requireAuth, isAuthenticated: !!user };
}
