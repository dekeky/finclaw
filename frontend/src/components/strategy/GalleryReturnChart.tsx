import { cn } from '@/lib/cn';
import { paperSignedClass } from '@/lib/paperSession';
import type { ReturnPt } from '@/lib/galleryReturn';

export function GalleryReturnChart({
  series,
  className,
}: {
  series: ReturnPt[];
  className?: string;
}) {
  if (series.length < 2) return null;
  const values = series.map((point) => point.value);
  const last = values[values.length - 1] ?? 0;
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const width = 160;
  const height = 56;
  const coords = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - ((value - min) / span) * (height - 6) - 3;
    return { x, y };
  });
  const line = coords
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('h-14 w-full', paperSignedClass(last), className)}
      aria-hidden
    >
      <path d={area} fill="currentColor" opacity="0.14" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
