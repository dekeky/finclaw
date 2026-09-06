import { useEffect, useState, type FormEvent } from 'react';
import { Dialog } from 'radix-ui';
import { IconChevronDown, IconSparkles } from '@tabler/icons-react';
import { generateStrategyLibrarySummary } from '@/api/strategyLibrary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import {
  PRIMARY_AI_PANEL_CLASS,
  PRIMARY_AI_PANEL_HOVER_CLASS,
  PRIMARY_BUTTON_CLASS,
  PRIMARY_ICON_GRADIENT_CLASS,
} from '@/lib/primaryButton';
import { useAgents } from '@/state/agents';

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
  const { currentAgent } = useAgents();
  const [polishOpen, setPolishOpen] = useState(false);
  const [polishPrompt, setPolishPrompt] = useState('');
  const [polishing, setPolishing] = useState(false);
  const [polishError, setPolishError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPolishOpen(false);
      setPolishPrompt('');
      setPolishError(null);
      setPolishing(false);
    }
  }, [open]);

  const handleOpenChange = (next: boolean) => {
    if (!next && (busy || polishing)) return;
    onOpenChange(next);
    if (!next) onCancel?.();
  };

  const onPolishSummary = async () => {
    if (!strategyName || polishing || busy) return;
    if (!currentAgent) {
      setPolishError('请先选择一个 Agent，润色将使用其模型配置');
      return;
    }
    setPolishing(true);
    setPolishError(null);
    try {
      const { summary: next } = await generateStrategyLibrarySummary(currentAgent, {
        strategy_name: strategyName,
        prompt: polishPrompt.trim() || undefined,
        current_summary: summary.trim() || undefined,
        title: title.trim() || undefined,
      });
      onSummaryChange(next);
    } catch (err) {
      setPolishError(err instanceof Error ? err.message : String(err));
    } finally {
      setPolishing(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1200] bg-black/45 supports-backdrop-filter:backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-[1201] w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2',
            'max-h-[min(90vh,640px)] overflow-y-auto rounded-xl border border-border bg-background p-5 shadow-2xl',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          )}
        >
          <Dialog.Title className="text-lg font-semibold tracking-tight text-foreground">发布至市场</Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-muted-foreground">
            将策略「{strategyName}」发布到策略市场，供其他用户浏览和使用。
          </Dialog.Description>

          {success ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-center">
                <p className="text-sm font-medium text-green-700 dark:text-green-300">已发布到策略市场</p>
                <p className="mt-1 text-xs text-muted-foreground">其他用户可在策略市场中查看并创建副本。</p>
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
                  placeholder="在策略市场中显示的名称"
                  className="h-10 text-sm"
                  disabled={busy || polishing}
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-foreground">策略简介</label>
                <div className={cn('mb-2 overflow-hidden rounded-lg', PRIMARY_AI_PANEL_CLASS)}>
                  <button
                    type="button"
                    onClick={() => setPolishOpen((value) => !value)}
                    disabled={polishing || busy}
                    aria-expanded={polishOpen}
                    className={cn(
                      'flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors',
                      PRIMARY_AI_PANEL_HOVER_CLASS,
                      (polishing || busy) && 'cursor-not-allowed opacity-70',
                    )}
                  >
                    <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-md', PRIMARY_ICON_GRADIENT_CLASS)}>
                      <IconSparkles className="size-3.5" stroke={1.75} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium text-violet-800 dark:text-violet-200">AI 润色</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {polishOpen ? '收起提示词' : '根据策略代码生成或润色简介'}
                      </span>
                    </span>
                    <IconChevronDown
                      className={cn(
                        'size-4 shrink-0 text-violet-600/70 transition-transform dark:text-violet-300/70',
                        polishOpen && 'rotate-180',
                      )}
                      stroke={1.75}
                      aria-hidden
                    />
                  </button>
                  {polishOpen && (
                    <div className="border-t border-violet-500/15 bg-background/60 px-3 py-2.5">
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          value={polishPrompt}
                          onChange={(e) => setPolishPrompt(e.target.value)}
                          placeholder="例如：突出选股逻辑与回测适用场景，语气专业简洁"
                          disabled={polishing || busy}
                          className="min-w-0 flex-1 border-violet-500/20 text-sm focus-visible:ring-violet-500/30"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              void onPolishSummary();
                            }
                          }}
                        />
                        <Button
                          type="button"
                          size="sm"
                          className={cn('shrink-0 sm:min-w-[5.5rem]', PRIMARY_BUTTON_CLASS)}
                          disabled={polishing || busy}
                          onClick={() => void onPolishSummary()}
                        >
                          {polishing ? '润色中…' : '开始润色'}
                        </Button>
                      </div>
                      {polishError && <p className="mt-2 text-xs text-destructive">{polishError}</p>}
                    </div>
                  )}
                </div>
                <textarea
                  value={summary}
                  onChange={(e) => onSummaryChange(e.target.value)}
                  placeholder="简要描述策略思路、适用场景与注意事项…"
                  disabled={busy || polishing}
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
                  disabled={busy || polishing}
                  onClick={() => handleOpenChange(false)}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className={PRIMARY_BUTTON_CLASS}
                  disabled={busy || polishing || !title.trim()}
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
