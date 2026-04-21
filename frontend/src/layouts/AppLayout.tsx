import { Outlet } from 'react-router-dom';
import { AppSidebar } from '../components/AppSidebar';
import { RssAiChatDock } from '../components/rss/RssAiChatDock';
import { useAiDock } from '../state/aiDock';

export function AppLayout() {
  const dock = useAiDock();

  return (
    <div style={layout.shell}>
      <AppSidebar />
      <main style={layout.main}>
        <Outlet />
      </main>

      {/* 统一右下角浮窗：所有页面共用一个实例 */}
      <RssAiChatDock
        listEntries={dock.listEntries}
        selectedKeys={dock.selectedKeys}
        onToggleSelectKey={dock.toggleKey}
        onClearSelection={dock.clearSelection}
      />
    </div>
  );
}

const layout: Record<string, React.CSSProperties> = {
  shell: {
    minHeight: '100vh',
    display: 'flex',
    background: '#0c0c0e',
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
};

