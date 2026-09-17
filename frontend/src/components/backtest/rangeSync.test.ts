import assert from 'node:assert/strict';
import test from 'node:test';
import {
  boxZoomLogicalRange,
  initialVisibleRange,
  isBoxZoomGesture,
  isChartPlotPoint,
  recentLogicalRange,
} from './rangeSync.ts';

test('box zoom maps a dragged window onto the selected bars', () => {
  const range = boxZoomLogicalRange(10, 40, 200);
  assert.ok(range);
  assert.ok(range.from < 10);
  assert.ok(range.to > 40);
  const selected = 30;
  const visible = range.to - range.from;
  assert.ok(Math.abs(selected / visible - 0.8) < 0.02);
});

test('box zoom ignores a click or tiny drag', () => {
  assert.equal(boxZoomLogicalRange(12, 12.4, 200), null);
  assert.equal(isBoxZoomGesture(4, 20), false);
  assert.equal(isBoxZoomGesture(24, 8), true);
});

test('box zoom does not start on the price or time axis', () => {
  const plot = { width: 800, height: 400, timeAxisHeight: 24 };
  assert.equal(isChartPlotPoint(10, 10, plot), true);
  assert.equal(isChartPlotPoint(810, 10, plot), false);
  assert.equal(isChartPlotPoint(10, 390, plot), false);
});

test('recent range shows the last N bars', () => {
  const range = recentLogicalRange(1000, 244);
  assert.ok(range);
  assert.ok(range.from > 700);
  assert.ok(range.to > 999);
});

test('visibleBars wins over a focus index so inspect can default to one year', () => {
  const range = initialVisibleRange(1000, { focusIndex: 50, visibleBars: 244 });
  const recent = recentLogicalRange(1000, 244);
  assert.deepEqual(range, recent);
});
