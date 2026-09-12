import assert from 'node:assert/strict';
import test from 'node:test';
import { runBelongsToStrategy, runConflictsWithStrategy } from './backtestStrategy.ts';

test('matches by strategy id even when the display name changed', () => {
  assert.equal(
    runBelongsToStrategy(
      { strategy_id: 'sid-1', strategy_name: 'dual_ma' },
      { id: 'sid-1', name: 'dual_ma_v2' },
    ),
    true,
  );
});

test('falls back to name when the run has no strategy id', () => {
  assert.equal(
    runBelongsToStrategy({ strategy_name: 'dual_ma' }, { id: 'sid-1', name: 'dual_ma' }),
    true,
  );
  assert.equal(
    runBelongsToStrategy({ strategy_name: 'dual_ma' }, { id: 'sid-1', name: 'other' }),
    false,
  );
});

test('does not treat a missing id as a conflict after rename', () => {
  assert.equal(
    runConflictsWithStrategy(
      { strategy_name: 'dual_ma', request: { strategy_name: 'dual_ma' } },
      { id: 'sid-1', name: 'dual_ma_v2' },
    ),
    false,
  );
  assert.equal(
    runConflictsWithStrategy(
      { strategy_id: 'sid-2', strategy_name: 'dual_ma' },
      { id: 'sid-1', name: 'dual_ma' },
    ),
    true,
  );
});
