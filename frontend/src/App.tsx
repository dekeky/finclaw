import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import AgentsPage from './pages/AgentsPage';
import BacktestPage from './pages/BacktestPage';
import ChatPage from './pages/ChatPage';
import RssReaderPage from './pages/RssReaderPage';
import SkillPage from './pages/SkillPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/chat" replace />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/news" element={<RssReaderPage />} />
        {/* 兼容旧路径 */}
        <Route path="/rss" element={<Navigate to="/news" replace />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/backtest" element={<BacktestPage />} />
        <Route path="/skill" element={<SkillPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
