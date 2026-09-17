import type { EquityPoint, RunListItem } from '../api/backtest.ts';
import { runBelongsToStrategy, type BacktestStrategyOwner } from './backtestStrategy.ts';

export type ReturnPt = { time: string; value: number };

function dayKey(value: string): string {
  const text = value.trim();
  if (text.length >= 10 && text[4] === '-' && text[7] === '-') return text.slice(0, 10);
  return '';
}

function previousDay(day: string): string {
  const parts = day.split('-').map(Number);
  const year = parts[0];
  const month = parts[1];
  const date = parts[2];
  if (!year || !month || !date) return day;
  const cursor = new Date(Date.UTC(year, month - 1, date));
  cursor.setUTCDate(cursor.getUTCDate() - 1);
  const y = cursor.getUTCFullYear();
  const m = String(cursor.getUTCMonth() + 1).padStart(2, '0');
  const d = String(cursor.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function returnSeriesFromEquity(
  curve: EquityPoint[] | undefined,
  initialCash?: number,
  startTime?: string,
): ReturnPt[] {
  const byDay = new Map<string, number>();
  const start = dayKey(startTime ?? '');
  if (typeof initialCash === 'number' && Number.isFinite(initialCash) && initialCash > 0 && start) {
    byDay.set(start, initialCash);
  }
  for (const point of curve ?? []) {
    const equity = Number(point.equity);
    if (!Number.isFinite(equity)) continue;
    const time = dayKey(point.time);
    if (!time) continue;
    byDay.set(time, equity);
  }
  let rows = [...byDay].map(([time, value]) => ({ time, value }));
  const first =
    typeof initialCash === 'number' && Number.isFinite(initialCash) && initialCash > 0
      ? initialCash
      : rows.find((item) => item.value !== 0)?.value;
  if (!first) return [];
  if (
    rows.length === 1 &&
    typeof initialCash === 'number' &&
    Number.isFinite(initialCash) &&
    initialCash > 0 &&
    rows[0] &&
    rows[0].value !== initialCash
  ) {
    const origin = previousDay(rows[0].time);
    rows = [{ time: origin, value: initialCash }, rows[0]];
  }
  return rows.map((item) => ({ time: item.time, value: (item.value / first - 1) * 100 }));
}

export function hasUsableReturnCurve(
  curve: EquityPoint[] | undefined,
  initialCash?: number,
  startTime?: string,
): boolean {
  return returnSeriesFromEquity(curve, initialCash, startTime).length >= 2;
}

function runRecency(item: RunListItem): string {
  return item.finished_at || item.updated_at || item.created_at || '';
}

export function latestSucceededRunForStrategy(
  runs: RunListItem[],
  strategy: BacktestStrategyOwner,
): RunListItem | undefined {
  let latest: RunListItem | undefined;
  let latestKey = '';
  for (const item of runs) {
    if (item.status !== 'succeeded') continue;
    if (!runBelongsToStrategy(item, strategy)) continue;
    const key = runRecency(item);
    if (!latest || key > latestKey) {
      latest = item;
      latestKey = key;
    }
  }
  return latest;
}

export function latestValidRunForStrategy(
  runs: RunListItem[],
  strategy: BacktestStrategyOwner,
): RunListItem | undefined {
  return latestSucceededRunForStrategy(
    runs.filter((item) => hasUsableReturnCurve(item.equity_curve)),
    strategy,
  );
}

export function latestValidReturnSeries(
  runs: RunListItem[],
  strategy: BacktestStrategyOwner,
): ReturnPt[] {
  const run = latestValidRunForStrategy(runs, strategy);
  if (!run) return [];
  return returnSeriesFromEquity(run.equity_curve, run.request?.initial_cash);
}
