import { dayKey } from './format.ts';

export type InspectPriceLoadPlan = {
  refetch: boolean;
  showLoading: boolean;
  clearPrices: boolean;
};

export function inspectPriceRequestKey(code: string, startTime: string, endTime: string): string {
  return `${code}|${startTime}|${endTime}`;
}

export function seedCoversInspectRange(
  seedPrices: Array<{ time?: string | number | null }>,
  startTime: string,
  endTime: string,
): boolean {
  if (!seedPrices.length) return false;
  const first = dayKey(seedPrices[0]?.time);
  const last = dayKey(seedPrices[seedPrices.length - 1]?.time);
  if (startTime && first && first > startTime) return false;
  if (endTime && last && last < endTime) return false;
  return true;
}

export function inspectPriceLoadPlan(input: {
  requestKey: string;
  prevKey: string;
  codeChanged: boolean;
  seedCoversRange: boolean;
  hasLoadedPrices: boolean;
}): InspectPriceLoadPlan {
  if (input.prevKey && input.requestKey === input.prevKey) {
    return { refetch: false, showLoading: false, clearPrices: false };
  }
  const keepChart = !input.codeChanged && input.hasLoadedPrices;
  return {
    refetch: true,
    showLoading: !input.seedCoversRange && !keepChart,
    clearPrices: !input.seedCoversRange && !keepChart,
  };
}

export function inspectCandleFingerprint(
  rows: Array<{ time: string; close: number; buy?: unknown; sell?: unknown }>,
): string {
  if (!rows.length) return '0';
  const first = rows[0];
  const last = rows[rows.length - 1];
  let marks = 0;
  for (const row of rows) {
    if (row.buy) marks += 1;
    if (row.sell) marks += 1;
  }
  return `${rows.length}:${first.time}:${last.time}:${last.close}:${marks}`;
}
