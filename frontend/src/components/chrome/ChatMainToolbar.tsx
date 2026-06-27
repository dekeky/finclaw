import { useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AgentSwitcher } from '@/components/AgentSwitcher';
import { ChatModelSwitcher } from '@/components/chrome/ChatModelSwitcher';
import { Button } from '@/components/ui/button';
import { useAgents } from '@/state/agents';

/** 元宝式：主内容区左上角「名称 + 下拉箭头」，用于切换 Agent */
export function ChatMainToolbar() {
  const { agents, currentAgent, selectAgent, status, refresh, avatarRevision } = useAgents();
  const navigate = useNavigate();

  const handleShowDetail = useCallback(
    (name: string) => {
      navigate(`/agents?agent=${encodeURIComponent(name)}`);
    },
    [navigate],
  );

  if (status === 'loading') {
    return (
      <span className="px-2 text-[15px] font-medium text-muted-foreground">加载 Agent…</span>
    );
  }

  if (status === 'error') {
    return (
      <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => void refresh()}>
        Agent 加载失败 · 重试
      </Button>
    );
  }

  if (agents.length === 0) {
    return (
      <Button asChild variant="ghost" size="sm" className="h-8 gap-1 px-2 text-[15px] font-medium">
        <Link to="/agents/market">创建 Agent</Link>
      </Button>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-0.5">
      <AgentSwitcher
        agents={agents}
        value={currentAgent}
        onChange={selectAgent}
        avatarRevision={avatarRevision}
        variant="inline"
        placeholder="选择 Agent"
        showAvatar={false}
        aria-label="切换 Agent"
        onShowDetail={handleShowDetail}
      />
      {currentAgent && <ChatModelSwitcher agentName={currentAgent} />}
    </div>
  );
}
