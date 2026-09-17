import type { RunDetail, RunListItem } from '@/api/backtest';

export function isLiveStatus(status?: string | null): boolean {
  return status === 'queued' || status === 'running';
}

export function isCancelledStatus(status?: string | null): boolean {
  return status === 'cancelled' || status === 'canceled';
}

export function isTerminalStatus(status?: string | null): boolean {
  return status === 'succeeded' || status === 'failed' || isCancelledStatus(status);
}

export function shouldShowReportSkeleton(status?: string | null, hasResult = false): boolean {
  if (hasResult || isLiveStatus(status) || status === 'failed' || isCancelledStatus(status)) return false;
  return true;
}

export function shouldShowReportBody(status?: string | null, hasResult = false, hasEquity = false): boolean {
  if (isLiveStatus(status) || hasResult) return true;
  return isCancelledStatus(status) && hasEquity;
}

export function hasChartableResult(detail?: RunDetail | null): boolean {
  if (!detail) return false;
  if (detail.result?.equity_curve?.length) return true;
  if (detail.result?.metrics && Object.keys(detail.result.metrics).length > 0) return true;
  if (detail.live_equity?.length) return true;
  return false;
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
  if (isTerminalStatus(prev.status) && isLiveStatus(next.status)) return prev;
  const merged = retainLiveEquity(prev, {
    ...next,
    result: next.result ?? prev.result,
    request: {
      ...prev.request,
      ...next.request,
      start_time: next.request?.start_time || prev.request.start_time,
      end_time: next.request?.end_time || prev.request.end_time,
      initial_cash: next.request?.initial_cash || prev.request.initial_cash,
      symbols: next.request?.symbols?.length ? next.request.symbols : prev.request.symbols,
    },
  });
  if (hasChartableResult(prev) && !hasChartableResult(merged)) {
    return {
      ...merged,
      result: prev.result ?? merged.result,
      live_equity: merged.live_equity?.length ? merged.live_equity : prev.live_equity,
    };
  }
  return merged;
}

export function sameLiveSnapshot(prev: RunDetail | null, next: RunDetail): boolean {
  return Boolean(
    prev &&
      prev.id === next.id &&
      prev.status === next.status &&
      lastEquityKey(prev) === lastEquityKey(next),
  );
}

export function shouldFetchLiveRun(
  detail: RunDetail | null,
  selectedId: string | null,
  knownStatus?: string | null,
): boolean {
  if (!selectedId) return false;
  const status = detail?.id === selectedId ? detail.status : knownStatus;
  if (status) return isLiveStatus(status);
  return true;
}

export function shouldSkipStoredRefetch(
  detail: RunDetail | null,
  knownStatus?: string | null,
): boolean {
  if (!detail || !hasChartableResult(detail)) return false;
  if (isLiveStatus(detail.status) || isLiveStatus(knownStatus)) return false;
  return isTerminalStatus(detail.status);
}

export type LivePollState = {
  cancelled: boolean;
  currentStatus?: string | null;
  hasLiveItems: boolean;
};

export function shouldContinueLivePoll(state: LivePollState): boolean {
  if (state.cancelled) return false;
  return isLiveStatus(state.currentStatus) || state.hasLiveItems;
}

const runDetailCache = new Map<string, RunDetail>();

export function resetRunDetailCache(): void {
  runDetailCache.clear();
}

export function recalledRunDetail(id: string | null | undefined): RunDetail | null {
  if (!id) return null;
  return runDetailCache.get(id) ?? null;
}

export function rememberRunDetail(detail: RunDetail | null | undefined): RunDetail | null {
  if (!detail?.id) return detail ?? null;
  const merged = mergeLiveDetail(runDetailCache.get(detail.id) ?? null, detail);
  runDetailCache.set(detail.id, merged);
  return merged;
}

export function placeholderRun(item: RunListItem): RunDetail {
  const request = item.request;
  return {
    id: item.id,
    name: item.name,
    status: item.status,
    created_at: item.created_at,
    updated_at: item.updated_at,
    started_at: item.started_at ?? null,
    finished_at: item.finished_at ?? null,
    duration_seconds: item.duration_seconds,
    request: {
      strategy_name: item.strategy_name,
      strategy_id: item.strategy_id ?? request?.strategy_id,
      symbols: item.symbols ?? request?.symbols ?? [],
      initial_cash: request?.initial_cash ?? 0,
      start_time: request?.start_time ?? '',
      end_time: request?.end_time ?? '',
      universe: request?.universe,
      index: request?.index,
      commission_rate: request?.commission_rate,
      min_commission: request?.min_commission,
      stamp_tax_rate: request?.stamp_tax_rate,
      transfer_fee_rate: request?.transfer_fee_rate,
      slippage: request?.slippage,
      lot_size: request?.lot_size,
      extra: request?.extra,
    },
  };
}

export function seedCurrentRun(args: {
  selectedId: string | null;
  current: RunDetail | null;
  item?: RunListItem | null;
}): RunDetail | null {
  const { selectedId, current, item } = args;
  if (!selectedId) return null;
  if (current?.id === selectedId && hasChartableResult(current)) return current;
  const cached = recalledRunDetail(selectedId);
  if (cached?.id === selectedId && hasChartableResult(cached)) return cached;
  if (current?.id === selectedId) return current;
  if (item && item.id === selectedId) return placeholderRun(item);
  return cached;
}
