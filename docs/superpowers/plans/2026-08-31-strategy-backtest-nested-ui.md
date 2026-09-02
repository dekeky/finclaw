# Strategy-scoped Backtest UI Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Nest backtest history under the selected strategy (many runs → one strategy) via frontend UX.

**Architecture:** Remove page-level 策略/回测 tabs. Strategy shell keeps list + chat. Selected strategy gets secondary 代码|回测 tabs; runs panel filters by `strategy_name`.

**Tech Stack:** React, existing `/api/v1/backtest` list (client filter).

---

### Task 1: Filter BacktestRunsPanel by strategy

**Files:**
- Modify: `frontend/src/components/backtest/BacktestRunsPanel.tsx`

- [x] Add required `strategyName` prop; filter list/poll/delete selection; empty copy 「本策略还没有回测」

### Task 2: Nest panes in BacktestPage

**Files:**
- Modify: `frontend/src/pages/BacktestPage.tsx`

- [x] Replace top tabs with strategy-scoped `strategyPane: 'code' | 'runs'`
- [x] Keep chat visible on runs; auto-switch to runs after submit

### Task 3: Design record

**Files:**
- Create: `docs/superpowers/specs/2026-08-31-strategy-backtest-nested-ui-design.md`

- [x] Document scope A (UI only) and out-of-scope API work
