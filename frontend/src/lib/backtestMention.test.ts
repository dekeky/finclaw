import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterMentionRuns,
  findBacktestMention,
  mentionableBacktests,
  removeBacktestMention,
} from './backtestMention.ts';

test('finds an @ token at the caret', () => {
  assert.deepEqual(findBacktestMention('分析 @早盘', 6), { start: 3, end: 6, query: '早盘' });
  assert.deepEqual(findBacktestMention('@', 1), { start: 0, end: 1, query: '' });
  assert.equal(findBacktestMention('邮箱 a@b.com', 6), null);
  assert.equal(findBacktestMention('分析 早盘', 5), null);
  assert.equal(findBacktestMention('分析 @早盘 收益', 7), null);
});

test('accepts a fullwidth at sign', () => {
  assert.deepEqual(findBacktestMention('＠回测', 3), { start: 0, end: 3, query: '回测' });
});

test('removing the token leaves the surrounding text', () => {
  const mention = findBacktestMention('看看 @早 的回撤', 5);
  assert.ok(mention);
  assert.deepEqual(removeBacktestMention('看看 @早 的回撤', mention), {
    value: '看看 的回撤',
    cursor: 3,
  });
  assert.deepEqual(removeBacktestMention('@早盘', { start: 0, end: 3, query: '早盘' }), {
    value: '',
    cursor: 0,
  });
});

test('only finished runs are mentionable, newest first', () => {
  const runs = mentionableBacktests(
    [
      { id: 'old', name: '旧回测', status: 'succeeded', created_at: '2026-01-01T00:00:00Z' },
      { id: 'live', name: '进行中', status: 'running', created_at: '2026-09-01T00:00:00Z' },
      { id: 'new', name: '新回测', status: 'failed', created_at: '2026-09-02T00:00:00Z' },
    ],
    (item) => item.name || '',
  );
  assert.deepEqual(
    runs.map((run) => run.id),
    ['new', 'old'],
  );
});

test('filters mention runs by name', () => {
  const runs = [
    { id: '1', name: '早盘回测', status: 'succeeded' },
    { id: '2', name: '收盘回测', status: 'succeeded' },
  ];
  assert.deepEqual(filterMentionRuns(runs, '早').map((run) => run.id), ['1']);
  assert.equal(filterMentionRuns(runs, '').length, 2);
});
