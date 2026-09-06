import { useEffect, useMemo, useState } from 'react';
import { Dialog } from 'radix-ui';
import { IconCopy, IconLink } from '@tabler/icons-react';
import { listBacktestRuns, runDisplayName, type RunListItem } from '@/api/backtest';
import { createStrategyPublicShare } from '@/api/strategies';
import { Button } from '@/components/ui/button';
import { formatDateMinute, STATUS_LABEL } from '@/components/backtest/format';
import { copyToClipboard } from '@/lib/clipboard';
import { cn } from '@/lib/cn';
import { PRIMARY_BUTTON_CLASS } from '@/lib/primaryButton';

function isShareableRun(item: RunListItem): boolean {
  return item.status !== 'queued' && item.status !== 'running';
}

export function StrategyLinkShareDialog({
  open,
  onOpenChange,
  strategyName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  strategyName: string;
}) {
  const [items, setItems] = useState<RunListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const runs = useMemo(
    () => items.filter((item) => item.strategy_name === strategyName && isShareableRun(item)),
    [items, strategyName],
  );

  useEffect(() => {
    if (!open) {
      setSelected([]);
      setError(null);
      setShareUrl(null);
      setCopied(false);
      setBusy(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    listBacktestRuns()
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载回测记录失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, strategyName]);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  async function handleCreate() {
    if (!strategyName || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { url } = await createStrategyPublicShare(strategyName, { run_ids: selected });
      setShareUrl(url);
      await copyToClipboard(url);
      setCopied(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建分享失败');
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!shareUrl) return;
    try {
      await copyToClipboard(shareUrl);
      setCopied(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '复制失败');
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1200] bg-black/45 supports-backdrop-filter:backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-[1201] w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2',
            'max-h-[min(90vh,640px)] overflow-y-auto rounded-xl border border-border bg-background p-5 shadow-2xl',
          )}
        >
          <Dialog.Title className="text-lg font-semibold tracking-tight">分享策略</Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-muted-foreground">
            生成无需登录即可查看的链接。可选择附带该策略的回测记录。
          </Dialog.Description>

          {shareUrl ? (
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                <IconLink className="size-4 shrink-0 text-muted-foreground" stroke={1.75} />
                <input
                  readOnly
                  value={shareUrl}
                  className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none"
                />
                <Button type="button" size="xs" className={cn('gap-1', PRIMARY_BUTTON_CLASS)} onClick={() => void handleCopy()}>
                  <IconCopy className="size-3.5" stroke={1.75} />
                  {copied ? '已复制' : '复制'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                他人打开链接可查看策略代码
                {selected.length > 0 ? `与 ${selected.length} 条回测结果` : ''}
                。
              </p>
              <div className="flex justify-end">
                <Button type="button" size="sm" className={PRIMARY_BUTTON_CLASS} onClick={() => onOpenChange(false)}>
                  完成
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div>
                <p className="mb-2 text-xs font-medium">回测记录（可选）</p>
                {loading ? (
                  <p className="text-xs text-muted-foreground">加载回测记录…</p>
                ) : runs.length === 0 ? (
                  <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    暂无可分享的回测记录，将只分享策略代码。
                  </p>
                ) : (
                  <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border/70 p-1.5">
                    {runs.map((item) => {
                      const checked = selected.includes(item.id);
                      return (
                        <label
                          key={item.id}
                          className={cn(
                            'flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/60',
                            checked && 'bg-violet-500/10',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={checked}
                            onChange={() => toggle(item.id)}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{runDisplayName(item)}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {STATUS_LABEL[item.status] ?? item.status}
                              {' · '}
                              {formatDateMinute(item.updated_at || item.created_at)}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onOpenChange(false)}>
                  取消
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className={PRIMARY_BUTTON_CLASS}
                  disabled={busy || loading || !strategyName}
                  onClick={() => void handleCreate()}
                >
                  {busy ? '生成中…' : '生成链接'}
                </Button>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
