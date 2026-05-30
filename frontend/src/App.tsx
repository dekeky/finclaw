import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { IconLoader2 } from '@tabler/icons-react';
import { AuthProvider, useAuth } from './state/auth';
import { AppLayout } from './layouts/AppLayout';
import AgentsPage from './pages/AgentsPage';
import BacktestPage from './pages/BacktestPage';
import ChatPage from './pages/ChatPage';
import LoginPage from './pages/LoginPage';
// import RssReaderPage from './pages/RssReaderPage';
import NewsPage from './pages/NewsPage';
import SkillPage from './pages/SkillPage';
import type { ReactNode } from 'react';

function AuthLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <IconLoader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <AuthLoading />;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <AuthLoading />;
  if (user) return <Navigate to="/chat" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
        <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/news" element={<NewsPage />} />
          {/* <Route path="/news" element={<RssReaderPage />} /> */}
          <Route path="/rss" element={<Navigate to="/news" replace />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/backtest" element={<BacktestPage />} />
          <Route path="/skill" element={<SkillPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Routes>
    </AuthProvider>
  );
}
