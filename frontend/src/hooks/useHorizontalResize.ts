import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function readStoredWidth(
  key: string,
  fallback: number,
  minWidth: number,
  maxWidth: number,
): number {
  if (typeof localStorage === 'undefined') return clamp(fallback, minWidth, maxWidth);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return clamp(fallback, minWidth, maxWidth);
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return clamp(fallback, minWidth, maxWidth);
    return clamp(n, minWidth, maxWidth);
  } catch {
    return clamp(fallback, minWidth, maxWidth);
  }
}

function writeStoredWidth(key: string, width: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, String(width));
  } catch {
    // quota / private mode
  }
}

export interface UseHorizontalResizeOptions {
  storageKey?: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
}

export interface HorizontalResizeHandleProps {
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => void;
}

export function useHorizontalResize({
  storageKey,
  defaultWidth,
  minWidth,
  maxWidth,
}: UseHorizontalResizeOptions) {
  const [width, setWidth] = useState(() =>
    storageKey
      ? readStoredWidth(storageKey, defaultWidth, minWidth, maxWidth)
      : clamp(defaultWidth, minWidth, maxWidth),
  );
  const [isDragging, setIsDragging] = useState(false);
  const widthRef = useRef(width);
  widthRef.current = width;

  const dragRef = useRef<{ startX: number; startWidth: number; pointerId: number } | null>(null);

  const persistWidth = useCallback(() => {
    if (storageKey) writeStoredWidth(storageKey, widthRef.current);
  }, [storageKey]);

  const finishDrag = useCallback(
    (target: HTMLDivElement, pointerId: number) => {
      dragRef.current = null;
      setIsDragging(false);
      persistWidth();
      try {
        target.releasePointerCapture(pointerId);
      } catch {
        // ignore
      }
    },
    [persistWidth],
  );

  const handleProps: HorizontalResizeHandleProps = {
    onPointerDown: useCallback(
      (e: ReactPointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        dragRef.current = {
          startX: e.clientX,
          startWidth: widthRef.current,
          pointerId: e.pointerId,
        };
        setIsDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      },
      [],
    ),
    onPointerMove: useCallback(
      (e: ReactPointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        const next = clamp(drag.startWidth + (e.clientX - drag.startX), minWidth, maxWidth);
        widthRef.current = next;
        setWidth(next);
      },
      [minWidth, maxWidth],
    ),
    onPointerUp: useCallback(
      (e: ReactPointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        finishDrag(e.currentTarget, e.pointerId);
      },
      [finishDrag],
    ),
    onPointerCancel: useCallback(
      (e: ReactPointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== e.pointerId) return;
        finishDrag(e.currentTarget, e.pointerId);
      },
      [finishDrag],
    ),
  };

  return { width, setWidth, handleProps, isDragging };
}
