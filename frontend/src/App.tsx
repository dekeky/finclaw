import { Suspense, useEffect, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { IconLoader2 } from '@tabler/icons-react';
import { useAuth } from './state/auth';
import { AppLayout } from './layouts/AppLayout';
import { lazyWithRetry } from './lib/lazyWithRetry';
import { scheduleIdlePreload } from './lib/idlePreload';

const ModelsPage = lazyWithRetry(() => import('./pages/ModelsPage'));
const AgentMarketPage = lazyWithRetry(() => import('./pages/AgentMarketPage'));
const AgentsPage = lazyWithRetry(() => import('./pages/AgentsPage'));
const BacktestPage = lazyWithRetry(() => import('./pages/BacktestPage'));
const ChatPage = lazyWithRetry(() => import('./pages/ChatPage'));
const LoginPage = lazyWithRetry(() => import('./pages/LoginPage'));
const NewsPage = lazyWithRetry(() => import('./pages/NewsPage'));
const SharePage = lazyWithRetry(() => import('./pages/SharePage'));
const WeixinPage = lazyWithRetry(() => import('./pages/WeixinPage'));

function AuthLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <IconLoader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function PageFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <IconLoader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <AuthLoading />;
  if (user) return <Navigate to="/chat" replace />;
  return <>{children}</>;
}

export default function App() {
  useEffect(() => {
    // 首屏渲染完成后在后台预载回测编译器 / markdown 等重 chunk，
    // 用户点击进入时无需再等待动态加载。
    scheduleIdlePreload();
  }, []);

  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
        <Route path="/share/:token" element={<SharePage />} />
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/news" element={<NewsPage />} />
          <Route path="/rss" element={<Navigate to="/news" replace />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/models" element={<ModelsPage />} />
          <Route path="/agents/market" element={<AgentMarketPage />} />
          <Route path="/backtest" element={<BacktestPage />} />
          <Route path="/backtest/library" element={<Navigate to="/backtest" replace />} />
          <Route path="/weixin" element={<WeixinPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Routes>
    </Suspense>
  );
}
