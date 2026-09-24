import { useEffect, useRef } from 'react';
import { STATUS_LABEL } from '@/components/backtest/format';
import { cn } from '@/lib/cn';
import type { MentionRun } from '@/lib/backtestMention';

type Props = {
  runs: MentionRun[];
  activeIndex: number;
  loading: boolean;
  error: boolean;
  query: string;
  onPick: (run: MentionRun) => void;
};

export function BacktestMentionHints({ runs, activeIndex, loading, error, query, onPick }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const active = runs.length === 0 ? -1 : Math.min(activeIndex, runs.length - 1);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, runs]);
  let empty = '';
  if (error) empty = '回测列表加载失败';
  else if (loading && runs.length === 0) empty = '正在加载回测…';
  else if (runs.length === 0) empty = query.trim() ? '没有匹配的回测' : '没有已结束的回测';

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="选择回测"
      className="absolute bottom-full left-0 right-0 z-[100] mb-1.5 max-h-56 overflow-y-auto rounded-xl border border-border bg-card py-1 shadow-md"
    >
      {empty ? (
        <p className="px-3 py-2.5 text-sm text-muted-foreground">{empty}</p>
      ) : (
        runs.map((run, index) => (
          <button
            key={run.id}
            type="button"
            role="option"
            aria-selected={index === active}
            className={cn(
              'flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors',
              index === active ? 'bg-muted/80' : 'hover:bg-muted/80',
            )}
            onMouseDown={(event) => {
              event.preventDefault();
              onPick(run);
            }}
          >
            <span className="min-w-0 flex-1 truncate text-foreground">{run.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {STATUS_LABEL[run.status] || run.status}
            </span>
          </button>
        ))
      )}
    </div>
  );
}
