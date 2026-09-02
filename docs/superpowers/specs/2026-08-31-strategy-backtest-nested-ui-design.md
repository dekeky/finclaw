# Strategy ↔ Backtest Nested UI Design

**Date:** 2026-08-31  
**Scope:** Frontend UX only (Approach A). No backend / fquant API changes.

## Problem

`/backtest` treats **策略** and **回测** as sibling top-level tabs. Runs are listed globally, so the many-to-one relationship (many runs → one strategy) exists only as `strategy_name` on run records, not in the product surface. That breaks the research loop: edit → run → inspect → tweak.

## Decision

Strategy is the primary shell. Backtests are children of the selected strategy.

1. Remove the page-level 「策略 | 回测」 tabs.
2. Keep the left strategy list + optional right AI chat always (except library/empty states as today).
3. When a strategy is selected, the main pane uses secondary tabs: **代码 | 回测**.
4. 「回测」 shows only runs where `strategy_name ===` current strategy (client-side filter of existing list API).
5. Successful 「运行」 auto-saves if dirty, submits, switches to **回测**, and focuses the new run id.
6. Switching strategies while on **回测** keeps the tab; the run list refilters. Selecting library / clearing selection leaves the nested tabs.

## Out of scope

- Server-side `?strategy_name=` filter
- Cascade delete / rename sync of runs when a strategy is renamed or deleted
- Cross-strategy run comparison, version snapshots, experiment groups

## Empty / edge states

- No runs for strategy: 「本策略还没有回测」+ hint to use 运行
- Non–FinClaw platform: 回测 tab still available (may be empty); native run button remains gated as today
- Unauthenticated: same auth gates as today

## Success criteria

- User never leaves strategy context to browse that strategy’s runs
- Global mixed run list is gone from the default path
- Chat remains available while viewing a strategy’s runs
