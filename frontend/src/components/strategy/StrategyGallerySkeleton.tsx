import { Skeleton } from '@/components/ui/skeleton';
import { galleryShellClassName } from '@/components/strategy/strategyGallery';
import { cn } from '@/lib/cn';

export function StrategyGallerySkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={cn(galleryShellClassName(), 'pointer-events-none min-h-[120px] p-4')}>
          <div className="space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
          <Skeleton className="mt-8 h-3 w-24" />
        </div>
      ))}
    </div>
  );
}
