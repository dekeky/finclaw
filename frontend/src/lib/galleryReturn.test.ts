import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunListItem } from '../api/backtest.ts';
import {
  latestValidRunForStrategy,
  returnSeriesFromEquity,
} from './galleryReturn.ts';

function run(partial: Partial<RunListItem> & Pick<RunListItem, 'id'>): RunListItem {
  return {
    status: 'succeeded',
    strategy_name: 'dual_ma',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    symbols: ['600000'],
    request: { strategy_name: 'dual_ma', initial_cash: 100000, start_time: '2020-01-01', end_time: '2020-12-31' },
    ...partial,
  };
}

test('turns equity into cumulative return percent using initial cash', () => {
  const series = returnSeriesFromEquity(
    [
      { time: '2020-01-02', equity: 100000 },
      { time: '2020-01-03', equity: 110000 },
      { time: '2020-01-06', equity: 95000 },
    ],
    100000,
  );
  assert.equal(series.length, 3);
  assert.equal(series[0]?.value, 0);
  assert.equal(series[1]?.value.toFixed(2), '10.00');
  assert.equal(series[2]?.value.toFixed(2), '-5.00');
});

test('seeds a 0% start so a single live point still makes a line', () => {
  const series = returnSeriesFromEquity(
    [{ time: '2026-09-14', equity: 94188.83 }],
    100000,
    '2026-09-13',
  );
  assert.equal(series.length, 2);
  assert.equal(series[0]?.time, '2026-09-13');
  assert.equal(series[0]?.value, 0);
  assert.equal(series[1]?.time, '2026-09-14');
  assert.equal(series[1]?.value.toFixed(2), '-5.81');
});

test('uses the previous day when go-live is the only equity day', () => {
  const series = returnSeriesFromEquity(
    [{ time: '2026-09-14', equity: 94457.37 }],
    100000,
    '2026-09-14',
  );
  assert.equal(series.length, 2);
  assert.ok(series[0] && series[1]);
  assert.notEqual(series[0].time, series[1].time);
  assert.equal(series[0].value, 0);
  assert.equal(series[1].value.toFixed(2), '-5.54');
});

test('picks the newest succeeded run that has a usable curve', () => {
  const latest = latestValidRunForStrategy(
    [
      run({
        id: 'old-ok',
        finished_at: '2026-02-01T00:00:00Z',
        updated_at: '2026-02-01T00:00:00Z',
        equity_curve: [
          { time: '2020-01-02', equity: 100000 },
          { time: '2020-01-03', equity: 101000 },
        ],
      }),
      run({
        id: 'new-empty',
        finished_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
        status: 'succeeded',
        equity_curve: [{ time: '2020-01-02', equity: 100000 }],
      }),
      run({
        id: 'new-failed',
        finished_at: '2026-04-01T00:00:00Z',
        updated_at: '2026-04-01T00:00:00Z',
        status: 'failed',
        equity_curve: [
          { time: '2020-01-02', equity: 100000 },
          { time: '2020-01-03', equity: 120000 },
        ],
      }),
      run({
        id: 'new-ok',
        finished_at: '2026-02-15T00:00:00Z',
        updated_at: '2026-02-15T00:00:00Z',
        equity_curve: [
          { time: '2021-01-04', equity: 100000 },
          { time: '2021-06-01', equity: 108000 },
        ],
      }),
    ],
    { id: 'sid-1', name: 'dual_ma' },
  );
  assert.equal(latest?.id, 'new-ok');
});

test('matches a renamed strategy by id', () => {
  const latest = latestValidRunForStrategy(
    [
      run({
        id: 'kept',
        strategy_id: 'sid-1',
        strategy_name: 'dual_ma',
        equity_curve: [
          { time: '2020-01-02', equity: 100000 },
          { time: '2020-01-03', equity: 101000 },
        ],
      }),
      run({
        id: 'other',
        strategy_id: 'sid-2',
        strategy_name: 'dual_ma_v2',
        equity_curve: [
          { time: '2020-01-02', equity: 100000 },
          { time: '2020-01-03', equity: 130000 },
        ],
      }),
    ],
    { id: 'sid-1', name: 'dual_ma_v2' },
  );
  assert.equal(latest?.id, 'kept');
});
