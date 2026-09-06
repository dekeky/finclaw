import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeLogEvents, type RebalanceEvent, type RejectRow } from './RebalanceTable';

test('keeps filled submitted rows and drops rejected ghosts', () => {
  const rows: RebalanceEvent[] = [
    {
      time: '2020-02-06',
      method: 'order_target_percent',
      status: 'submitted',
      targets: { '601012': 0.95 },
      order_ids: ['oid-fill'],
      reason: '短均线上穿',
    },
    {
      time: '2020-02-13',
      method: 'order_target_percent',
      status: 'submitted',
      targets: { '600519': 0.95 },
      order_ids: ['oid-reject'],
      reason: '短均线上穿',
    },
  ];
  const rejects: RejectRow[] = [
    {
      time: '2020-02-13',
      symbol: '600519',
      side: 'buy',
      quantity: 100,
      reject_reason: 'insufficient cash',
      status: 'rejected',
    },
  ];
  const orders = [
    {
      symbol: '601012',
      side: 'buy',
      status: 'filled',
      filled_quantity: 6300,
      avg_price: 15,
      created_at: '2020-02-06T08:00:00+08:00',
      updated_at: '2020-02-07T08:00:00+08:00',
    },
  ];
  const merged = mergeLogEvents(rows, rejects, orders);
  const methods = merged.map((row) => `${row.time}:${row.method}:${Object.keys(row.targets ?? {})[0] || row.selected?.[0]}`);
  assert.ok(methods.some((item) => item.includes('order_target_percent:601012')));
  assert.ok(methods.some((item) => item.includes('rejected:600519')));
  assert.equal(
    merged.filter((row) => row.status === 'submitted' && Object.keys(row.targets ?? {}).includes('600519')).length,
    0,
  );
});
