import { dayKey } from './format';

export type SymbolStat = {
  symbol: string;
  pnl: number;
  realized: number;
  unrealized: number;
  trades: number;
  fills: number;
  wins: number;
  losses: number;
  commission: number;
  commissionFee: number;
  stampTax: number;
  transferFee: number;
  slippageCost: number;
  capitalUsed: number;
  returnPct: number | null;
};

export type PositionSnapshot = {
  symbol: string;
  quantity?: number | null;
  unrealized_pnl?: number | null;
};

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function blank(symbol: string): SymbolStat {
  return {
    symbol,
    pnl: 0,
    realized: 0,
    unrealized: 0,
    trades: 0,
    fills: 0,
    wins: 0,
    losses: 0,
    commission: 0,
    commissionFee: 0,
    stampTax: 0,
    transferFee: 0,
    slippageCost: 0,
    capitalUsed: 0,
    returnPct: null,
  };
}

function lastCloses(prices: { symbol: string; close?: number | null }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const point of prices) {
    const close = Number(point.close);
    if (!Number.isFinite(close)) continue;
    map.set(String(point.symbol), close);
  }
  return map;
}

export function unrealizedFromFills(
  orders: Record<string, unknown>[],
  prices: { symbol: string; close?: number | null }[],
): Map<string, number> {
  const books = new Map<string, { qty: number; cost: number }>();
  const filled = orders
    .filter((order) => String(order.status ?? '').toLowerCase() === 'filled')
    .sort((a, b) => String(a.created_at ?? a.updated_at ?? '').localeCompare(String(b.created_at ?? b.updated_at ?? '')));
  for (const order of filled) {
    const symbol = String(order.symbol ?? '').trim();
    if (!symbol) continue;
    const qty = num(order.filled_quantity ?? order.quantity);
    const price = num(order.avg_price);
    if (qty <= 0) continue;
    const side = String(order.side ?? '').toLowerCase();
    const book = books.get(symbol) ?? { qty: 0, cost: 0 };
    if (side === 'buy') {
      book.cost += price * qty;
      book.qty += qty;
    } else if (side === 'sell') {
      if (book.qty > 1e-8) {
        const avg = book.cost / book.qty;
        const closed = Math.min(book.qty, qty);
        book.cost -= avg * closed;
        book.qty -= closed;
        const extra = qty - closed;
        if (extra > 1e-8) {
          book.qty -= extra;
          book.cost -= price * extra;
        }
      } else {
        book.qty -= qty;
        book.cost -= price * qty;
      }
    }
    books.set(symbol, book);
  }
  const closes = lastCloses(prices);
  const unrealized = new Map<string, number>();
  for (const [symbol, book] of books) {
    if (Math.abs(book.qty) < 1e-8) continue;
    const close = closes.get(symbol);
    if (close === undefined) continue;
    unrealized.set(symbol, (close - book.cost / book.qty) * book.qty);
  }
  return unrealized;
}

export function peakCapitalFromFills(orders: Record<string, unknown>[]): Map<string, number> {
  const books = new Map<string, { qty: number; cost: number; cash: number }>();
  const peaks = new Map<string, number>();
  const filled = orders
    .filter((order) => String(order.status ?? '').toLowerCase() === 'filled')
    .sort((a, b) => String(a.created_at ?? a.updated_at ?? '').localeCompare(String(b.created_at ?? b.updated_at ?? '')));
  for (const order of filled) {
    const symbol = String(order.symbol ?? '').trim();
    if (!symbol) continue;
    const qty = num(order.filled_quantity ?? order.quantity);
    const price = num(order.avg_price) || (qty ? num(order.filled_value) / qty : 0);
    if (qty <= 0 || !(price > 0)) continue;
    const book = books.get(symbol) ?? { qty: 0, cost: 0, cash: 0 };
    applyFill(book, String(order.side ?? '').toLowerCase(), qty, price, num(order.commission));
    books.set(symbol, book);
    peaks.set(symbol, Math.max(peaks.get(symbol) ?? 0, Math.abs(book.cost)));
  }
  return peaks;
}

function applyFill(book: { qty: number; cost: number; cash: number }, side: string, qty: number, price: number, commission: number) {
  if (side === 'buy') {
    book.cash -= price * qty + commission;
    book.cost += price * qty;
    book.qty += qty;
    return;
  }
  if (side !== 'sell') return;
  book.cash += price * qty - commission;
  if (book.qty > 1e-8) {
    const avg = book.cost / book.qty;
    const closed = Math.min(book.qty, qty);
    book.cost -= avg * closed;
    book.qty -= closed;
    const extra = qty - closed;
    if (extra > 1e-8) {
      book.qty -= extra;
      book.cost -= price * extra;
    }
    return;
  }
  book.qty -= qty;
  book.cost -= price * qty;
}

export function symbolStrategyPnl(
  symbol: string,
  orders: Record<string, unknown>[],
  prices: { time: string; close?: number | null }[],
): { time: string; value: number }[] {
  const code = String(symbol || '').trim();
  if (!code) return [];
  const fills = orders
    .filter((order) => String(order.symbol ?? '').trim() === code && String(order.status ?? '').toLowerCase() === 'filled')
    .map((order) => {
      const qty = num(order.filled_quantity ?? order.quantity);
      const price = num(order.avg_price) || (qty ? num(order.filled_value) / qty : 0);
      return {
        day: dayKey(String(order.created_at ?? order.updated_at ?? '')),
        side: String(order.side ?? '').toLowerCase(),
        qty,
        price,
        commission: num(order.commission),
      };
    })
    .filter((fill) => fill.day && fill.qty > 0 && Number.isFinite(fill.price) && fill.price > 0)
    .sort((a, b) => a.day.localeCompare(b.day));
  if (!fills.length) return [];

  const book = { qty: 0, cost: 0, cash: 0 };
  let fillAt = 0;
  let peakCapital = 0;
  let started = false;
  const equity: { time: string; equity: number }[] = [];
  for (const point of prices) {
    const close = Number(point.close);
    if (!Number.isFinite(close)) continue;
    const day = dayKey(point.time);
    if (!day) continue;
    while (fillAt < fills.length && fills[fillAt].day <= day) {
      const fill = fills[fillAt];
      applyFill(book, fill.side, fill.qty, fill.price, fill.commission);
      peakCapital = Math.max(peakCapital, Math.abs(book.cost));
      fillAt += 1;
      started = true;
    }
    if (!started) continue;
    equity.push({ time: day, equity: book.cash + book.qty * close });
  }
  while (fillAt < fills.length) {
    const fill = fills[fillAt];
    applyFill(book, fill.side, fill.qty, fill.price, fill.commission);
    peakCapital = Math.max(peakCapital, Math.abs(book.cost));
    fillAt += 1;
    started = true;
  }
  if (!equity.length || peakCapital < 1e-8) return [];
  const last = equity[equity.length - 1];
  if (fillAt > 0 && last) {
    const lastClose = Number(prices.filter((point) => Number.isFinite(Number(point.close))).slice(-1)[0]?.close);
    if (Number.isFinite(lastClose)) last.equity = book.cash + book.qty * lastClose;
  }
  return equity.map((row) => ({ time: row.time, value: row.equity }));
}

export function collectSymbolStats(
  symbols: string[],
  trades: Record<string, unknown>[],
  orders: Record<string, unknown>[],
  prices: { symbol: string; close?: number | null }[],
  positions?: PositionSnapshot[],
): SymbolStat[] {
  const map = new Map<string, SymbolStat>();
  const ensure = (symbol: string) => {
    const key = String(symbol || '').trim();
    if (!key) return null;
    let row = map.get(key);
    if (!row) {
      row = blank(key);
      map.set(key, row);
    }
    return row;
  };
  for (const code of symbols) ensure(code);
  for (const trade of trades) {
    const row = ensure(String(trade.symbol ?? ''));
    if (!row) continue;
    const pnl = num(trade.net_pnl ?? trade.pnl);
    row.realized += pnl;
    row.trades += 1;
    if (pnl > 0) row.wins += 1;
    else if (pnl < 0) row.losses += 1;
  }
  for (const order of orders) {
    const row = ensure(String(order.symbol ?? ''));
    if (!row) continue;
    if (String(order.status ?? '').toLowerCase() !== 'filled') continue;
    row.fills += 1;
    row.commissionFee += num(order.commission_fee);
    row.stampTax += num(order.stamp_tax);
    row.transferFee += num(order.transfer_fee);
    row.slippageCost += num(order.slippage_cost);
    row.commission += num(order.commission_fee) + num(order.stamp_tax) + num(order.transfer_fee);
  }

  const fromEngine = new Map<string, number>();
  for (const pos of positions ?? []) {
    const symbol = String(pos.symbol ?? '').trim();
    if (!symbol) continue;
    if (pos.unrealized_pnl === null || pos.unrealized_pnl === undefined) continue;
    const value = num(pos.unrealized_pnl);
    fromEngine.set(symbol, (fromEngine.get(symbol) ?? 0) + value);
  }
  const fromFills = fromEngine.size ? new Map<string, number>() : unrealizedFromFills(orders, prices);
  const floating = fromEngine.size ? fromEngine : fromFills;
  for (const [symbol, value] of floating) {
    const row = ensure(symbol);
    if (row) row.unrealized += value;
  }

  const peaks = peakCapitalFromFills(orders);
  for (const row of map.values()) {
    row.pnl = row.realized + row.unrealized;
    row.capitalUsed = peaks.get(row.symbol) ?? 0;
    row.returnPct = row.capitalUsed > 1e-8 ? (row.pnl / row.capitalUsed) * 100 : null;
  }
  return [...map.values()]
    .filter((row) => row.trades || row.fills || Math.abs(row.pnl) > 1e-8)
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl) || b.fills - a.fills || a.symbol.localeCompare(b.symbol));
}
