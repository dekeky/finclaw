import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldContinueLivePoll, shouldFetchLiveRun, type LivePollState } from './liveRun';

function poll(state: Partial<LivePollState> & Pick<LivePollState, 'cancelled'>): boolean {
  return shouldContinueLivePoll({
    cancelled: state.cancelled,
    currentStatus: state.currentStatus ?? null,
    hasLiveItems: state.hasLiveItems ?? false,
  });
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
