import { useState } from 'react';
import { useAuth } from '../state/auth';
import { useNavigate, useLocation } from 'react-router-dom';
import { FinclawMark } from '../components/FinclawMark';

export default function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isRegister, setIsRegister] = useState(false);
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: string })?.from || '/chat';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const trimmedAccount = account.trim();
      if (isRegister) {
        await register(trimmedAccount, password, displayName);
      } else {
        await login(trimmedAccount, password);
      }
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '认证失败';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 p-8">
        <div className="flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-400/35 bg-gradient-to-br from-amber-100/90 to-amber-200/50 shadow-sm dark:from-amber-900/40 dark:to-amber-950/30">
            <FinclawMark variant="mark" size={28} decorative />
          </span>
          <h1 className="text-2xl font-bold tracking-tight">Finclaw</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isRegister ? '创建你的账户' : '使用账户和密码登录'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div>
              <label className="mb-1 block text-sm font-medium">显示名称</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="你的昵称"
                required
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium">账户</label>
            <input
              type="text"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="请输入账户名"
              autoComplete="username"
              required
              minLength={3}
              maxLength={64}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="至少 6 位"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              required
              minLength={6}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? '请稍候…' : isRegister ? '注册' : '登录'}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {isRegister ? '已有账户？' : '还没有账户？'}{' '}
          <button
            type="button"
            onClick={() => { setIsRegister(!isRegister); setError(''); }}
            className="text-primary underline hover:no-underline"
          >
            {isRegister ? '去登录' : '去注册'}
          </button>
        </p>
      </div>
    </div>
  );
}
