import type { PricePoint } from '@/api/backtest';
import { dayKey } from './format';
import type { CandlePoint } from './KLineChart';
import { cumulativePct } from './series';

function asPrice(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function addFill(
  bucket: Map<string, { price: number; quantity: number }>,
  key: string,
  price: number,
  quantity: number,
) {
  const prev = bucket.get(key);
  if (!prev) {
    bucket.set(key, { price, quantity });
    return;
  }
  const total = prev.quantity + quantity;
  bucket.set(key, {
    price: total === 0 ? price : (prev.price * prev.quantity + price * quantity) / total,
    quantity: total,
  });
}

export function buildCandles(code: string, prices: PricePoint[], orders: Record<string, unknown>[]): CandlePoint[] {
  const buys = new Map<string, { price: number; quantity: number }>();
  const sells = new Map<string, { price: number; quantity: number }>();
  for (const order of orders) {
    if (String(order.symbol ?? '') !== code) continue;
    if (String(order.status ?? '').toLowerCase() !== 'filled') continue;
    const key = dayKey(String(order.created_at ?? ''));
    const price = Number(order.avg_price);
    const quantity = Number(order.filled_quantity ?? order.quantity);
    if (!key || !Number.isFinite(price) || !Number.isFinite(quantity)) continue;
    const side = String(order.side).toLowerCase();
    if (side === 'buy') addFill(buys, key, price, quantity);
    if (side === 'sell') addFill(sells, key, price, quantity);
  }
  return prices.flatMap((point) => {
    const candle = toCandle(point, buys, sells);
    return candle ? [candle] : [];
  });
}

function toCandle(
  point: PricePoint,
  buys: Map<string, { price: number; quantity: number }>,
  sells: Map<string, { price: number; quantity: number }>,
): CandlePoint | null {
  const close = point.close;
  if (typeof close !== 'number' || !Number.isFinite(close)) return null;
  const key = dayKey(point.time);
  return {
    time: key,
    open: asPrice(point.open, close),
    high: asPrice(point.high, close),
    low: asPrice(point.low, close),
    close,
    volume: typeof point.volume === 'number' && Number.isFinite(point.volume) ? point.volume : undefined,
    buy: buys.get(key),
    sell: sells.get(key),
  };
}

export function closesToReturn(points: { time: string; close: number | null }[]): Map<string, number> {
  return cumulativePct(
    points
      .filter((point) => typeof point.close === 'number' && Number.isFinite(point.close))
      .map((point) => ({ time: dayKey(point.time), value: Number(point.close) })),
  );
}
