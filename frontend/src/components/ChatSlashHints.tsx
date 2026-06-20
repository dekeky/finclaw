import { cn } from '@/lib/cn';
import type { KeyboardEvent } from 'react';

export const CHAT_SLASH_COMMANDS = [
  { command: '/stop', description: '中止当前回复' },
  { command: '/clear', description: '清空对话历史' },
] as const;

export type SlashCommand = (typeof CHAT_SLASH_COMMANDS)[number];

/** 全角斜杠 → 半角，便于中文输入法 */
export function normalizeSlashInput(value: string): string {
  return value.replace(/\uFF0F/g, '/');
}

export function getExactSlashCommand(value: string): SlashCommand | null {
  const t = normalizeSlashInput(value).trim();
  return CHAT_SLASH_COMMANDS.find((c) => c.command === t) ?? null;
}

/** 输入以 / 开头、尚未包含空格，且未完整匹配某条命令时，展示提示 */
export function shouldShowSlashHints(value: string): boolean {
  if (getExactSlashCommand(value)) return false;
  const t = normalizeSlashInput(value).trimStart();
  return t.startsWith('/') && !/\s/.test(t);
}

export function filterSlashCommands(value: string): SlashCommand[] {
  const t = normalizeSlashInput(value).trimStart();
  const query = t.slice(1).toLowerCase();
  return CHAT_SLASH_COMMANDS.filter(
    (c) => query === '' || c.command.slice(1).toLowerCase().startsWith(query),
  );
}

/** Enter / Tab：未补全时补全；已补全时走 onSend（发送或执行命令） */
export function handleSlashInputKeyDown(
  e: KeyboardEvent<HTMLTextAreaElement>,
  value: string,
  opts: {
    onAutocomplete: (command: string) => void;
    onSend: () => void;
  },
): void {
  if (e.key === 'Tab' && shouldShowSlashHints(value)) {
    const items = filterSlashCommands(value);
    if (items.length > 0) {
      e.preventDefault();
      opts.onAutocomplete(items[0].command);
    }
    return;
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (shouldShowSlashHints(value)) {
      const items = filterSlashCommands(value);
      if (items.length > 0) {
        opts.onAutocomplete(items[0].command);
        return;
      }
    }
    opts.onSend();
  }
}

type Props = {
  value: string;
  onPick: (command: string) => void;
  className?: string;
};

export function ChatSlashHints({ value, onPick, className }: Props) {
  if (!shouldShowSlashHints(value)) return null;
  const items = filterSlashCommands(value);
  if (items.length === 0) return null;

  return (
    <div
      role="listbox"
      aria-label="命令提示"
      className={cn(
        'absolute bottom-full left-0 right-0 z-[100] mb-1.5 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-md',
        className,
      )}
    >
      {items.map((item) => (
        <button
          key={item.command}
          type="button"
          role="option"
          className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/80"
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(item.command);
          }}
        >
          <span className="shrink-0 font-mono font-medium text-foreground">{item.command}</span>
          <span className="text-muted-foreground">{item.description}</span>
        </button>
      ))}
    </div>
  );
}
