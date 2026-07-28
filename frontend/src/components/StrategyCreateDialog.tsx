import type { FormEvent } from 'react';
import { Dialog } from 'radix-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StrategyPlatformSelect } from '@/components/StrategyPlatformField';
import { cn } from '@/lib/cn';
import { strategyRelPath } from '@/api/strategies';
import type { StrategyPlatform } from '@/lib/strategyPlatforms';
import { PRIMARY_BUTTON_CLASS } from '@/lib/primaryButton';

export interface StrategyCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  onNameChange: (name: string) => void;
  platform: StrategyPlatform;
  onPlatformChange: (platform: StrategyPlatform) => void;
  nameConflict?: boolean;
  busy?: boolean;
  error?: string | null;
  onSubmit: (e: FormEvent) => void;
  onCancel?: () => void;
}

export function StrategyCreateDialog({
  open,
  onOpenChange,
  name,
  onNameChange,
  platform,
  onPlatformChange,
  nameConflict = false,
  busy = false,
  error,
  onSubmit,
  onCancel,
}: StrategyCreateDialogProps) {
  const handleOpenChange = (next: boolean) => {
    if (!next && busy) return;
    onOpenChange(next);
    if (!next) onCancel?.();
  };

  const previewPath = name.trim() ? strategyRelPath(name.trim()) : 'strategies/策略名称.py';

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1200] bg-black/45 supports-backdrop-filter:backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-[1201] w-[min(92vw,24rem)] -translate-x-1/2 -translate-y-1/2',
            'rounded-xl border border-border bg-background p-5 shadow-2xl',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          )}
        >
          <Dialog.Title className="text-lg font-semibold tracking-tight text-foreground">新建策略</Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-muted-foreground">
            每个策略对应一个 Python 文件，创建后可在编辑器中修改，或通过 AI 对话生成。
          </Dialog.Description>

          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">策略名称</label>
              <Input
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="例如：双均线策略"
                className="h-10 text-sm"
                disabled={busy}
                autoFocus
              />
              {nameConflict && (
                <p className="mt-1.5 text-[11px] text-destructive">已存在同名策略，请换一个名称。</p>
              )}
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground">回测平台</label>
              <StrategyPlatformSelect
                value={platform}
                onChange={onPlatformChange}
                disabled={busy}
              />
              <p className="mt-1.5 text-[11px] text-muted-foreground">当前仅支持聚宽，更多平台即将上线。</p>
            </div>

            <p className="rounded-lg bg-muted/50 px-3 py-2 font-mono text-[11px] text-muted-foreground">
              文件路径：{previewPath}
            </p>

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
                disabled={busy || !name.trim() || nameConflict}
              >
                {busy ? '创建中…' : '创建'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
