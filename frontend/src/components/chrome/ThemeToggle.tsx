import { IconMoon, IconSun } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTheme } from '@/context/ThemeContext';
import { TOOLBAR_ICON_BUTTON_CLASS } from '@/lib/toolbarButton';

export function ThemeToggle() {
  const { scheme, toggle } = useTheme();
  const label = scheme === 'dark' ? '浅色模式' : '深色模式';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={TOOLBAR_ICON_BUTTON_CLASS}
          aria-label={label}
          onClick={() => toggle()}
        >
          {scheme === 'dark' ? <IconSun className="size-4" /> : <IconMoon className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
