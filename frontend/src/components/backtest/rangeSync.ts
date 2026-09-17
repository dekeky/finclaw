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

export function recentLogicalRange(
  barCount: number,
  visibleCount: number,
  plotWidth?: number,
): VisibleLogicalRange | null {
  if (barCount <= 0) return null;
  const last = barCount - 1;
  const count = Math.min(Math.max(Math.floor(visibleCount), 1), barCount);
  const pad = rangeEdgePad(count, plotWidth);
  return {
    from: last - count + 1 - pad,
    to: last + pad,
  };
}

export function isBoxZoomGesture(dx: number, _dy = 0, minPx = 12): boolean {
  return Math.abs(dx) >= minPx;
}

export function isChartPlotPoint(
  x: number,
  y: number,
  plot: { width: number; height: number; timeAxisHeight: number },
): boolean {
  if (x < 0 || y < 0) return false;
  if (x > plot.width) return false;
  if (y > plot.height - Math.max(plot.timeAxisHeight, 0)) return false;
  return true;
}

export function boxZoomLogicalRange(
  startLogical: number,
  endLogical: number,
  barCount: number,
  _plotWidth?: number,
): VisibleLogicalRange | null {
  if (barCount <= 0) return null;
  if (!Number.isFinite(startLogical) || !Number.isFinite(endLogical)) return null;
  const last = barCount - 1;
  const rawFrom = Math.min(startLogical, endLogical);
  const rawTo = Math.max(startLogical, endLogical);
  if (rawTo - rawFrom < 1) return null;
  const fromBar = Math.max(0, Math.min(last, Math.floor(rawFrom)));
  const toBar = Math.max(0, Math.min(last, Math.ceil(rawTo)));
  if (toBar - fromBar < 1) return null;
  const selected = toBar - fromBar;
  const visible = selected / 0.8;
  const pad = (visible - selected) / 2;
  return { from: fromBar - pad, to: toBar + pad };
}

export function initialVisibleRange(
  barCount: number,
  options: { focusIndex?: number; visibleBars?: number; plotWidth?: number } = {},
): VisibleLogicalRange | null {
  const focusIndex = options.focusIndex ?? -1;
  if (options.visibleBars && options.visibleBars > 0) {
    return recentLogicalRange(barCount, options.visibleBars, options.plotWidth);
  }
  if (focusIndex >= 0) {
    return focusedLogicalRange(barCount, focusIndex, 45, options.plotWidth);
  }
  return fullLogicalRange(barCount, options.plotWidth);
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
