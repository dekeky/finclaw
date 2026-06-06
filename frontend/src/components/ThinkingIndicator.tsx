import { formatElapsedSeconds } from '../hooks/useElapsedSeconds';

interface ThinkingIndicatorProps {
  seconds?: number;
}

export function ThinkingIndicatorShell({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`min-w-0 w-full rounded-2xl rounded-tl-sm border-2 border-amber-500/45 bg-amber-500/12 px-4 py-3.5 ring-2 ring-amber-500/25 shadow-md shadow-amber-500/15 ${className}`}
    >
      {children}
    </div>
  );
}

export function ThinkingIndicator({ seconds }: ThinkingIndicatorProps) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <span className="text-sm text-amber-900 dark:text-amber-100">努力工作中</span>
      <span className="flex shrink-0 items-center gap-0.5" aria-hidden>
        {[0, 0.2, 0.4].map((delay) => (
          <span
            key={delay}
            className="inline-block h-1 w-1 rounded-full bg-amber-600/75 animate-bounce"
            style={{ animationDelay: `${delay}s` }}
          />
        ))}
      </span>
      {seconds !== undefined && (
        <span className="shrink-0 text-xs tabular-nums text-amber-800/70 dark:text-amber-200/70">
          · {formatElapsedSeconds(seconds)}
        </span>
      )}
    </div>
  );
}
