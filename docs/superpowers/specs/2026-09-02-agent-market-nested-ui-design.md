# Agent ↔ Agent 市场 Nested UI Design

**Date:** 2026-09-02  
**Scope:** Frontend UX only. Mirror `/backtest` (量化) browse shell. No backend / AgentHub API changes.

## Problem

`Agent` 与 `Agent 市场` 是侧栏平级入口、独立页面。本机 Agent 用左栏列表 + 右侧详情；市场是另一路由。与量化页「我的策略 | 策略市场」卡片浏览 → 详情 不一致，切换成本高，视觉语言分裂。

## Decision

Agent 为唯一壳；市场为本机列表的兄弟分段，交互与卡片风格对齐量化。

1. 侧栏只保留 **Agent**（`/agents`）；移除 **Agent 市场** 导航项。
2. `/agents/market`（及旧 `?market=1`）重定向到 `/agents`，并进入「Agent 市场」浏览分段。
3. 浏览态顶栏：`SegmentedControl` — **我的 Agent** | **Agent 市场**（页内不再重复「Agent」大标题）。
4. **我的 Agent**：网格卡片，复用量化 gallery 壳样式（`galleryShellClassName` / 与 `StrategyGalleryTile` 同级视觉：圆角边框、hover、虚线「新建」卡）；展示头像、名称、必要操作（对话、删除；重命名可沿用详情或卡片交互）。
5. 点卡片进入详情态：顶栏返回 + 名称；主区保留现有详情 tabs（基本资料 / 人设 / Skills / 运行时设置）及上传市场等能力。
6. **Agent 市场**：卡片列表同风格；点开进入模板详情 / 安装流（能力来自现有 `AgentMarketPanel`，壳对齐策略市场）。
7. 市场安装成功：切回「我的 Agent」并打开新 Agent 详情。
8. Chat / 工具栏等链到市场的入口改为进入合并页的市场分段。

## Out of scope

- 后端 API、AgentHub 协议、上传/安装业务规则
- Agent 详情 tab 内容重做或信息架构大改
- 跨 Agent 对比、市场搜索服务端改造

## Empty / edge states

- 无本机 Agent：空态引导「新建 Agent」+「浏览 Agent 市场」（对齐量化空态）
- 市场加载失败：错误文案 + 重试
- 未登录：沿用现有 `requireAuth` 门禁

## Success criteria

- 侧栏仅一个 Agent 入口即可完成「管本机 + 逛市场」
- 浏览态卡片风格与量化策略卡一致
- 用户不必离开 `/agents` 即可在我的 / 市场间切换
