import assert from 'node:assert/strict';
import test from 'node:test';
import type { PaperSessionDetail } from '../api/paper.ts';
import {
  paperDisplayReturn,
  paperSignedClass,
  paperStatusLabel,
  paperToRunDetail,
  samePaperPollSnapshot,
} from './paperSession.ts';

function session(partial: Partial<PaperSessionDetail> = {}): PaperSessionDetail {
  return {
    id: 'p1',
    name: '双均线',
    status: 'running',
    strategy_name: 'dual_ma',
    go_live: '2026-09-11',
    engine_start: '2026-09-11',
    initial_cash: 100000,
    equity: 101000,
    return_pct: 1,
    universe: 'picks',
    symbols: ['600000'],
    created_at: '2026-09-11T00:00:00Z',
    updated_at: '2026-09-11T00:00:00Z',
    ...partial,
  };
}

test('paper status labels', () => {
  assert.equal(paperStatusLabel('catching_up'), '同步中');
  assert.equal(paperStatusLabel('paused'), '已暂停');
});

test('maps a synced account to a succeeded report', () => {
  const detail = paperToRunDetail(
    session({
      result: { metrics: { total_return_pct: 1 }, equity_curve: [{ time: '2026-09-11', equity: 101000 }] },
    }),
  );
  assert.equal(detail.status, 'succeeded');
  assert.equal(detail.request.initial_cash, 100000);
  assert.equal(detail.request.start_time, '2026-09-11');
  assert.equal(detail.result?.equity_curve?.length, 1);
});

test('keeps first sync as live running', () => {
  const detail = paperToRunDetail(session({ status: 'catching_up' }));
  assert.equal(detail.status, 'running');
});

test('display return prefers equity over stale percent', () => {
  assert.equal(paperDisplayReturn({ equity: 94188.83, initial_cash: 100000, return_pct: 0 }).toFixed(2), '-5.81');
});

test('poll snapshot ignores freshly parsed objects with the same bars', () => {
  const prev = session({
    last_bar_date: '2026-09-16',
    last_run_id: 'r1',
    result: { orders: [{ symbol: '000001' }], prices: [{ symbol: '000001', time: '2026-09-16', close: 10 }] },
  });
  const next = session({
    last_bar_date: '2026-09-16',
    last_run_id: 'r1',
    result: { orders: [{ symbol: '000001' }], prices: [{ symbol: '000001', time: '2026-09-16', close: 10 }] },
  });
  assert.equal(samePaperPollSnapshot(prev, next), true);
});

test('poll snapshot changes when a new bar lands', () => {
  const prev = session({ last_bar_date: '2026-09-15', equity: 101000 });
  const next = session({ last_bar_date: '2026-09-16', equity: 101500 });
  assert.equal(samePaperPollSnapshot(prev, next), false);
});

test('signed class uses A-share red up', () => {
  assert.match(paperSignedClass(1), /e11d2e/);
  assert.match(paperSignedClass(-1), /00a870/);
  assert.equal(paperSignedClass(0), 'text-muted-foreground');
});
