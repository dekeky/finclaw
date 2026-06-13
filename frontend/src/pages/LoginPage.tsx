import { useEffect, useState } from 'react';
import { IconArrowLeft, IconEye, IconEyeOff } from '@tabler/icons-react';
import { useAuth } from '../state/auth';
import { useNavigate, useLocation } from 'react-router-dom';
import { FinclawMark } from '../components/FinclawMark';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import * as authApi from '../api/auth';

type AuthMode = 'login' | 'register' | 'reset';

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete,
  minLength = 6,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        minLength={minLength}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex items-center px-2.5 text-muted-foreground hover:text-foreground"
        aria-label={visible ? '隐藏密码' : '显示密码'}
      >
        {visible ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export default function LoginPage() {
  const { login, register, resetPassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<AuthMode>('login');
  const [verificationEnabled, setVerificationEnabled] = useState(false);
  const [loginId, setLoginId] = useState('');
  const [registerAccount, setRegisterAccount] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const from = (location.state as { from?: string })?.from || '/chat';
  const codeEmail = mode === 'register' ? registerEmail.trim() : resetEmail.trim();
  const codeEmailValid = isValidEmail(codeEmail);

  useEffect(() => {
    let cancelled = false;
    void authApi.fetchAuthConfig()
      .then((cfg) => {
        if (!cancelled) setVerificationEnabled(cfg.email_verification_enabled);
      })
      .catch(() => {
        if (!cancelled) setVerificationEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const clearForm = () => {
    setError('');
    setInfo('');
    setCode('');
    setPassword('');
    setConfirmPassword('');
  };

  const switchMode = (next: AuthMode) => {
    if (next === 'reset' && !verificationEnabled) return;
    setMode(next);
    clearForm();
  };

  const handleSendCode = async () => {
    setError('');
    setInfo('');
    if (!codeEmail) {
      setError('请先输入邮箱');
      return;
    }
    if (!codeEmailValid) {
      setError('请输入有效的邮箱地址');
      return;
    }

    setSendingCode(true);
    try {
      const purpose = mode === 'register' ? 'register' : 'reset_password';
      await authApi.sendVerificationCode(codeEmail, purpose);
      setInfo('验证码已发送');
      setCooldown(60);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '发送验证码失败');
    } finally {
      setSendingCode(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setSubmitting(true);
    try {
      if (mode === 'register') {
        if (password !== confirmPassword) throw new Error('两次输入的密码不一致');
        const params: authApi.RegisterParams = {
          account: registerAccount.trim(),
          password,
          display_name: displayName.trim(),
        };
        if (verificationEnabled) {
          if (!isValidEmail(registerEmail.trim())) throw new Error('请输入有效的邮箱地址');
          if (!code.trim()) throw new Error('请输入验证码');
          params.email = registerEmail.trim();
          params.code = code.trim();
        }
        await register(params);
        navigate(from, { replace: true });
        return;
      }

      if (mode === 'reset') {
        if (!isValidEmail(resetEmail.trim())) throw new Error('请输入有效的邮箱地址');
        if (!code.trim()) throw new Error('请输入验证码');
        if (password !== confirmPassword) throw new Error('两次输入的密码不一致');
        await resetPassword(resetEmail.trim(), password, code.trim());
        setInfo('密码已重置，请登录');
        switchMode('login');
        return;
      }

      await login(loginId.trim(), password);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '认证失败');
    } finally {
      setSubmitting(false);
    }
  };

  const title = mode === 'login' ? '登录' : mode === 'register' ? '注册' : '重置密码';

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          {mode === 'reset' ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mb-1 self-start"
              onClick={() => switchMode('login')}
            >
              <IconArrowLeft className="h-4 w-4" />
              返回登录
            </Button>
          ) : (
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-400/35 bg-gradient-to-br from-amber-100/90 to-amber-200/50 shadow-sm dark:from-amber-900/40 dark:to-amber-950/30">
              <FinclawMark variant="mark" size={28} decorative />
            </span>
          )}
          {mode === 'reset' && <CardTitle className="text-xl">{title}</CardTitle>}
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'login' && (
              <>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium">账户名或邮箱</label>
                  <Input
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    placeholder="请输入账户名或邮箱"
                    autoComplete="username"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium">密码</label>
                  <PasswordInput
                    value={password}
                    onChange={setPassword}
                    placeholder="请输入密码"
                    autoComplete="current-password"
                  />
                  {verificationEnabled && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => switchMode('reset')}
                        className="text-xs text-primary hover:underline"
                      >
                        忘记密码？
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

            {mode === 'register' && (
              <>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium">显示名称</label>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="你的昵称"
                    autoComplete="name"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium">账户名</label>
                  <Input
                    value={registerAccount}
                    onChange={(e) => setRegisterAccount(e.target.value)}
                    placeholder="3–64 字符，用于登录"
                    autoComplete="username"
                    required
                    minLength={3}
                    maxLength={64}
                  />
                </div>
                {verificationEnabled && (
                  <>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium">邮箱</label>
                      <Input
                        type="email"
                        value={registerEmail}
                        onChange={(e) => setRegisterEmail(e.target.value)}
                        placeholder="name@example.com"
                        autoComplete="email"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium">验证码</label>
                      <div className="flex gap-2">
                        <Input
                          value={code}
                          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="6 位数字"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          required
                          maxLength={6}
                          minLength={6}
                          className="tracking-widest"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="shrink-0 px-3"
                          onClick={() => void handleSendCode()}
                          disabled={sendingCode || cooldown > 0 || !codeEmailValid}
                        >
                          {cooldown > 0 ? `${cooldown}s` : sendingCode ? '发送中…' : '发送验证码'}
                        </Button>
                      </div>
                    </div>
                  </>
                )}
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium">密码</label>
                  <PasswordInput
                    value={password}
                    onChange={setPassword}
                    placeholder="至少 6 位"
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium">确认密码</label>
                  <PasswordInput
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    placeholder="再次输入密码"
                    autoComplete="new-password"
                  />
                </div>
              </>
            )}

            {mode === 'reset' && (
              <>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium">邮箱</label>
                  <Input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="注册时绑定的邮箱"
                    autoComplete="email"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium">验证码</label>
                  <div className="flex gap-2">
                    <Input
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="6 位数字"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                      maxLength={6}
                      minLength={6}
                      className="tracking-widest"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0 px-3"
                      onClick={() => void handleSendCode()}
                      disabled={sendingCode || cooldown > 0 || !codeEmailValid}
                    >
                      {cooldown > 0 ? `${cooldown}s` : sendingCode ? '发送中…' : '发送验证码'}
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium">新密码</label>
                  <PasswordInput
                    value={password}
                    onChange={setPassword}
                    placeholder="至少 6 位"
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium">确认新密码</label>
                  <PasswordInput
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    placeholder="再次输入新密码"
                    autoComplete="new-password"
                  />
                </div>
              </>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
            {info && mode === 'login' && (
              <p className="text-sm text-emerald-600 dark:text-emerald-400">{info}</p>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? '请稍候…' : title}
            </Button>
          </form>

          {mode === 'login' && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              还没有账户？{' '}
              <button type="button" onClick={() => switchMode('register')} className="text-primary hover:underline">
                去注册
              </button>
            </p>
          )}
          {mode === 'register' && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              已有账户？{' '}
              <button type="button" onClick={() => switchMode('login')} className="text-primary hover:underline">
                去登录
              </button>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
