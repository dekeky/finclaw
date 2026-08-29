import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';
import {
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
        'h-4 shrink-0 px-1.5 text-[10px] font-normal',
        config.badgeClassName,
        className,
      )}
    >
      {config.shortLabel}
    </Badge>
  );
}
