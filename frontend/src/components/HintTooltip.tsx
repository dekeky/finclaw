import { IconInfoCircle } from '@tabler/icons-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';

type HintTooltipProps = {
  text: string;
  className?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
};

/** 悬停图标展示说明文字，替代页内常驻提示文案。 */
export function HintTooltip({ text, className, side = 'top' }: HintTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            className,
          )}
          aria-label="查看说明"
        >
          <IconInfoCircle className="size-3.5" stroke={1.75} />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-[18rem] leading-relaxed">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
