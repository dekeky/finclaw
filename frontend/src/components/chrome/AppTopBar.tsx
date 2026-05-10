import { IconMoon, IconSun } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { cn } from '../../lib/cn';
import { FinclawMark } from '../FinclawMark';

export function AppTopBar() {
  const { scheme, toggle } = useTheme();

  return (
    <header
      className={cn(
        'flex h-12 shrink-0 items-center justify-between gap-4 border-b px-4',
        'border-[var(--fc-border)] bg-[var(--fc-bg-raised)]/90 backdrop-blur-md',
      )}
    >
      <Link
        to="/"
        className="flex min-w-0 items-center gap-2.5 rounded-lg py-1 pr-3 text-[var(--fc-text)] transition-colors hover:bg-[var(--fc-bg-muted)]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--fc-border-strong)] bg-gradient-to-br from-amber-100/90 to-amber-200/50 shadow-sm dark:from-amber-900/40 dark:to-amber-950/30">
          <FinclawMark variant="mark" size={22} decorative />
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block truncate text-sm font-semibold tracking-tight">Finclaw</span>
          <span className="block truncate font-mono text-[10px] tracking-wider text-[var(--fc-text-muted)]">
            Workspace
          </span>
        </span>
      </Link>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => toggle()}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-lg border transition-colors',
            'border-transparent text-[var(--fc-text-muted)] hover:border-[var(--fc-border-strong)]',
            'hover:bg-[var(--fc-bg-muted)] hover:text-[var(--fc-text)]',
          )}
          title={scheme === 'dark' ? '浅色模式' : '深色模式'}
          aria-label={scheme === 'dark' ? '切换到浅色' : '切换到深色'}
        >
          {scheme === 'dark' ? <IconSun size={19} stroke={1.5} /> : <IconMoon size={19} stroke={1.5} />}
        </button>
      </div>
    </header>
  );
}
