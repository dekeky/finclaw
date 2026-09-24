import assert from 'node:assert/strict';
import test from 'node:test';
import { actionMarkerDays } from './returnChartMarkers.ts';

test('keeps action days that still exist on the return series', () => {
  assert.deepEqual(actionMarkerDays(['2026-09-11', '2026-09-16'], new Set(['2026-09-11', '2026-09-12', '2026-09-16'])), [
    '2026-09-11',
    '2026-09-16',
  ]);
});

test('normalizes timestamps and drops days missing from the series', () => {
  assert.deepEqual(
    actionMarkerDays(['2026-09-11T15:00:00', '2026-09-99', '2026-09-12'], new Set(['2026-09-11'])),
    ['2026-09-11'],
  );
});
