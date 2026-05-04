import { Outlet } from 'react-router-dom';
import { AppSidebar } from '../components/AppSidebar';
import { RssAiChatDock } from '../components/rss/RssAiChatDock';
import { useAiDock } from '../state/aiDock';
import { GLOBAL_CSS } from '../styles/globalCss';

export function AppLayout() {
  const dock = useAiDock();

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <div style={layout.shell}>
        <AppSidebar />
        <main className="fc-main">
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
    </>
  );
}

const layout: Record<string, React.CSSProperties> = {
  shell: {
    minHeight: '100dvh',
    height: '100dvh',
    display: 'flex',
    background: 'var(--fc-bg-app)',
    overflow: 'hidden',
  },
};

