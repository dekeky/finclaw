import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/cn';
import {
  STRATEGY_PLATFORM_LIST,
  getStrategyPlatformConfig,
  normalizeStrategyPlatform,
  type StrategyPlatform,
} from '@/lib/strategyPlatforms';

export function StrategyPlatformBadge({
  platform,
  className,
}: {
  platform: StrategyPlatform | string;
  className?: string;
}) {
  const config = getStrategyPlatformConfig(normalizeStrategyPlatform(platform));
  return (
    <Badge
      variant="outline"
      className={cn(
        'h-4 shrink-0 border-violet-500/25 bg-violet-500/8 px-1.5 text-[10px] font-normal text-violet-700 dark:text-violet-300',
        className,
      )}
    >
      {config.shortLabel}
    </Badge>
  );
}

export function StrategyPlatformSelect({
  value,
  onChange,
  disabled,
  className,
}: {
  value: StrategyPlatform;
  onChange: (value: StrategyPlatform) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(normalizeStrategyPlatform(next))}
      disabled={disabled}
    >
      <SelectTrigger className={cn('w-full', className)} size="sm">
        <SelectValue placeholder="选择回测平台" />
      </SelectTrigger>
      <SelectContent>
        {STRATEGY_PLATFORM_LIST.map((platform) => (
          <SelectItem key={platform.id} value={platform.id}>
            {platform.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
