import assert from 'node:assert/strict';
import test from 'node:test';
import { chartRestoreAction } from './chartHost';

test('skips painting while the pane is hidden even if a chart instance still exists', () => {
  assert.equal(
    chartRestoreAction({ active: false, width: 800, height: 300, hasChart: true }),
    'skip',
  );
});

test('creates a new chart after the host becomes visible with a real size', () => {
  assert.equal(
    chartRestoreAction({ active: true, width: 800, height: 300, hasChart: false }),
    'create',
  );
});

test('resizes an existing chart when the visible host changes size', () => {
  assert.equal(
    chartRestoreAction({ active: true, width: 800, height: 300, hasChart: true }),
    'resize',
  );
});

test('waits until the host has a real box after display none', () => {
  assert.equal(
    chartRestoreAction({ active: true, width: 0, height: 0, hasChart: false }),
    'skip',
  );
});
