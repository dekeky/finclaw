export type VisibleLogicalRange = {
  from: number;
  to: number;
};

export function fullLogicalRange(barCount: number): VisibleLogicalRange | null {
  if (barCount <= 0) return null;
  return { from: 0, to: Math.max(barCount - 1, 0) };
}

export function sameLogicalRange(left?: VisibleLogicalRange | null, right?: VisibleLogicalRange | null): boolean {
  if (!left || !right) return false;
  return Math.abs(left.from - right.from) < 0.02 && Math.abs(left.to - right.to) < 0.02;
}

export function isFullLogicalRange(range: VisibleLogicalRange | null | undefined, barCount: number): boolean {
  const full = fullLogicalRange(barCount);
  if (!range || !full) return false;
  return Math.abs(range.from) < 1 && Math.abs(range.to - full.to) < 1;
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
