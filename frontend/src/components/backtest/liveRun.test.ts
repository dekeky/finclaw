import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunDetail, RunListItem } from '../../api/backtest.ts';
import {
  mergeLiveDetail,
  rememberRunDetail,
  resetRunDetailCache,
  seedCurrentRun,
  shouldContinueLivePoll,
  shouldFetchLiveRun,
  shouldShowReportBody,
  shouldShowReportSkeleton,
  shouldSkipStoredRefetch,
  type LivePollState,
} from './liveRun';

function poll(state: Partial<LivePollState> & Pick<LivePollState, 'cancelled'>): boolean {
  return shouldContinueLivePoll({
    cancelled: state.cancelled,
    currentStatus: state.currentStatus ?? null,
    hasLiveItems: state.hasLiveItems ?? false,
  });
}

function request(): RunDetail['request'] {
  return {
    strategy_name: 'dual_ma',
    symbols: ['600000'],
    initial_cash: 100000,
    start_time: '2020-01-01',
    end_time: '2020-06-01',
  };
}

function completedRun(overrides: Partial<RunDetail> = {}): RunDetail {
  return {
    id: 'run-done',
    status: 'succeeded',
    created_at: '2020-01-01T00:00:00Z',
    updated_at: '2020-01-02T00:00:00Z',
    started_at: '2020-01-01T00:00:00Z',
    finished_at: '2020-01-02T00:00:00Z',
    request: request(),
    result: {
      metrics: { total_return_pct: 10 },
      equity_curve: [{ time: '2020-01-02', equity: 110000 }],
      trades: [],
      orders: [],
    },
    ...overrides,
  };
}

function listItem(overrides: Partial<RunListItem> = {}): RunListItem {
  return {
    id: 'run-done',
    status: 'succeeded',
    strategy_name: 'dual_ma',
    created_at: '2020-01-01T00:00:00Z',
    updated_at: '2020-01-02T00:00:00Z',
    symbols: ['600000'],
    request: request(),
    ...overrides,
  };
}

test('keeps polling after the viewed run is no longer live if another run is still running', () => {
  assert.equal(
    poll({ cancelled: false, currentStatus: 'succeeded', hasLiveItems: true }),
    true,
  );
});

test('keeps polling after current is cleared while a live run remains in the list', () => {
  assert.equal(poll({ cancelled: false, currentStatus: null, hasLiveItems: true }), true);
});

test('stops polling when the panel unmounts or the effect is cancelled', () => {
  assert.equal(poll({ cancelled: true, currentStatus: 'running', hasLiveItems: true }), false);
});

test('stops polling when nothing in the session is live', () => {
  assert.equal(poll({ cancelled: false, currentStatus: 'succeeded', hasLiveItems: false }), false);
});

test('fetches the selected run after current is cleared on a view switch', () => {
  assert.equal(shouldFetchLiveRun(null, 'run-live'), true);
});

test('does not use the live endpoint for a completed run after current is cleared', () => {
  assert.equal(shouldFetchLiveRun(null, 'run-done', 'succeeded'), false);
});

test('does not replace a completed report with a stale live snapshot', () => {
  const merged = mergeLiveDetail(completedRun(), {
    ...completedRun({ status: 'running', result: undefined }),
    live_equity: [{ time: '2020-01-02', equity: 101000 }],
  });
  assert.equal(merged.status, 'succeeded');
  assert.equal(merged.result?.equity_curve?.length, 1);
});

test('keeps a completed equity curve when a later payload omits the result', () => {
  const merged = mergeLiveDetail(completedRun(), completedRun({ result: undefined }));
  assert.equal(merged.status, 'succeeded');
  assert.ok(merged.result?.equity_curve?.length);
});

test('seeds a remounted panel from the cached completed run instead of an empty placeholder', () => {
  resetRunDetailCache();
  rememberRunDetail(completedRun());
  const seeded = seedCurrentRun({
    selectedId: 'run-done',
    current: null,
    item: listItem(),
  });
  assert.equal(seeded?.status, 'succeeded');
  assert.equal(seeded?.result?.equity_curve?.length, 1);
});

test('does not clobber a loaded report with a list placeholder of the same run', () => {
  const seeded = seedCurrentRun({
    selectedId: 'run-done',
    current: completedRun(),
    item: listItem(),
  });
  assert.equal(seeded?.result?.equity_curve?.length, 1);
});

test('skips refetching a cached completed run after coming back to the report', () => {
  assert.equal(shouldSkipStoredRefetch(completedRun(), 'succeeded'), true);
  assert.equal(shouldSkipStoredRefetch(completedRun({ status: 'running', result: undefined }), 'running'), false);
  assert.equal(shouldSkipStoredRefetch(completedRun({ status: 'canceled' }), 'canceled'), true);
  assert.equal(shouldSkipStoredRefetch(completedRun({ status: 'cancelled' }), 'cancelled'), true);
});

test('does not keep a cancelled report in the loading skeleton', () => {
  assert.equal(shouldShowReportSkeleton('cancelled', false), false);
  assert.equal(shouldShowReportSkeleton('canceled', false), false);
  assert.equal(shouldShowReportSkeleton('failed', false), false);
  assert.equal(shouldShowReportSkeleton('succeeded', false), true);
  assert.equal(shouldShowReportSkeleton('running', false), false);
});

test('keeps a cancelled run chart when live equity already arrived', () => {
  assert.equal(shouldShowReportBody('cancelled', false, true), true);
  assert.equal(shouldShowReportBody('cancelled', false, false), false);
  assert.equal(shouldShowReportBody('running', false, false), true);
});

test('keeps live equity when a run is cancelled without a stored result', () => {
  const prev = completedRun({
    id: 'run-live',
    status: 'running',
    result: undefined,
    live_equity: [{ time: '2020-01-02', equity: 101000 }],
  });
  const merged = mergeLiveDetail(prev, {
    ...prev,
    status: 'cancelled',
    result: undefined,
    live_equity: undefined,
  });
  assert.equal(merged.status, 'cancelled');
  assert.equal(merged.live_equity?.length, 1);
});
