import { Link } from 'react-router-dom';
import { AgentSwitcher } from '@/components/AgentSwitcher';
import { Button } from '@/components/ui/button';
import { useAgents } from '@/state/agents';

/** 对话输入框底部的「当前 Agent」选择，对齐 Cursor composer 下沿。 */
export function ChatAgentComposerPicker() {
  const { agents, currentAgent, selectAgent, status, refresh, avatarRevision } = useAgents();

  if (status === 'loading') {
    return (
      <span className="inline-flex h-7 items-center px-1.5 text-xs text-muted-foreground">
        Agent 加载中…
      </span>
    );
  }

  if (status === 'error') {
    return (
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="h-7 px-1.5 text-xs text-muted-foreground"
        onClick={() => void refresh()}
      >
        Agent 加载失败 · 重试
      </Button>
    );
  }

  if (agents.length === 0) {
    return (
      <Button asChild variant="ghost" size="xs" className="h-7 px-1.5 text-xs">
        <Link to="/agents" state={{ showMarket: true }}>
          创建 Agent
        </Link>
      </Button>
    );
  }

  return (
    <AgentSwitcher
      agents={agents}
      value={currentAgent}
      onChange={selectAgent}
      avatarRevision={avatarRevision}
      variant="composer"
      showAvatar
      placeholder="选择 Agent"
      aria-label="切换 Agent"
    />
  );
}
