import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './state/auth';
import { AppLayout } from './layouts/AppLayout';
import AgentsPage from './pages/AgentsPage';
import BacktestPage from './pages/BacktestPage';
import ChatPage from './pages/ChatPage';
import LoginPage from './pages/LoginPage';
import RssReaderPage from './pages/RssReaderPage';
import SkillPage from './pages/SkillPage';
import type { ReactNode } from 'react';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route path="/chat" element={<RequireAuth><ChatPage /></RequireAuth>} />
          <Route path="/news" element={<RequireAuth><RssReaderPage /></RequireAuth>} />
          <Route path="/rss" element={<Navigate to="/news" replace />} />
          <Route path="/agents" element={<RequireAuth><AgentsPage /></RequireAuth>} />
          <Route path="/backtest" element={<RequireAuth><BacktestPage /></RequireAuth>} />
          <Route path="/skill" element={<RequireAuth><SkillPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
