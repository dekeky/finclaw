import { dayKey } from './format';

export type EquityPt = { time: string; value: number };

export function toEquity(curve: { time: string; equity: number | null }[]): EquityPt[] {
  const byDay = new Map<string, number>();
  for (const point of curve) {
    const equity = Number(point.equity);
    if (!Number.isFinite(equity)) continue;
    const time = dayKey(point.time);
    if (!time) continue;
    byDay.set(time, equity);
  }
  return [...byDay].map(([time, value]) => ({ time, value }));
}

export function weekdayRange(start: string, end: string): string[] {
  const from = dayKey(start);
  const to = dayKey(end);
  if (!from || !to || from > to) return [];
  const days: string[] = [];
  const cursor = new Date(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, Number(from.slice(8, 10)));
  const last = new Date(Number(to.slice(0, 4)), Number(to.slice(5, 7)) - 1, Number(to.slice(8, 10)));
  while (cursor.getTime() <= last.getTime()) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) {
      const year = cursor.getFullYear();
      const month = String(cursor.getMonth() + 1).padStart(2, '0');
      const day = String(cursor.getDate()).padStart(2, '0');
      days.push(`${year}-${month}-${day}`);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function axisDays(start: string, end: string, ...groups: Array<Iterable<string>>): string[] {
  const from = dayKey(start);
  const to = dayKey(end);
  if (!from || !to) return [];
  const seen = new Set(weekdayRange(from, to));
  for (const group of groups) {
    for (const value of group) {
      const day = dayKey(value);
      if (day && day >= from && day <= to) seen.add(day);
    }
  }
  return [...seen].sort();
}

export function cumulativePct(values: EquityPt[], base?: number): Map<string, number> {
  const first =
    typeof base === 'number' && Number.isFinite(base) && base > 0
      ? base
      : values.find((item) => Number.isFinite(item.value) && item.value !== 0)?.value;
  const out = new Map<string, number>();
  if (!first) return out;
  for (const item of values) {
    out.set(item.time, (item.value / first - 1) * 100);
  }
  return out;
}

export function lastMapValue(series: Map<string, number>): number | undefined {
  const keys = [...series.keys()];
  const last = keys[keys.length - 1];
  return last === undefined ? undefined : series.get(last);
}
