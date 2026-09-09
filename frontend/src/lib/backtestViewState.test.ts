import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBacktestViewState } from './backtestViewState';

test('restores the last strategy and runs pane after leaving the page', () => {
  const state = parseBacktestViewState(
    JSON.stringify({
      selectedName: 'dual_ma',
      strategyPane: 'runs',
      selectedRunId: 'run-done',
      runsReady: true,
    }),
  );
  assert.deepEqual(state, {
    selectedName: 'dual_ma',
    strategyPane: 'runs',
    selectedRunId: 'run-done',
    runsReady: true,
  });
});

test('falls back to the code pane when stored view state is missing or invalid', () => {
  assert.deepEqual(parseBacktestViewState(null), {
    selectedName: null,
    strategyPane: 'code',
    selectedRunId: null,
    runsReady: false,
  });
  assert.equal(parseBacktestViewState('{not json').strategyPane, 'code');
});
