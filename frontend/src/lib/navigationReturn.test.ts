import assert from 'node:assert/strict';
import test from 'node:test';
import { parseReturnTo, withReturnTo } from './navigationReturn.ts';

test('keeps in-app paper and backtest paths', () => {
  assert.equal(parseReturnTo({ returnTo: '/paper/abc' }), '/paper/abc');
  assert.equal(parseReturnTo({ returnTo: '/paper?strategy=dual_ma' }), '/paper?strategy=dual_ma');
  assert.equal(parseReturnTo({ returnTo: '/backtest' }), '/backtest');
});

test('rejects missing or unsafe return paths', () => {
  assert.equal(parseReturnTo(null), null);
  assert.equal(parseReturnTo({}), null);
  assert.equal(parseReturnTo({ returnTo: 'paper' }), null);
  assert.equal(parseReturnTo({ returnTo: '//evil.example' }), null);
  assert.equal(parseReturnTo({ returnTo: 'https://evil.example' }), null);
  assert.equal(parseReturnTo({ returnTo: '/\\evil' }), null);
});

test('withReturnTo records the origin path', () => {
  assert.deepEqual(withReturnTo('/paper/abc'), { returnTo: '/paper/abc' });
});
