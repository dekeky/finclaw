import { IconSearch, IconX } from '@tabler/icons-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';

type GallerySearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

export function GallerySearchInput({
  value,
  onChange,
  placeholder = '搜索…',
  className,
}: GallerySearchInputProps) {
  return (
    <div className={cn('relative w-full max-w-xl', className)}>
      <IconSearch
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70"
        stroke={1.75}
        aria-hidden
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'h-9 w-full border-transparent bg-muted/50 pl-9 text-sm shadow-none transition-colors',
          'placeholder:text-muted-foreground/60 focus-visible:border-violet-500/35 focus-visible:bg-background focus-visible:ring-violet-500/25',
          value ? 'pr-9' : 'pr-3',
        )}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="清除搜索"
          className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <IconX className="size-3.5" stroke={2} />
        </button>
      ) : null}
    </div>
  );
}
