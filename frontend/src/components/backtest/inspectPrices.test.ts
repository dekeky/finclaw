import assert from 'node:assert/strict';
import test from 'node:test';
import {
  inspectCandleFingerprint,
  inspectPriceLoadPlan,
  inspectPriceRequestKey,
  seedCoversInspectRange,
} from './inspectPrices.ts';

test('seed coverage requires first and last bar to span the requested window', () => {
  const prices = [
    { time: '2024-01-02' },
    { time: '2024-06-01' },
  ];
  assert.equal(seedCoversInspectRange(prices, '2024-01-02', '2024-06-01'), true);
  assert.equal(seedCoversInspectRange(prices, '2016-01-01', '2024-06-01'), false);
  assert.equal(seedCoversInspectRange([], '2024-01-02', '2024-06-01'), false);
});

test('same inspect window does not refetch or flash loading', () => {
  const key = inspectPriceRequestKey('000001', '2016-09-18', '2026-09-16');
  assert.deepEqual(
    inspectPriceLoadPlan({
      requestKey: key,
      prevKey: key,
      codeChanged: false,
      seedCoversRange: false,
      hasLoadedPrices: true,
    }),
    { refetch: false, showLoading: false, clearPrices: false },
  );
});

test('first paper inspect without seed coverage shows loading and fetches', () => {
  const key = inspectPriceRequestKey('000001', '2016-09-18', '2026-09-16');
  assert.deepEqual(
    inspectPriceLoadPlan({
      requestKey: key,
      prevKey: '',
      codeChanged: true,
      seedCoversRange: false,
      hasLoadedPrices: false,
    }),
    { refetch: true, showLoading: true, clearPrices: true },
  );
});

test('seed-covered inspect still fetches but keeps the chart up', () => {
  const key = inspectPriceRequestKey('600000', '2020-01-01', '2020-06-01');
  assert.deepEqual(
    inspectPriceLoadPlan({
      requestKey: key,
      prevKey: '',
      codeChanged: true,
      seedCoversRange: true,
      hasLoadedPrices: false,
    }),
    { refetch: true, showLoading: false, clearPrices: false },
  );
});

test('same stock with a newer end date keeps the current candles while refetching', () => {
  assert.deepEqual(
    inspectPriceLoadPlan({
      requestKey: inspectPriceRequestKey('000001', '2016-09-19', '2026-09-17'),
      prevKey: inspectPriceRequestKey('000001', '2016-09-18', '2026-09-16'),
      codeChanged: false,
      seedCoversRange: false,
      hasLoadedPrices: true,
    }),
    { refetch: true, showLoading: false, clearPrices: false },
  );
});

test('switching symbol clears a non-seeded chart so the previous stock does not linger', () => {
  assert.deepEqual(
    inspectPriceLoadPlan({
      requestKey: inspectPriceRequestKey('000002', '2016-09-18', '2026-09-16'),
      prevKey: inspectPriceRequestKey('000001', '2016-09-18', '2026-09-16'),
      codeChanged: true,
      seedCoversRange: false,
      hasLoadedPrices: true,
    }),
    { refetch: true, showLoading: true, clearPrices: true },
  );
});

test('identical candle fingerprints keep the same series identity', () => {
  const left = [
    { time: '2024-01-02', close: 10, buy: { price: 10, quantity: 100 } },
    { time: '2024-01-03', close: 11 },
  ];
  const right = [
    { time: '2024-01-02', close: 10, buy: { price: 10, quantity: 100 } },
    { time: '2024-01-03', close: 11 },
  ];
  assert.equal(inspectCandleFingerprint(left), inspectCandleFingerprint(right));
  assert.notEqual(
    inspectCandleFingerprint(right),
    inspectCandleFingerprint([...right, { time: '2024-01-04', close: 12 }]),
  );
});
