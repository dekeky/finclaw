import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectOverlayStyle, parentDialogOpenChange } from './inspectLayer.ts';

test('inspect overlay stays clickable above a Radix dialog that disables body pointer events', () => {
  const style = inspectOverlayStyle({ zIndex: 1300 });
  assert.equal(style.pointerEvents, 'auto');
  assert.equal(style.zIndex, 1300);
});

test('closing the parent while inspect is open dismisses the kline, not the parent', () => {
  assert.equal(parentDialogOpenChange(false, true, false), 'close-inspect');
  assert.equal(parentDialogOpenChange(false, true, true), 'close-inspect');
});

test('parent dialog close is ignored only while a run is submitting', () => {
  assert.equal(parentDialogOpenChange(false, false, true), 'ignore');
  assert.equal(parentDialogOpenChange(false, false, false), 'close');
  assert.equal(parentDialogOpenChange(true, true, true), 'open');
});
