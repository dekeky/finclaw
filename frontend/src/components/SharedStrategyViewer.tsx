import { useMemo, useState } from 'react';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import '@/components/backtest/fquant-ui.css';
import { RunReport } from '@/components/backtest/RunReport';
import { formatDateMinute, STATUS_LABEL } from '@/components/backtest/format';
import { StrategyCodeEditor } from '@/components/StrategyCodeEditor';
import { StrategyPlatformBadge } from '@/components/StrategyPlatformField';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { runDisplayName, type RunDetail } from '@/api/backtest';
import { copyToClipboard } from '@/lib/clipboard';
import { cn } from '@/lib/cn';
import { normalizeStrategyPlatform } from '@/lib/strategyPlatforms';

export function SharedStrategyViewer({
  name,
  platform,
  script,
  runs,
  shareToken,
}: {
  name: string;
  platform?: string;
  script: string;
  runs: RunDetail[];
  shareToken?: string;
}) {
  const [pane, setPane] = useState<'code' | 'runs'>('code');
  const [selectedId, setSelectedId] = useState<string | null>(runs[0]?.id ?? null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const current = useMemo(
    () => runs.find((run) => run.id === selectedId) ?? runs[0] ?? null,
    [runs, selectedId],
  );
  const normalized = normalizeStrategyPlatform(platform ?? '');

  const handleCopyScript = async () => {
    if (!script.trim()) return;
    try {
      await copyToClipboard(script);
      setCopied(true);
      setCopyError(false);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setCopyError(true);
      window.setTimeout(() => setCopyError(false), 2000);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/60 bg-card">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/50 px-2.5">
        {normalized !== 'finclaw' ? <StrategyPlatformBadge platform={normalized} /> : null}
        <nav className="flex h-full items-stretch gap-0 self-stretch">
          {(
            [
              ['code', '策略代码'],
              ...(runs.length ? ([['runs', '回测结果']] as const) : []),
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={cn(
                'h-full px-3 text-[12px] transition-colors',
                pane === id
                  ? 'border-b-2 border-violet-600 font-medium text-violet-700 dark:border-violet-400 dark:text-violet-300'
                  : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setPane(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        {pane === 'code' ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="ml-auto"
            disabled={!script.trim()}
            title="复制策略代码到剪贴板"
            aria-label="复制策略代码"
            onClick={() => void handleCopyScript()}
          >
            {copied ? <IconCheck className="size-3.5" stroke={1.75} /> : <IconCopy className="size-3.5" stroke={1.75} />}
            {copyError ? '复制失败' : copied ? '已复制' : '复制'}
          </Button>
        ) : null}
      </div>

      {pane === 'code' ? (
        <StrategyCodeEditor value={script} readOnly className="min-h-0 flex-1" />
      ) : current ? (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="w-56 shrink-0 border-r border-border/50">
            <div className="p-1.5">
              {runs.map((run) => {
                const active = run.id === current.id;
                return (
                  <button
                    key={run.id}
                    type="button"
                    className={cn(
                      'mb-1 w-full rounded-md px-2 py-1.5 text-left text-xs',
                      active ? 'bg-violet-500/12 font-medium text-violet-800 dark:text-violet-200' : 'hover:bg-muted/60',
                    )}
                    onClick={() => setSelectedId(run.id)}
                  >
                    <span className="block truncate">{runDisplayName(run)}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {STATUS_LABEL[run.status] ?? run.status}
                      {' · '}
                      {formatDateMinute(run.updated_at || run.created_at)}
                    </span>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
          <div className="fquant-ui min-h-0 min-w-0 flex-1 overflow-hidden">
            <RunReport detail={current} readOnly shareToken={shareToken} />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">暂无回测结果</div>
      )}
      <p className="sr-only">{name}</p>
    </div>
  );
}
