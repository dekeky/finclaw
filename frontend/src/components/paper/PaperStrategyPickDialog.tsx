import { Dialog } from 'radix-ui';
import type { StrategySummary } from '@/api/strategies';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

export function PaperStrategyPickDialog({
  open,
  strategies,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  strategies: StrategySummary[];
  onOpenChange: (open: boolean) => void;
  onPick: (strategy: StrategySummary) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1200] bg-black/45 supports-backdrop-filter:backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-[1201] flex w-[min(440px,calc(100vw-32px))] max-h-[min(560px,calc(100vh-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden',
            'rounded-xl border border-border bg-background shadow-2xl',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          )}
        >
          <div className="flex min-h-10 shrink-0 items-center justify-between gap-3 border-b border-border px-3">
            <Dialog.Title className="text-sm font-semibold tracking-tight">选择策略</Dialog.Title>
            <Dialog.Description className="sr-only">从 FinClaw 策略中选择一个，用于开启实盘模拟。</Dialog.Description>
            <button
              type="button"
              className="inline-flex size-[22px] items-center justify-center rounded-md border border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
              onClick={() => onOpenChange(false)}
              aria-label="关闭"
            >
              ×
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-2">
            {strategies.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-muted-foreground">没有可运行的 FinClaw 策略。</p>
            ) : (
              <ul className="space-y-1">
                {strategies.map((item) => (
                  <li key={item.id || item.name}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => onPick(item)}
                    >
                      <span className="font-medium">{item.name}</span>
                      <span className="text-xs text-muted-foreground">.py</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex justify-end border-t border-border px-3 py-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              取消
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
