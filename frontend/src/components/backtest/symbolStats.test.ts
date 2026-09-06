import assert from 'node:assert/strict';
import test from 'node:test';
import { collectSymbolStats } from './symbolStats';

const orders = [
  {
    symbol: '601012',
    side: 'buy',
    status: 'filled',
    filled_quantity: 6300,
    avg_price: 15.0009775956,
    filled_value: 94506.15885228,
    commission: 29.2969092442068,
    commission_fee: 28.351847655683997,
    stamp_tax: 0,
    transfer_fee: 0.9450615885228001,
    created_at: '2020-02-06T08:00:00+08:00',
    updated_at: '2020-02-07T08:00:00+08:00',
  },
  {
    symbol: '601012',
    side: 'sell',
    status: 'filled',
    filled_quantity: 6300,
    avg_price: 15.64672092982,
    filled_value: 98574.341857866,
    commission: 129.13238783380447,
    commission_fee: 29.572302557359798,
    stamp_tax: 98.574341857866,
    transfer_fee: 0.9857434185786601,
    created_at: '2020-03-02T08:00:00+08:00',
    updated_at: '2020-03-03T08:00:00+08:00',
  },
  {
    symbol: '600406',
    side: 'buy',
    status: 'filled',
    filled_quantity: 100,
    avg_price: 10,
    commission: 5,
    created_at: '2020-04-01',
    updated_at: '2020-04-02',
  },
  {
    symbol: '600406',
    side: 'sell',
    status: 'filled',
    filled_quantity: 100,
    avg_price: 9,
    commission: 5,
    created_at: '2020-05-01',
    updated_at: '2020-05-02',
  },
];

const trades = [
  { symbol: '601012', pnl: 4068.183005586, net_pnl: 3909.753708507989 },
  { symbol: '600406', pnl: -100, net_pnl: -110 },
];

test('uses trade net_pnl for symbol stats', () => {
  const stats = collectSymbolStats(['601012', '600406'], trades, orders, []);
  const row = stats.find((item) => item.symbol === '601012');
  assert.ok(row);
  assert.equal(row.fills, 2);
  assert.equal(row.trades, 1);
  assert.ok(Math.abs(row.pnl - 3909.753708507989) < 1e-6);
  assert.ok(row.returnPct !== null && row.returnPct !== 0);
});

test('replays fills when trades are missing so pnl cannot stay zero', () => {
  const withTrades = collectSymbolStats(['601012', '600406'], trades, orders, []);
  const fromFills = collectSymbolStats(['601012', '600406'], [], orders, []);
  const a = withTrades.find((item) => item.symbol === '600406');
  const b = fromFills.find((item) => item.symbol === '600406');
  assert.ok(a && b);
  assert.equal(a.fills, 2);
  assert.equal(b.fills, 2);
  assert.ok(Math.abs(b.pnl - a.pnl) < 1e-6);
  assert.ok(Math.abs(b.pnl + 110) < 1e-6);
  assert.equal(b.losses, 1);
  assert.equal(b.wins, 0);
});
