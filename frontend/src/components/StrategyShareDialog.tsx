import type { FormEvent } from 'react';
import { Dialog } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { PRIMARY_BUTTON_CLASS } from '@/lib/primaryButton';

export interface StrategyShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  strategyName: string;
  title: string;
  onTitleChange: (title: string) => void;
  summary: string;
  onSummaryChange: (summary: string) => void;
  busy?: boolean;
  error?: string | null;
  success?: boolean;
  onSubmit: (e: FormEvent) => void;
  onCancel?: () => void;
}

export function StrategyShareDialog({
  open,
  onOpenChange,
  strategyName,
  title,
  onTitleChange,
  summary,
  onSummaryChange,
  busy = false,
  error,
  success = false,
  onSubmit,
  onCancel,
}: StrategyShareDialogProps) {
  const handleOpenChange = (next: boolean) => {
    if (!next && busy) return;
    onOpenChange(next);
    if (!next) onCancel?.();
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1200] bg-black/45 supports-backdrop-filter:backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-[1201] w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2',
            'rounded-xl border border-border bg-background p-5 shadow-2xl',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          )}
        >
          <Dialog.Title className="text-lg font-semibold tracking-tight text-foreground">分享到策略库</Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-muted-foreground">
            将策略「{strategyName}」发布到策略库，供其他用户浏览和使用。
          </Dialog.Description>

          {success ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-center">
                <p className="text-sm font-medium text-green-700 dark:text-green-300">已发布到策略库</p>
                <p className="mt-1 text-xs text-muted-foreground">其他用户可在策略库中查看并创建副本。</p>
              </div>
              <div className="flex justify-end">
                <Button type="button" size="sm" className={PRIMARY_BUTTON_CLASS} onClick={() => handleOpenChange(false)}>
                  完成
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground">展示标题</label>
                <Input
                  value={title}
                  onChange={(e) => onTitleChange(e.target.value)}
                  placeholder="在策略库中显示的名称"
                  className="h-10 text-sm"
                  disabled={busy}
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground">策略简介</label>
                <textarea
                  value={summary}
                  onChange={(e) => onSummaryChange(e.target.value)}
                  placeholder="简要描述策略思路、适用场景与注意事项…"
                  disabled={busy}
                  rows={4}
                  className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>

              {error && <p className="text-xs text-destructive">{error}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => handleOpenChange(false)}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className={PRIMARY_BUTTON_CLASS}
                  disabled={busy || !title.trim()}
                >
                  {busy ? '发布中…' : '确认发布'}
                </Button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
