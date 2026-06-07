import { Dialog } from 'radix-ui';
import { IconCheck, IconLoader2 } from '@tabler/icons-react';
import { cn } from '@/lib/cn';
import type { PersonaFileName } from '../api/agents';
import { PERSONA_FILE_LABELS } from '../api/agents';

export type GenerateStepStatus = 'pending' | 'active' | 'done' | 'error';

export interface GenerateStep {
  id: string;
  label: string;
  status: GenerateStepStatus;
}

interface PersonaGenerateDialogProps {
  open: boolean;
  fileName?: PersonaFileName;
  prompt?: string;
  /** 展示在信息框中的主文本；未提供时使用 prompt。 */
  subject?: string;
  subjectLabel?: string;
  title?: string;
  description?: string;
  successMessage?: string;
  steps: GenerateStep[];
  error: string | null;
  /** success 时短暂展示后由父组件关闭 */
  phase: 'running' | 'success' | 'error';
}

function StepIcon({ status }: { status: GenerateStepStatus }) {
  if (status === 'done') {
    return <IconCheck className="size-4 text-emerald-600" aria-hidden />;
  }
  if (status === 'active') {
    return <IconLoader2 className="size-4 animate-spin text-primary" aria-hidden />;
  }
  if (status === 'error') {
    return <span className="size-4 text-center text-xs text-destructive">!</span>;
  }
  return <span className="size-4 rounded-full border border-border/80 bg-muted/40" aria-hidden />;
}

export function PersonaGenerateDialog({
  open,
  fileName,
  prompt,
  subject,
  subjectLabel = '提示词',
  title,
  description,
  successMessage,
  steps,
  error,
  phase,
}: PersonaGenerateDialogProps) {
  const label = fileName ? PERSONA_FILE_LABELS[fileName].title : '';
  const dialogTitle = title ?? (label ? `AI 润色 ${label}` : 'AI 处理中');
  const dialogDescription = description ?? '正在根据你的描述润色内容…';
  const dialogSubject = subject ?? prompt ?? '';

  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1210] bg-black/40 supports-backdrop-filter:backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-[1211] w-[min(92vw,24rem)] -translate-x-1/2 -translate-y-1/2',
            'rounded-xl border border-border bg-background p-5 shadow-xl',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          )}
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <Dialog.Title className="text-sm font-semibold text-foreground">
            {dialogTitle}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-muted-foreground">
            {dialogDescription}
          </Dialog.Description>

          <div className="mt-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{subjectLabel}</p>
            <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-foreground/90">{dialogSubject}</p>
          </div>

          <ol className="mt-4 space-y-2.5">
            {steps.map((step) => (
              <li key={step.id} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
                  <StepIcon status={step.status} />
                </span>
                <span
                  className={cn(
                    'text-xs leading-relaxed',
                    step.status === 'active' && 'font-medium text-foreground',
                    step.status === 'done' && 'text-muted-foreground',
                    step.status === 'pending' && 'text-muted-foreground/70',
                    step.status === 'error' && 'text-destructive',
                  )}
                >
                  {step.label}
                </span>
              </li>
            ))}
          </ol>

          {phase === 'success' && (
            <p className="mt-4 text-xs text-emerald-600">{successMessage ?? '润色完成，正在关闭…'}</p>
          )}
          {phase === 'error' && error && (
            <p className="mt-4 text-xs text-destructive">{error}</p>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export const PERSONA_GENERATE_STEP_DEFS = [
  { id: 'validate', label: '校验输入' },
  { id: 'call', label: '正在润色' },
  { id: 'finalize', label: '写入编辑器' },
] as const;

export function initialGenerateSteps(): GenerateStep[] {
  return PERSONA_GENERATE_STEP_DEFS.map((s) => ({
    id: s.id,
    label: s.label,
    status: 'pending' as const,
  }));
}

export function setGenerateStepStatus(
  steps: GenerateStep[],
  activeId: string | null,
  doneIds: string[],
  errorId?: string,
): GenerateStep[] {
  return steps.map((step) => {
    if (errorId && step.id === errorId) return { ...step, status: 'error' as const };
    if (doneIds.includes(step.id)) return { ...step, status: 'done' as const };
    if (step.id === activeId) return { ...step, status: 'active' as const };
    return { ...step, status: 'pending' as const };
  });
}
