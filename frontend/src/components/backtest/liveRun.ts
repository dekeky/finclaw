import type { RunDetail } from '@/api/backtest';

export function isLiveStatus(status?: string | null): boolean {
  return status === 'queued' || status === 'running';
}

export function lastEquityKey(detail?: RunDetail | null): string {
  const curve =
    detail?.result?.equity_curve?.length ? detail.result.equity_curve : detail?.live_equity ?? [];
  const last = curve[curve.length - 1];
  if (!last) return '';
  return `${last.time}:${last.equity ?? ''}`;
}

export function retainLiveEquity(prev: RunDetail | null, next: RunDetail): RunDetail {
  if (!prev || prev.id !== next.id) return next;
  if (!isLiveStatus(next.status)) return next;
  const nextHas =
    Boolean(next.result?.equity_curve?.length) || Boolean(next.live_equity?.length);
  if (nextHas) return next;
  const prevCurve = prev.result?.equity_curve?.length ? prev.result.equity_curve : prev.live_equity;
  if (!prevCurve?.length) return next;
  return { ...next, live_equity: prevCurve };
}

export function mergeLiveDetail(prev: RunDetail | null, next: RunDetail): RunDetail {
  if (!prev || prev.id !== next.id) return next;
  return retainLiveEquity(prev, {
    ...next,
    request: {
      ...prev.request,
      ...next.request,
      start_time: next.request?.start_time || prev.request.start_time,
      end_time: next.request?.end_time || prev.request.end_time,
      initial_cash: next.request?.initial_cash || prev.request.initial_cash,
      symbols: next.request?.symbols?.length ? next.request.symbols : prev.request.symbols,
    },
  });
}

export function sameLiveSnapshot(prev: RunDetail | null, next: RunDetail): boolean {
  return Boolean(
    prev &&
      prev.id === next.id &&
      prev.status === next.status &&
      lastEquityKey(prev) === lastEquityKey(next),
  );
}

export function shouldFetchLiveRun(detail: RunDetail | null, selectedId: string | null): boolean {
  if (!selectedId) return false;
  if (!detail || detail.id !== selectedId) return true;
  return isLiveStatus(detail.status);
}
