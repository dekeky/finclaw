import { cn } from '@/lib/cn';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/** 卡片绝对时间：精确到秒。 */
export function formatAbsoluteTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return '';
  }
}

/**
 * 卡片时间展示：三天内用「多久前」，三天前（含）用具体日期（精确到秒）。
 */
export function formatGalleryTime(iso: string): string {
  try {
    const ts = new Date(iso).getTime();
    if (Number.isNaN(ts)) return '';
    const diffMs = Date.now() - ts;
    if (diffMs < 0) return '刚刚';
    if (diffMs >= THREE_DAYS_MS) return formatAbsoluteTime(iso);

    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes} 分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    return `${days} 天前`;
  } catch {
    return '';
  }
}

export function galleryShellClassName(className?: string) {
  return cn(
    'group relative flex flex-col rounded-xl border border-border bg-card text-left',
    'transition-colors hover:border-primary/40 hover:bg-muted/30',
    className,
  );
}
