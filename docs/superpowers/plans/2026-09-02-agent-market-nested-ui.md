# Agent ↔ Agent 市场 Nested UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge Agent management and Agent market into one `/agents` shell matching 量化 (`/backtest`) browse + card gallery UX.

**Architecture:** Single `AgentsPage` owns `showMarket` + `selectedName`. Browse: SegmentedControl 我的 Agent | Agent 市场 + card grids. Detail: full-width existing agent tabs. Market: embed `AgentMarketPanel` with gallery-aligned cards. Sidebar drops separate market item; `/agents/market` redirects.

**Tech Stack:** React, existing agents/market APIs, `SegmentedControl`, `galleryShellClassName` / gallery tiles.

**Spec:** `docs/superpowers/specs/2026-09-02-agent-market-nested-ui-design.md`

---

### Task 1: AgentGalleryTile — done

- [x] `frontend/src/components/agent/AgentGalleryTile.tsx`

### Task 2: AgentsPage gallery shell — done

- [x] SegmentedControl + card gallery + detail; market embedded

### Task 3: Market cards + routing + nav — done

- [x] Sidebar / redirects / deep links; `npm run build` passed
