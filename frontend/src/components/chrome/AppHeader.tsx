import { IconMoon, IconSun } from '@tabler/icons-react';
import { useTheme } from '../../context/ThemeContext';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { FinclawMark } from '../FinclawMark';
import { Link } from 'react-router-dom';

export function AppHeader() {
  const { scheme, toggle } = useTheme();

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/50 bg-background/95 px-4 pt-2 backdrop-blur supports-backdrop-filter:bg-background/60">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />

      <Link to="/" className="flex items-center gap-2 no-underline">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-amber-400/35 bg-gradient-to-br from-amber-100/90 to-amber-200/50 shadow-sm dark:from-amber-900/40 dark:to-amber-950/30">
          <FinclawMark variant="mark" size={18} decorative />
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block text-sm font-medium tracking-tight text-foreground/90">Finclaw</span>
        </span>
      </Link>

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => toggle()}
          title={scheme === 'dark' ? '浅色模式' : '深色模式'}
        >
          {scheme === 'dark' ? <IconSun className="size-4" /> : <IconMoon className="size-4" />}
        </Button>
      </div>
    </header>
  );
}
