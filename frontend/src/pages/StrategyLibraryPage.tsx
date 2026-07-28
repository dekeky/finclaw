import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconSearch, IconX } from '@tabler/icons-react';
import { StrategyLibraryPanel } from '@/components/StrategyLibraryPanel';
import { SidebarExpandTrigger } from '@/components/chrome/SidebarExpandTrigger';
import { ThemeToggle } from '@/components/chrome/ThemeToggle';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { listStrategies } from '@/api/strategies';

export default function StrategyLibraryPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [strategyNames, setStrategyNames] = useState<string[]>([]);

  useEffect(() => {
    void listStrategies()
      .then((list) => setStrategyNames(list.map((s) => s.name)))
      .catch(() => setStrategyNames([]));
  }, []);

  const handleInstalled = useCallback(
    (name: string) => {
      navigate('/backtest', { state: { selectedStrategy: name } });
    },
    [navigate],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border/50 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <SidebarExpandTrigger />
          <h1 className="text-base font-medium tracking-tight text-foreground/90">策略库</h1>
        </div>
        <ThemeToggle />
      </div>
      <div className="shrink-0 border-b border-border/50 px-4 py-2.5">
        <div className="relative mx-auto w-full max-w-xl">
          <IconSearch
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70"
            stroke={1.75}
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索策略名称或描述…"
            className={cn(
              'h-9 w-full border-transparent bg-muted/50 pl-9 text-sm shadow-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-violet-500/35 focus-visible:bg-background focus-visible:ring-violet-500/25',
              search ? 'pr-9' : 'pr-3',
            )}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="清除搜索"
              className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <IconX className="size-3.5" stroke={2} />
            </button>
          )}
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <StrategyLibraryPanel
            existingStrategyNames={strategyNames}
            hideTitle
            search={search}
            onSearchChange={setSearch}
            onInstalled={handleInstalled}
          />
        </div>
      </div>
    </div>
  );
}
