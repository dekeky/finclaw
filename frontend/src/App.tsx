import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import BacktestPage from './pages/BacktestPage';
import RssReaderPage from './pages/RssReaderPage';
import SettingsPage from './pages/SettingsPage';
import SkillPage from './pages/SkillPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/news" replace />} />
        <Route path="/news" element={<RssReaderPage />} />
        {/* 兼容旧路径 */}
        <Route path="/rss" element={<Navigate to="/news" replace />} />
        <Route path="/backtest" element={<BacktestPage />} />
        <Route path="/skill" element={<SkillPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/news" replace />} />
      </Route>
    </Routes>
  );
}
