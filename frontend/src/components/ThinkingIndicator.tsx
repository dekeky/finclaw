import { IconClock, IconLoader2 } from '@tabler/icons-react';

import { formatElapsedSeconds } from '../hooks/useElapsedSeconds';

/** 用时钟图标展示耗时（进行中 / 结束后共用） */
export function ElapsedTimeBadge({
  seconds,
  className = '',
}: {
  seconds: number;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-md border border-violet-500/20 bg-background px-1.5 py-0.5 text-[10px] font-medium text-violet-600/85 dark:text-violet-400/85 ${className}`}
    >
      <IconClock className="size-2.5 shrink-0" stroke={1.75} aria-hidden />
      {formatElapsedSeconds(seconds)}
    </span>
  );
}

interface ThinkingIndicatorProps {
  seconds?: number;
  statusLabel?: string;
}

/** 工作过程容器 — violet 框架，与内部内容卡片形成层次 */
export const PROCESS_PANEL_SHELL_CLASS =
  'min-w-0 w-full rounded-2xl rounded-tl-sm border border-violet-500/45 bg-violet-500/[0.12] border-l-[3px] border-l-violet-500/85';

/** 品牌紫：左侧色条 + 淡紫底，进行中有微弱呼吸光晕 */
export function ThinkingIndicatorShell({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`fc-process-active ${PROCESS_PANEL_SHELL_CLASS} px-4 py-3.5 ${className}`}>
      {children}
    </div>
  );
}

export function ThinkingIndicator({ seconds, statusLabel }: ThinkingIndicatorProps) {
  const label = statusLabel ?? '努力工作中';

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <IconLoader2
        className="size-3.5 shrink-0 animate-spin text-violet-600 dark:text-violet-400"
        stroke={2}
        aria-hidden
      />
      <span className="text-sm font-medium text-violet-700 dark:text-violet-300">{label}</span>
      <span className="flex shrink-0 items-center gap-0.5" aria-hidden>
        {[0, 0.2, 0.4].map((delay) => (
          <span
            key={delay}
            className="fc-typing-dot inline-block size-1 rounded-full bg-violet-500/55"
            style={{ animationDelay: `${delay}s` }}
          />
        ))}
      </span>
      {seconds !== undefined && (
        <ElapsedTimeBadge seconds={seconds} className="ml-auto text-xs" />
      )}
    </div>
  );
}
