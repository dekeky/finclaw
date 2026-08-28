import { useEffect, useRef, useState, type ReactNode } from 'react';

export default function VirtualList({
  count,
  itemHeight,
  renderItem,
  className,
  overscan = 10,
}: {
  count: number;
  itemHeight: number;
  renderItem: (index: number) => ReactNode;
  className?: string;
  overscan?: number;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(itemHeight * 8);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => setHeight(el.clientHeight || itemHeight * 8);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [itemHeight]);

  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const visible = Math.ceil(height / itemHeight) + overscan * 2;
  const end = Math.min(count, start + visible);

  return (
    <div
      ref={scrollerRef}
      className={className}
      style={{ overflow: 'auto' }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div style={{ height: count * itemHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', top: start * itemHeight, left: 0, right: 0 }}>
          {Array.from({ length: Math.max(0, end - start) }, (_, offset) => renderItem(start + offset))}
        </div>
      </div>
    </div>
  );
}

export function virtualWindow(count: number, scrollTop: number, height: number, rowHeight: number, overscan = 8) {
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visible = Math.ceil(height / rowHeight) + overscan * 2;
  const end = Math.min(count, start + visible);
  return { start, end };
}
