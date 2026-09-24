import assert from 'node:assert/strict';
import test from 'node:test';
import {
  collectPaperPicks,
  formatPaperWeight,
  paperKlineWindow,
  pickActionLabel,
  quoteFromCloses,
  shiftIsoDay,
} from './paperPicks.ts';

test('quote from last two closes', () => {
  assert.deepEqual(quoteFromCloses([10, 11]), { close: 11, changePct: 10 });
});

test('kline window looks back ten years', () => {
  assert.equal(shiftIsoDay('2026-09-14', -1), '2026-09-13');
  const window = paperKlineWindow('2026-09-14');
  assert.equal(window.end, '2026-09-14');
  assert.equal(window.start, '2016-09-16');
});

test('unfilled last-bar targets are next-open pending', () => {
  const set = collectPaperPicks(
    {
      metrics: {},
      equity_curve: [],
      trades: [],
      orders: [{ symbol: '600000', created_at: '2026-09-11', status: 'submitted', side: 'buy' }],
      rebalances: [
        {
          time: '2026-09-11',
          method: 'order_target_percent',
          status: 'submitted',
          targets: { '600000': 0.95 },
          reason: '短均线上穿',
        },
      ],
    },
    '2026-09-11',
    '2026-09-01',
  );
  assert.equal(set?.title, '最新选股');
  assert.equal(set?.badge, '下一交易日开盘');
  assert.equal(set?.picks.length, 1);
  assert.equal(set?.picks[0].symbol, '600000');
  assert.equal(set?.picks[0].pending, true);
  assert.equal(set?.picks[0].timing, 'next_open');
  assert.equal(set?.picks[0].reason, '短均线上穿');
});

test('same-day fills are close trades', () => {
  const set = collectPaperPicks(
    {
      metrics: {},
      equity_curve: [],
      trades: [],
      orders: [
        {
          symbol: '000001',
          created_at: '2026-09-11',
          updated_at: '2026-09-11',
          status: 'filled',
          side: 'buy',
          avg_price: 12.3,
          filled_quantity: 100,
        },
      ],
      rebalances: [
        {
          time: '2026-09-11',
          method: 'order_target_percent',
          status: 'submitted',
          targets: { '000001': 0.4 },
          reason: '收盘买入',
        },
      ],
    },
    '2026-09-11',
    '2026-09-01',
  );
  assert.equal(set?.title, '最新选股');
  assert.equal(set?.badge, '收盘成交');
  assert.equal(set?.picks[0].pending, false);
  assert.equal(set?.picks[0].timing, 'close');
  assert.equal(set?.picks[0].fillPrice, 12.3);
});

test('holdings fallback uses latest book even if last bar is newer', () => {
  const set = collectPaperPicks(
    {
      metrics: {},
      equity_curve: [],
      trades: [],
      orders: [],
      holdings: [
        { time: '2026-09-14', symbol: '000001', quantity: 7600, market_value: 89224, equity: 94188, close: 11.74 },
      ],
    },
    '2026-09-15',
    '2026-09-13',
  );
  assert.equal(set?.badge, '当前持仓');
  assert.equal(set?.picks[0].symbol, '000001');
});

test('falls back to latest holdings when no rebalance targets', () => {
  const set = collectPaperPicks(
    {
      metrics: {},
      equity_curve: [],
      trades: [],
      orders: [],
      holdings: [
        { time: '2026-09-10', symbol: '600519', quantity: 100, market_value: 160000, equity: 200000, close: 1600 },
      ],
    },
    '2026-09-10',
    '2026-09-01',
  );
  assert.equal(set?.title, '最新选股');
  assert.equal(set?.badge, '当前持仓');
  assert.equal(set?.picks[0].symbol, '600519');
  assert.equal(set?.picks[0].timing, 'hold');
  assert.equal(formatPaperWeight(set?.picks[0].weight), '80%');
});

test('ignores warmup rebalances before go-live', () => {
  const set = collectPaperPicks(
    {
      metrics: {},
      equity_curve: [],
      trades: [],
      orders: [],
      rebalances: [
        { time: '2026-08-01', method: 'order_target_percent', targets: { '600000': 0.9 }, reason: 'warmup' },
        { time: '2026-09-12', method: 'order_target_percent', targets: { '000001': 0.5 }, reason: 'live' },
      ],
    },
    '2026-09-12',
    '2026-09-10',
  );
  assert.equal(set?.picks.length, 1);
  assert.equal(set?.picks[0].symbol, '000001');
  assert.equal(set?.picks[0].reason, 'live');
});

test('first live day uses same-day holdings when blotter has no targets', () => {
  const set = collectPaperPicks(
    {
      metrics: {},
      equity_curve: [{ time: '2026-09-16', equity: 101000 }],
      trades: [{ time: '2026-09-16', symbol: '000001' }],
      orders: [],
      holdings: [
        { time: '2026-09-16', symbol: '000001', quantity: 800, market_value: 96000, equity: 101000, close: 12 },
      ],
    },
    '2026-09-16',
    '2026-09-16',
  );
  assert.equal(set?.picks.length, 1);
  assert.equal(set?.picks[0].symbol, '000001');
  assert.equal(set?.picks[0].pending, true);
  assert.equal(set?.picks[0].timing, 'next_open');
  assert.equal(set?.badge, '下一交易日开盘');
});

test('first live day uses same-day orders when rebalance has no targets', () => {
  const set = collectPaperPicks(
    {
      metrics: {},
      equity_curve: [{ time: '2026-09-16', equity: 101000 }],
      trades: [],
      orders: [
        {
          symbol: '600000',
          created_at: '2026-09-16',
          status: 'submitted',
          side: 'buy',
          quantity: 100,
        },
      ],
      rebalances: [{ time: '2026-09-16', method: 'order_target_percent', status: 'submitted', reason: '短均线上穿' }],
    },
    '2026-09-16',
    '2026-09-16',
  );
  assert.equal(set?.picks.length, 1);
  assert.equal(set?.picks[0].symbol, '600000');
  assert.equal(set?.picks[0].pending, true);
  assert.equal(set?.picks[0].reason, '短均线上穿');
});

test('reads symbols from plan legs when targets are missing', () => {
  const set = collectPaperPicks(
    {
      metrics: {},
      equity_curve: [],
      trades: [],
      orders: [],
      rebalances: [
        {
          time: '2026-09-16',
          method: 'rebalance_to_topn',
          reason: '轮动',
          plan: { increase_legs: [{ symbol: '000063', target_percent: 0.4 }] },
        },
      ],
    },
    '2026-09-16',
    '2026-09-10',
  );
  assert.equal(set?.picks.length, 1);
  assert.equal(set?.picks[0].symbol, '000063');
  assert.equal(set?.picks[0].reason, '轮动');
});

test('first live day ignores warmup rebalances and holdings', () => {
  const set = collectPaperPicks(
    {
      metrics: {},
      equity_curve: [],
      trades: [],
      orders: [
        {
          symbol: '000063',
          created_at: '2026-08-24',
          updated_at: '2026-08-25',
          status: 'filled',
          side: 'buy',
          avg_price: 32,
          filled_quantity: 100,
        },
      ],
      rebalances: [
        { time: '2026-08-24', method: 'order_target_percent', targets: { '000063': 0.4, '000001': 0.3 }, reason: '轮动' },
      ],
      holdings: [
        { time: '2026-09-15', symbol: '600519', quantity: 100, market_value: 160000, equity: 200000, close: 1600 },
      ],
    },
    '2026-09-16',
    '2026-09-16',
  );
  assert.equal(set, null);
});

test('first live day uses today signal as pending next-open buys', () => {
  const set = collectPaperPicks(
    {
      metrics: {},
      equity_curve: [],
      trades: [],
      orders: [
        {
          symbol: '000001',
          created_at: '2026-09-16',
          updated_at: '2026-09-16',
          status: 'filled',
          side: 'buy',
          avg_price: 11.2,
          filled_quantity: 100,
        },
      ],
      rebalances: [
        { time: '2026-09-16', method: 'order_target_percent', targets: { '000001': 0.95 }, reason: '短均线上穿' },
      ],
    },
    '2026-09-16',
    '2026-09-16',
  );
  assert.equal(set?.badge, '下一交易日开盘');
  assert.equal(set?.hint, '下一交易日开盘买入');
  assert.equal(set?.signalDay, '2026-09-16');
  assert.equal(set?.picks.length, 1);
  assert.equal(set?.picks[0].symbol, '000001');
  assert.equal(set?.picks[0].pending, true);
  assert.equal(set?.picks[0].timing, 'next_open');
  assert.equal(set?.picks[0].side, 'buy');
  assert.equal(pickActionLabel(set!.picks[0]), '待买入');
});

test('pick action follows pending side', () => {
  assert.equal(pickActionLabel({ symbol: '1', weight: 0.5, side: 'buy', reason: '', timing: 'next_open', pending: true, fillPrice: null }), '待买入');
  assert.equal(pickActionLabel({ symbol: '1', weight: 0, side: 'sell', reason: '', timing: 'close', pending: false, fillPrice: 1 }), '卖出');
});
