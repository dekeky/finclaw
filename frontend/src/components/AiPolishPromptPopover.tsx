import { Popover } from 'radix-ui';
import { IconSparkles } from '@tabler/icons-react';
import TextareaAutosize from 'react-textarea-autosize';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import {
  PRIMARY_AI_PANEL_CLASS,
  PRIMARY_BUTTON_CLASS,
  PRIMARY_ICON_GRADIENT_CLASS,
} from '@/lib/primaryButton';

export interface AiPolishPromptPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  submitting?: boolean;
  disabled?: boolean;
  placeholder?: string;
  triggerClassName?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
}

export function AiPolishPromptPopover({
  open,
  onOpenChange,
  prompt,
  onPromptChange,
  onSubmit,
  submitting = false,
  disabled = false,
  placeholder = '翻译为中文',
  triggerClassName,
  side = 'bottom',
  align = 'center',
}: AiPolishPromptPopoverProps) {
  const busy = submitting || disabled;

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Popover.Trigger asChild>
            <button
              type="button"
              className={cn(
                'flex shrink-0 items-center rounded-md border-none bg-transparent p-0 transition-opacity hover:opacity-90',
                busy && 'opacity-80',
                triggerClassName,
              )}
              disabled={busy}
              aria-label={open ? '收起润色输入' : 'AI 润色'}
              aria-expanded={open}
            >
              <span
                className={cn(
                  'flex size-6 items-center justify-center rounded-md',
                  PRIMARY_ICON_GRADIENT_CLASS,
                )}
              >
                <IconSparkles className="size-3.5" stroke={1.75} aria-hidden />
              </span>
            </button>
          </Popover.Trigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6} className="z-[1220]">
          {open ? '收起润色输入' : 'AI 润色'}
        </TooltipContent>
      </Tooltip>

      <Popover.Portal>
        <Popover.Content
          side={side}
          align={align}
          sideOffset={10}
          collisionPadding={12}
          className={cn(
            'z-[1220] w-[min(92vw,22rem)] rounded-xl p-3 shadow-xl outline-none',
            'border border-violet-500/30 bg-background/72 backdrop-blur-xl',
            'supports-backdrop-filter:bg-background/55',
            PRIMARY_AI_PANEL_CLASS,
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          )}
          onOpenAutoFocus={(e) => {
            const field = (e.currentTarget as HTMLElement).querySelector('textarea');
            if (field instanceof HTMLTextAreaElement) {
              e.preventDefault();
              field.focus();
            }
          }}
        >
          <Popover.Arrow className="fill-background/80" />
          <p className="text-xs font-medium text-violet-800 dark:text-violet-200">AI 润色</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            输入润色要求，下方文档仍可浏览与滚动
          </p>
          <div className="mt-2.5 flex flex-col gap-2">
            <TextareaAutosize
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder={placeholder}
              disabled={busy}
              minRows={2}
              maxRows={8}
              className={cn(
                'w-full min-w-0 resize-none rounded-md border border-violet-500/20 bg-background/80 px-2.5 py-1.5 text-xs',
                'break-words whitespace-pre-wrap leading-relaxed',
                'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-violet-500/30',
                'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
              )}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  if (prompt.trim() && !busy) onSubmit();
                }
              }}
            />
            <p className="text-[10px] text-muted-foreground/80">Ctrl+Enter 开始润色</p>
            <Button
              type="button"
              size="sm"
              className={cn('h-8 w-full text-xs', PRIMARY_BUTTON_CLASS)}
              disabled={!prompt.trim() || busy}
              onClick={() => onSubmit()}
            >
              {submitting ? '润色中…' : '开始润色'}
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
