import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLogEntries,
  filterLogEntries,
  filterStrategyLogs,
  formatLogTime,
  mergeLogEvents,
  type RebalanceEvent,
  type RejectRow,
} from './RebalanceTable';

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

test('mergeLogEvents interleaves strategy logs by day', () => {
  const rows: RebalanceEvent[] = [
    {
      time: '2020-02-06',
      method: 'order_target_percent',
      status: 'submitted',
      targets: { '601012': 0.95 },
      reason: '短均线上穿',
    },
  ];
  const logs = [
    { time: '2020-02-07', message: '次日观察' },
    { time: '2020-02-06 09:31:00', message: '开盘买入' },
  ];
  const merged = mergeLogEvents(rows, [], [], logs);
  assert.deepEqual(
    merged.map((row) => `${row.time}:${row.method}:${row.reason}`),
    [
      '2020-02-07:rebalance_log:次日观察',
      '2020-02-06 09:31:00:rebalance_log:开盘买入',
      '2020-02-06:order_target_percent:短均线上穿',
    ],
  );
});

test('filterStrategyLogs keeps rows inside the date range', () => {
  const rows = [
    { time: '2020-01-02', message: 'a' },
    { time: '2020-02-03', message: 'b' },
    { time: '2020-03-04', message: 'c' },
  ];
  assert.deepEqual(filterStrategyLogs(rows, '2020-02-01', '2020-02-28').map((row) => row.message), ['b']);
  assert.equal(filterStrategyLogs(rows).length, 3);
});

test('buildLogEntries merges strategy logs, rebalances, fills and rejects', () => {
  const rows: RebalanceEvent[] = [
    {
      time: '2020-02-06',
      method: 'order_target_percent',
      status: 'submitted',
      targets: { '601012': 0.95 },
      reason: '短均线上穿',
    },
    {
      time: '2020-02-13',
      method: 'order_target_percent',
      status: 'rejected',
      selected: ['600519'],
      reason: 'insufficient cash',
      plan: { side: 'buy', quantity: 100 },
    },
  ];
  const orders = [
    {
      symbol: '601012',
      side: 'buy',
      status: 'filled',
      filled_quantity: 6300,
      avg_price: 15,
      filled_value: 94500,
      commission_fee: 28.35,
      created_at: '2020-02-06T08:00:00+08:00',
      updated_at: '2020-02-06T08:00:00+08:00',
    },
  ];
  const logs = [{ time: '2020-02-07', message: '次日观察' }];
  const entries = buildLogEntries(rows, [], orders, logs, { '601012': '隆基股份', '600519': '贵州茅台' });
  const kinds = entries.map((entry) => entry.kind);
  assert.ok(kinds.includes('strategy'));
  assert.ok(kinds.includes('rebalance'));
  assert.ok(kinds.includes('fill'));
  assert.ok(kinds.includes('reject'));
  const fill = entries.find((entry) => entry.kind === 'fill');
  assert.ok(fill && fill.message.includes('隆基股份'));
  assert.ok(fill && fill.message.includes('佣金'));
  const reject = entries.find((entry) => entry.kind === 'reject');
  assert.ok(reject && reject.message.includes('100股'));
});

test('filterLogEntries filters by query, symbol and date', () => {
  const rows: RebalanceEvent[] = [
    {
      time: '2020-02-06',
      method: 'order_target_percent',
      status: 'submitted',
      targets: { '601012': 0.95 },
      reason: '短均线上穿',
    },
    {
      time: '2020-03-06',
      method: 'order_target_percent',
      status: 'submitted',
      targets: { '600519': 0.95 },
      reason: '长均线上穿',
    },
  ];
  const entries = buildLogEntries(rows, [], [], [], { '601012': '隆基股份', '600519': '贵州茅台' });
  assert.equal(entries.length, 2);
  assert.equal(filterLogEntries(entries, { query: '茅台' }).length, 1);
  assert.equal(filterLogEntries(entries, { query: '短均线' }).length, 1);
  assert.equal(filterLogEntries(entries, { symbol: '601012' }).length, 1);
  assert.equal(filterLogEntries(entries, { from: '2020-03-01' }).length, 1);
});

test('formatLogTime hides the daily-bar clock and keeps real intraday time', () => {
  // 日线行情时间戳 = 00:00 UTC（北京 08:00），不是真实成交时刻，只显示日期。
  assert.equal(formatLogTime('2026-09-28T08:00:00+08:00'), '2026-09-28');
  assert.equal(formatLogTime('2026-09-28T00:00:00Z'), '2026-09-28');
  assert.equal(formatLogTime('2026-09-28 00:00:00'), '2026-09-28');
  // 其它时间保持原样。
  assert.equal(formatLogTime('2020-02-06T09:31:00+08:00'), '2020-02-06 09:31:00');
  assert.equal(formatLogTime('2020-02-06'), '2020-02-06');
  assert.equal(formatLogTime(''), '—');
});
