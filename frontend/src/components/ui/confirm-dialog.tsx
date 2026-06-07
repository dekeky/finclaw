import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Dialog } from 'radix-ui';
import { IconAlertTriangle } from '@tabler/icons-react';
import { cn } from '@/lib/cn';

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** 危险操作（红色按钮 + 警告图标）。 */
  danger?: boolean;
}

function ConfirmDialog({
  open,
  title,
  description,
  confirmText = '确定',
  cancelText = '取消',
  danger,
  onConfirm,
  onCancel,
}: ConfirmOptions & {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1200] bg-black/45 supports-backdrop-filter:backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-[1201] w-[min(92vw,26rem)] -translate-x-1/2 -translate-y-1/2',
            'rounded-xl border border-border bg-background p-5 shadow-2xl',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          )}
        >
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-full',
                danger ? 'bg-destructive/10 text-destructive' : 'bg-violet-500/10 text-violet-500',
              )}
              aria-hidden
            >
              <IconAlertTriangle className="size-5" stroke={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-sm font-semibold text-foreground">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {description}
                </Dialog.Description>
              )}
            </div>
          </div>

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-border/70 px-3.5 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
            >
              {cancelText}
            </button>
            <button
              type="button"
              autoFocus
              onClick={onConfirm}
              className={cn(
                'rounded-lg px-3.5 py-1.5 text-sm font-medium text-white shadow-sm transition-colors',
                danger ? 'bg-destructive hover:bg-destructive/90' : 'bg-violet-500 hover:bg-violet-600',
              )}
            >
              {confirmText}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * 命令式确认弹窗：
 *   const { confirm, dialog } = useConfirm();
 *   if (await confirm({ title: '删除文件', danger: true })) { ... }
 *   // 在 JSX 中渲染 {dialog}
 */
export function useConfirm() {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setOpts(options);
      }),
    [],
  );

  const settle = useCallback((result: boolean) => {
    resolver.current?.(result);
    resolver.current = null;
    setOpts(null);
  }, []);

  const dialog = (
    <ConfirmDialog
      open={opts !== null}
      title={opts?.title ?? ''}
      description={opts?.description}
      confirmText={opts?.confirmText}
      cancelText={opts?.cancelText}
      danger={opts?.danger}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  );

  return { confirm, dialog };
}
