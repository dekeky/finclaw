import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AgentMarketPanel } from '../components/AgentMarketPanel';
import { useAgents } from '../state/agents';
import { SidebarExpandTrigger } from '@/components/chrome/SidebarExpandTrigger';
import { ThemeToggle } from '@/components/chrome/ThemeToggle';
import { GallerySearchInput } from '@/components/ui/gallery-search-input';

export default function AgentMarketPage() {
  const navigate = useNavigate();
  const { agentNames, refresh, selectAgent } = useAgents();
  const [search, setSearch] = useState('');

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleInstalled = useCallback(
    async (name: string) => {
      await refresh();
      selectAgent(name);
      navigate('/agents');
    },
    [refresh, selectAgent, navigate],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border/50 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <SidebarExpandTrigger />
          <h1 className="text-base font-medium tracking-tight text-foreground/90">Agent 市场</h1>
        </div>
        <ThemeToggle />
      </div>
      <div className="shrink-0 border-b border-border/50 px-4 py-2.5">
        <GallerySearchInput
          className="mx-auto"
          value={search}
          onChange={setSearch}
          placeholder="搜索模板名称或描述…"
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <AgentMarketPanel
            existingAgents={agentNames}
            hideTitle
            search={search}
            onSearchChange={setSearch}
            onClose={() => navigate('/agents')}
            onInstalled={(name) => void handleInstalled(name)}
          />
        </div>
      </div>
    </div>
  );
}
