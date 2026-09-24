import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStrategyAgentPrompt, canAnalyzeBacktest } from './strategyPlatforms.ts';

const strategyPath = '/home/demo/.finclaw/demo/strategies/dual_ma.py';

test('untargeted prompt still points at the latest summary', () => {
  const prompt = buildStrategyAgentPrompt('finclaw', '看看回测', { strategyPath });
  assert.match(prompt, /阅读最新的 summary\.md/);
  assert.doesNotMatch(prompt, /【定向回测】/);
  assert.equal(prompt.endsWith('用户需求：看看回测'), true);
});

test('pinned run tells the agent to analyze only that backtest', () => {
  const prompt = buildStrategyAgentPrompt('finclaw', '分析收益和回撤', {
    strategyPath,
    analysisRun: { id: 'run-9', name: '早盘回测', status: 'succeeded' },
  });
  assert.match(prompt, /【定向回测】早盘回测/);
  assert.match(prompt, /回测 ID：run-9/);
  assert.match(prompt, /\/home\/demo\/\.finclaw\/demo\/backtests\/dual_ma/);
  assert.match(prompt, /只分析这一次回测/);
  assert.match(prompt, /不要改策略文件/);
  assert.doesNotMatch(prompt, /阅读最新的 summary\.md/);
  assert.equal(prompt.endsWith('用户需求：分析收益和回撤'), true);
});

test('only finished runs can be added to the chat', () => {
  assert.equal(canAnalyzeBacktest('succeeded'), true);
  assert.equal(canAnalyzeBacktest('failed'), true);
  assert.equal(canAnalyzeBacktest('cancelled'), true);
  assert.equal(canAnalyzeBacktest('running'), false);
  assert.equal(canAnalyzeBacktest('queued'), false);
});
