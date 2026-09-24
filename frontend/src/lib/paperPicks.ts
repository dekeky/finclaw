import type { BacktestResult, PositionSnapshot } from '@/api/backtest';

const TARGET_META_KEYS = new Set(['top_n', 'scores', 'target_percent', 'target_value', 'target']);

export const PAPER_KLINE_YEAR_BARS = 244;

export type PaperPickTiming = 'next_open' | 'close' | 'hold';

export type PaperPick = {
  symbol: string;
  weight: number | null;
  side: 'buy' | 'sell' | 'hold';
  reason: string;
  timing: PaperPickTiming;
  pending: boolean;
  fillPrice: number | null;
};

export type PaperPickSet = {
  signalDay: string;
  title: string;
  badge: string;
  hint: string;
  picks: PaperPick[];
};

type OrderLike = Record<string, unknown>;

type RebalanceLike = {
  time?: string;
  created_at?: string;
  date?: string;
  reason?: string;
  targets?: Record<string, unknown> | null;
  selected?: string[] | null;
  plan?: Record<string, unknown> | null;
};

type PositionLike = {
  symbol?: string;
  quantity?: number | null;
};

function dayKey(value?: string | number | null): string {
  if (value == null || value === '') return '';
  const text = String(value).trim();
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  return text.slice(0, 10);
}

function eventDay(row: RebalanceLike): string {
  return dayKey(row.time) || dayKey(row.created_at) || dayKey(row.date);
}

function isMetaKey(key: string): boolean {
  return TARGET_META_KEYS.has(key);
}

function addSymbol(out: [string, number | null][], symbol: string, weight: number | null) {
  const code = String(symbol ?? '').trim();
  if (!code || isMetaKey(code)) return;
  out.push([code, weight]);
}

function planEntries(row: RebalanceLike): [string, number | null][] {
  const plan = row.plan;
  if (!plan) return [];
  const out: [string, number | null][] = [];
  for (const key of ['increase_legs', 'reduce_legs', 'skipped_legs']) {
    const legs = plan[key];
    if (!Array.isArray(legs)) continue;
    for (const leg of legs) {
      if (!leg || typeof leg !== 'object') continue;
      const item = leg as { symbol?: unknown; target_percent?: unknown; weight?: unknown };
      const raw = Number(item.target_percent ?? item.weight);
      addSymbol(out, String(item.symbol ?? ''), Number.isFinite(raw) ? raw : null);
    }
  }
  return out;
}

function targetEntries(row: RebalanceLike): [string, number | null][] {
  const out: [string, number | null][] = [];
  if (row.targets) {
    for (const [key, value] of Object.entries(row.targets)) {
      if (isMetaKey(key)) continue;
      const n = Number(value);
      out.push([key, Number.isFinite(n) ? n : null]);
    }
  }
  if (out.length) return out;
  for (const symbol of row.selected ?? []) addSymbol(out, symbol, null);
  if (out.length) return out;
  return planEntries(row);
}

function orderDay(order: OrderLike, key: string): string {
  return dayKey(String(order[key] ?? ''));
}

function orderFillDay(order: OrderLike): string {
  return orderDay(order, 'updated_at') || orderDay(order, 'created_at') || orderDay(order, 'time');
}

function orderCreatedDay(order: OrderLike): string {
  return orderDay(order, 'created_at') || orderDay(order, 'time');
}

function isFilled(order: OrderLike): boolean {
  const status = String(order.status ?? 'filled').toLowerCase();
  if (status !== 'filled') return false;
  if (String(order.reject_reason ?? '').trim()) return false;
  const qty = Number(order.filled_quantity ?? order.quantity);
  return !Number.isFinite(qty) || qty > 0;
}

function matchingOrder(orders: OrderLike[], symbol: string, signalDay: string): OrderLike | undefined {
  return orders.find((order) => {
    if (String(order.symbol ?? '') !== symbol) return false;
    const created = orderCreatedDay(order);
    const filled = orderFillDay(order);
    return created === signalDay || filled === signalDay;
  });
}

function sideFromWeight(weight: number | null, order?: OrderLike): PaperPick['side'] {
  const orderSide = String(order?.side ?? '').toLowerCase();
  if (orderSide === 'sell' || orderSide === 'short') return 'sell';
  if (orderSide === 'buy' || orderSide === 'long') return 'buy';
  if (weight == null) return 'buy';
  if (Math.abs(weight) < 1e-12) return 'sell';
  return 'buy';
}

function timingFor(order: OrderLike | undefined, signalDay: string, lastBar: string): {
  timing: PaperPickTiming;
  pending: boolean;
  fillPrice: number | null;
} {
  if (!order) {
    return { timing: lastBar && lastBar > signalDay ? 'hold' : 'next_open', pending: true, fillPrice: null };
  }
  const price = Number(order.avg_price);
  const fillPrice = Number.isFinite(price) && price > 0 ? price : null;
  if (!isFilled(order)) {
    return { timing: 'next_open', pending: true, fillPrice };
  }
  const fillDay = orderFillDay(order);
  if (fillDay && fillDay > signalDay) {
    return { timing: 'next_open', pending: false, fillPrice };
  }
  return { timing: 'close', pending: false, fillPrice };
}

function heldRow(row: { quantity?: number | null }): boolean {
  const qty = Number(row.quantity);
  return Number.isFinite(qty) && Math.abs(qty) > 1e-12;
}

function latestHoldings(holdings: PositionSnapshot[], lastBar: string): PositionSnapshot[] {
  if (!holdings.length) return [];
  let day = '';
  for (const row of holdings) {
    const time = dayKey(row.time);
    if (!time) continue;
    if (lastBar && time > lastBar) continue;
    if (time > day) day = time;
  }
  if (!day) return holdings.filter((row) => !dayKey(row.time) && heldRow(row));
  return holdings.filter((row) => dayKey(row.time) === day && heldRow(row));
}

function liveDayHoldings(holdings: PositionSnapshot[], liveDay: string): PositionSnapshot[] {
  if (!liveDay) return [];
  const sameDay = holdings.filter((row) => dayKey(row.time) === liveDay && heldRow(row));
  if (sameDay.length) return sameDay;
  return holdings.filter((row) => !dayKey(row.time) && heldRow(row));
}

function picksFromEvents(
  events: RebalanceLike[],
  orders: OrderLike[],
  lastBar: string,
): PaperPick[] {
  const bySymbol = new Map<string, PaperPick>();
  const ordered = [...events].sort((a, b) => eventDay(a).localeCompare(eventDay(b)));
  for (const event of ordered) {
    const reason = String(event.reason ?? '').trim();
    for (const [symbol, weight] of targetEntries(event)) {
      const signal = eventDay(event) || lastBar;
      const order = matchingOrder(orders, symbol, signal);
      const { timing, pending, fillPrice } = timingFor(order, signal, lastBar);
      bySymbol.set(symbol, {
        symbol,
        weight,
        side: sideFromWeight(weight, order),
        reason: reason || bySymbol.get(symbol)?.reason || '',
        timing,
        pending,
        fillPrice,
      });
    }
  }
  return [...bySymbol.values()];
}

function picksFromOrders(orders: OrderLike[], signalDay: string, lastBar: string): PaperPick[] {
  if (!signalDay) return [];
  const bySymbol = new Map<string, PaperPick>();
  for (const order of orders) {
    const symbol = String(order.symbol ?? '').trim();
    if (!symbol) continue;
    const created = orderCreatedDay(order);
    const filled = orderFillDay(order);
    if (created !== signalDay && filled !== signalDay) continue;
    const qty = Number(order.filled_quantity ?? order.quantity);
    if (Number.isFinite(qty) && qty <= 0) continue;
    const { timing, pending, fillPrice } = timingFor(order, signalDay, lastBar);
    bySymbol.set(symbol, {
      symbol,
      weight: null,
      side: sideFromWeight(null, order),
      reason: String(order.reason ?? '').trim() || bySymbol.get(symbol)?.reason || '',
      timing,
      pending,
      fillPrice,
    });
  }
  return [...bySymbol.values()];
}

function picksFromHoldings(holdings: PositionSnapshot[]): PaperPick[] {
  return holdings.map((row) => {
    const equity = Number(row.equity);
    const market = Number(row.market_value);
    let weight: number | null = null;
    if (Number.isFinite(market) && Number.isFinite(equity) && equity > 0) {
      weight = market / equity;
    }
    return {
      symbol: row.symbol,
      weight,
      side: 'hold' as const,
      reason: '',
      timing: 'hold' as const,
      pending: false,
      fillPrice: Number.isFinite(Number(row.close)) ? Number(row.close) : null,
    };
  });
}

function picksFromPositions(positions: PositionLike[]): PaperPick[] {
  return positions
    .filter((row) => String(row.symbol ?? '').trim() && heldRow(row))
    .map((row) => ({
      symbol: String(row.symbol).trim(),
      weight: null,
      side: 'hold' as const,
      reason: '',
      timing: 'hold' as const,
      pending: false,
      fillPrice: null,
    }));
}

function asNextOpenPicks(picks: PaperPick[]): PaperPick[] {
  return picks.map((pick) => ({
    ...pick,
    pending: true,
    timing: 'next_open' as const,
    fillPrice: null,
    side: pick.side === 'sell' ? 'sell' : 'buy',
  }));
}

function titleFor(picks: PaperPick[], signalDay: string): { title: string; badge: string; hint: string } {
  const pending = picks.filter((row) => row.pending);
  const close = picks.filter((row) => !row.pending && row.timing === 'close');
  const next = picks.filter((row) => !row.pending && row.timing === 'next_open');
  const hold = picks.filter((row) => row.timing === 'hold');
  if (pending.length && pending.length === picks.length) {
    return {
      title: '最新选股',
      badge: '下一交易日开盘',
      hint: signalDay ? `信号日 ${signalDay}` : '按下一交易日开盘成交',
    };
  }
  if (close.length && close.length === picks.length) {
    return {
      title: '最新选股',
      badge: '收盘成交',
      hint: signalDay ? `${signalDay} 按收盘价成交` : '按收盘价成交',
    };
  }
  if (next.length && next.length === picks.length) {
    return {
      title: '最新选股',
      badge: '次日开盘已成交',
      hint: signalDay ? `信号日 ${signalDay}` : '按下一交易日开盘成交',
    };
  }
  if (hold.length && hold.length === picks.length) {
    return {
      title: '最新选股',
      badge: '当前持仓',
      hint: signalDay ? `同步至 ${signalDay}` : '最新持仓',
    };
  }
  if (pending.length) {
    return {
      title: '最新选股',
      badge: '含待成交',
      hint: signalDay ? `信号日 ${signalDay}` : '含下一交易日待成交',
    };
  }
  return {
    title: '最新选股',
    badge: signalDay || '最近一次',
    hint: signalDay ? `信号日 ${signalDay}` : '策略最近一次选出的标的',
  };
}

export function collectPaperPicks(
  result: BacktestResult | undefined,
  lastBarDate = '',
  goLive = '',
): PaperPickSet | null {
  if (!result) return null;
  const lastBar = dayKey(lastBarDate);
  const live = dayKey(goLive);
  const allRebalances = ((result.rebalances ?? []) as RebalanceLike[]).filter((row) => eventDay(row));
  const rebalances = allRebalances.filter((row) => !live || eventDay(row) >= live);
  const orders = (result.orders ?? []) as OrderLike[];
  let signalDay = '';
  for (const row of rebalances) {
    const day = eventDay(row);
    if (day > signalDay) signalDay = day;
  }
  if (!signalDay) signalDay = lastBar;
  const events = rebalances.filter((row) => eventDay(row) === signalDay);
  const bar = lastBar || signalDay;
  let picks = picksFromEvents(events, orders, bar);
  if (!picks.length) {
    picks = picksFromOrders(orders, signalDay, bar);
    const reason = events.map((row) => String(row.reason ?? '').trim()).find(Boolean) || '';
    if (reason) picks = picks.map((pick) => ({ ...pick, reason: pick.reason || reason }));
  }
  if (isFirstLivePreview(lastBar, live)) {
    if (!picks.length) picks = picksFromHoldings(liveDayHoldings(result.holdings ?? [], bar));
    if (!picks.length) picks = picksFromPositions((result.positions ?? []) as PositionLike[]);
    if (!picks.length) return null;
    return {
      signalDay: bar,
      title: '最新选股',
      badge: '下一交易日开盘',
      hint: '下一交易日开盘买入',
      picks: asNextOpenPicks(picks),
    };
  }
  if (!picks.length) {
    const holdings = latestHoldings(result.holdings ?? [], bar);
    picks = picksFromHoldings(holdings);
    if (!picks.length) picks = picksFromPositions((result.positions ?? []) as PositionLike[]);
    if (!signalDay && holdings[0]) signalDay = dayKey(holdings[0].time);
  }
  if (!picks.length) return null;
  const { title, badge, hint } = titleFor(picks, signalDay);
  return { signalDay, title, badge, hint, picks };
}

function isFirstLivePreview(lastBar: string, goLive: string): boolean {
  return Boolean(goLive) && Boolean(lastBar) && goLive === lastBar;
}

export function formatPaperWeight(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (Math.abs(value) <= 1) return `${(value * 100).toFixed(0)}%`;
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

export type PaperQuote = {
  close: number | null;
  changePct: number | null;
};

export function quoteFromCloses(closes: Array<number | null | undefined>): PaperQuote {
  const values = closes.filter((value): value is number => value != null && Number.isFinite(value));
  const close = values[values.length - 1] ?? null;
  const prev = values.length > 1 ? values[values.length - 2] : null;
  if (close == null || prev == null || prev === 0) return { close, changePct: null };
  return { close, changePct: ((close - prev) / prev) * 100 };
}

export function pickActionLabel(pick: PaperPick): string {
  if (pick.side === 'sell') return pick.pending ? '待卖出' : '卖出';
  if (pick.side === 'hold') return '持仓';
  return pick.pending ? '待买入' : '买入';
}

export function isoDayFromDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function shiftIsoDay(iso: string, days: number): string {
  const match = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return iso;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days);
  return isoDayFromDate(date);
}

export function paperKlineWindow(endIso?: string): { start: string; end: string } {
  const end = dayKey(endIso) || isoDayFromDate(new Date());
  return { start: shiftIsoDay(end, -365 * 10), end };
}

export function quoteLookbackStart(endIso?: string): string {
  const end = dayKey(endIso) || isoDayFromDate(new Date());
  return shiftIsoDay(end, -21);
}
