import type { FormEvent, ReactNode } from 'react';
import { Dialog } from 'radix-ui';
import {
  AgentModelSetupSection,
  type AgentManualModelFields,
  type AgentModelCredMode,
  type ReuseAgentSourceMeta,
} from '@/components/AgentModelSetupSection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';

export interface AgentCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  existingAgents: string[];
  name: string;
  onNameChange: (name: string) => void;
  nameConflict?: boolean;
  credMode: AgentModelCredMode;
  onCredModeChange: (mode: AgentModelCredMode) => void;
  reuseAgent: string;
  onReuseAgentChange: (name: string) => void;
  manual: AgentManualModelFields;
  onManualChange: (patch: Partial<AgentManualModelFields>) => void;
  onReuseMetaChange?: (meta: ReuseAgentSourceMeta) => void;
  busy?: boolean;
  submitDisabled?: boolean;
  error?: string | null;
  hint?: string | null;
  onSubmit: (e: FormEvent) => void;
  onCancel?: () => void;
}

export function AgentCreateDialog({
  open,
  onOpenChange,
  title,
  description,
  existingAgents,
  name,
  onNameChange,
  nameConflict = false,
  credMode,
  onCredModeChange,
  reuseAgent,
  onReuseAgentChange,
  manual,
  onManualChange,
  onReuseMetaChange,
  busy = false,
  submitDisabled = false,
  error,
  hint,
  onSubmit,
  onCancel,
}: AgentCreateDialogProps) {
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
            'fixed left-1/2 top-1/2 z-[1201] w-[min(92vw,42rem)] -translate-x-1/2 -translate-y-1/2',
            'max-h-[min(90vh,720px)] overflow-y-auto rounded-xl border border-border bg-background p-5 shadow-2xl',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          )}
        >
          <Dialog.Title className="text-lg font-semibold tracking-tight text-foreground">{title}</Dialog.Title>
          {description ? (
            <Dialog.Description className="mt-1 text-xs text-muted-foreground">{description}</Dialog.Description>
          ) : null}

          <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-4">
            <section className="rounded-xl border border-violet-500/15 bg-violet-500/[0.03] p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2.5">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-violet-500 text-[11px] font-semibold text-white">
                  1
                </span>
                <h3 className="text-sm font-semibold text-foreground">为 Agent 命名</h3>
              </div>
              <Input
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="例如：宏观研究"
                className="h-10 text-sm"
                disabled={busy}
                autoFocus
              />
              {nameConflict && (
                <p className="mt-1.5 text-[11px] text-destructive">已存在同名 Agent，请换一个名称。</p>
              )}
            </section>

            <AgentModelSetupSection
              existingAgents={existingAgents}
              credMode={credMode}
              onCredModeChange={onCredModeChange}
              reuseAgent={reuseAgent}
              onReuseAgentChange={onReuseAgentChange}
              manual={manual}
              onManualChange={onManualChange}
              disabled={busy}
              active={open}
              onReuseMetaChange={onReuseMetaChange}
            />

            {error && <p className="text-xs text-destructive">{error}</p>}
            {hint && !error && !busy && <p className="text-xs text-muted-foreground">{hint}</p>}

            <div className="flex justify-end gap-2 border-t border-border/50 pt-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => handleOpenChange(false)}
              >
                取消
              </Button>
              <Button
                type="submit"
                size="sm"
                className="min-w-[6.5rem] bg-violet-600 hover:bg-violet-600/90"
                disabled={submitDisabled || busy}
              >
                {busy ? '创建中…' : '创建 Agent'}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
