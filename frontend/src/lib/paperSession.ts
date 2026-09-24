import type { RunDetail } from '@/api/backtest';
import type { PaperSession, PaperSessionDetail, PaperStatus } from '@/api/paper';

export const PAPER_STATUS_LABEL: Record<PaperStatus, string> = {
  running: '运行中',
  paused: '已暂停',
  catching_up: '同步中',
  failed: '同步失败',
};

export function paperStatusLabel(status?: string): string {
  if (!status) return '';
  return PAPER_STATUS_LABEL[status as PaperStatus] ?? status;
}

export function paperToRunDetail(session: PaperSessionDetail): RunDetail {
  const hasResult = Boolean(session.result);
  const catching = session.status === 'catching_up';
  let status = 'succeeded';
  if (session.status === 'failed' && !hasResult) status = 'failed';
  else if (catching && !hasResult) status = 'running';
  return {
    id: session.id,
    name: session.name,
    status,
    created_at: session.created_at,
    updated_at: session.updated_at,
    started_at: session.created_at,
    finished_at: session.last_bar_date ?? null,
    request: {
      strategy_name: session.strategy_name,
      strategy_id: session.strategy_id,
      symbols: session.symbols ?? session.request?.symbols ?? [],
      universe: (session.universe as RunDetail['request']['universe']) ?? session.request?.universe,
      index: session.index ?? session.request?.index,
      initial_cash: session.initial_cash,
      start_time: session.go_live,
      end_time: session.last_bar_date || session.go_live,
      commission_rate: session.request?.commission_rate,
      min_commission: session.request?.min_commission,
      stamp_tax_rate: session.request?.stamp_tax_rate,
      transfer_fee_rate: session.request?.transfer_fee_rate,
      slippage: session.request?.slippage,
      lot_size: session.request?.lot_size,
    },
    result: session.result,
    source: session.source,
    error: session.last_error ? { message: session.last_error } : undefined,
  };
}

export function formatPaperMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

export function formatPaperSignedMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${formatPaperMoney(value)}`;
}

export function formatPaperPrice(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toFixed(2);
}

export function formatPaperReturn(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(2)}%`;
}

export function paperDisplayReturn(session: { equity: number; initial_cash: number; return_pct: number }): number {
  if (session.initial_cash > 0 && Number.isFinite(session.equity)) {
    return (session.equity / session.initial_cash - 1) * 100;
  }
  return session.return_pct;
}

export function paperSignedClass(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) return 'text-muted-foreground';
  return value > 0
    ? 'text-[#e11d2e] dark:text-[#ff6b6b]'
    : 'text-[#00a870] dark:text-[#3dd68c]';
}

export function paperPollFingerprint(session: PaperSessionDetail): string {
  return [
    session.id,
    session.status,
    session.name,
    session.last_bar_date ?? '',
    session.last_run_id ?? '',
    session.equity,
    session.last_error ?? '',
    session.result?.orders?.length ?? 0,
    session.result?.rebalances?.length ?? 0,
    session.result?.holdings?.length ?? 0,
    session.result?.equity_curve?.length ?? 0,
    session.result?.prices?.length ?? 0,
  ].join('|');
}

export function samePaperPollSnapshot(prev: PaperSessionDetail | null, next: PaperSessionDetail): boolean {
  return Boolean(prev && paperPollFingerprint(prev) === paperPollFingerprint(next));
}

export function paperCardMeta(session: PaperSession): { left: string; right: string } {
  const sync = session.last_bar_date ? `同步至 ${session.last_bar_date}` : paperStatusLabel(session.status);
  return {
    left: session.strategy_name || '策略',
    right: `${formatPaperReturn(paperDisplayReturn(session))} · ${sync}`,
  };
}
