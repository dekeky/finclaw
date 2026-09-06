export type VisibleLogicalRange = {
  from: number;
  to: number;
};

// Bars are centered on integer indexes; a flush 0..n-1 range clips the
// first/last candle and the yyyy-MM-dd ticks at both edges.
function rangeEdgePad(barCount: number, plotWidth?: number): number {
  if (barCount <= 0) return 0;
  if (plotWidth && plotWidth > 0) {
    const halfLabel = 36;
    const spacing = plotWidth / Math.max(barCount, 1);
    return Math.max(0.75, halfLabel / Math.max(spacing, 1));
  }
  return Math.max(0.75, Math.min(12, barCount * 0.035));
}

export function fullLogicalRange(barCount: number, plotWidth?: number): VisibleLogicalRange | null {
  if (barCount <= 0) return null;
  const last = Math.max(barCount - 1, 0);
  const pad = rangeEdgePad(barCount, plotWidth);
  return { from: -pad, to: last + pad };
}

export function sameLogicalRange(left?: VisibleLogicalRange | null, right?: VisibleLogicalRange | null): boolean {
  if (!left || !right) return false;
  return Math.abs(left.from - right.from) < 0.02 && Math.abs(left.to - right.to) < 0.02;
}

export function isFullLogicalRange(range: VisibleLogicalRange | null | undefined, barCount: number): boolean {
  const full = fullLogicalRange(barCount);
  if (!range || !full) return false;
  return Math.abs(range.from - full.from) < 1 && Math.abs(range.to - full.to) < 1;
}

export function indexForDay(times: string[], day: string): number {
  if (!times.length || !day) return -1;
  let lo = 0;
  let hi = times.length - 1;
  if (day <= times[0]) return 0;
  if (day >= times[hi]) return hi;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid] === day) return mid;
    if (times[mid] < day) lo = mid + 1;
    else hi = mid - 1;
  }
  return hi;
}

export function focusedLogicalRange(
  barCount: number,
  index: number,
  radius = 45,
  plotWidth?: number,
): VisibleLogicalRange | null {
  if (barCount <= 0 || index < 0) return null;
  const pad = rangeEdgePad(barCount, plotWidth);
  return {
    from: Math.max(0, index - radius) - pad,
    to: Math.min(barCount - 1, index + radius) + pad,
  };
}

export type RangeSync = {
  last: VisibleLogicalRange | null;
  subscribe: (listener: (range: VisibleLogicalRange, source: unknown) => void) => () => void;
  publish: (range: VisibleLogicalRange, source: unknown) => void;
};

export function createRangeSync(): RangeSync {
  const listeners = new Set<(range: VisibleLogicalRange, source: unknown) => void>();
  const sync: RangeSync = {
    last: null,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish(range, source) {
      if (sameLogicalRange(sync.last, range)) return;
      sync.last = range;
      for (const listener of listeners) listener(range, source);
    },
  };
  return sync;
}
