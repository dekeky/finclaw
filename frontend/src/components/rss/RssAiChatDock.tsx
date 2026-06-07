import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FinclawMark } from '../FinclawMark';
import { AgentSwitcher } from '../AgentSwitcher';
import { ChatContainer } from '../ChatContainer';
import { InputArea } from '../InputArea';
import { ErrorBoundary } from '../ErrorBoundary';
import { useChatSession } from '../../state/chatSession';
import { useAgents } from '../../state/agents';
import { buildAnalysisUserMessage, type EntryForAnalysis } from '../../utils/analysisPrompt';
import { rssScopedItemKey } from '../../utils/rssScopedKey';
import { rssSourceDisplayLabel } from '../../utils/rssSourceLabel';

type Props = {
  listEntries: EntryForAnalysis[];
  selectedKeys: Set<string>;
  onToggleSelectKey: (key: string) => void;
  onClearSelection: () => void;
};

const DOCK_LS_KEY = 'finclaw.aiDock.position';

type Vec2 = { left: number; top: number };

type DockRect = { left: number; top: number; width: number; height: number };

const DOCK_MIN_W = 280;
const DOCK_MIN_H = 320;

function clampNum(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** 默认约占视口 80%，与产品设计大屏浮窗一致；小屏仍受最小宽高与 fitDockRect 约束 */
function dockDefaultSize(): { width: number; height: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = 24;
  const w = Math.round(vw * 0.8);
  const h = Math.round(vh * 0.8);
  return {
    width: clampNum(w, DOCK_MIN_W, Math.max(DOCK_MIN_W, vw - pad * 2)),
    height: clampNum(h, DOCK_MIN_H, Math.max(DOCK_MIN_H, vh - pad * 2)),
  };
}

function fitDockRect(r: DockRect, pad = 8): DockRect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let { left, top, width, height } = r;
  const maxW = Math.max(DOCK_MIN_W, vw - pad * 2);
  const maxH = Math.max(DOCK_MIN_H, vh - pad * 2);
  width = clampNum(width, DOCK_MIN_W, maxW);
  height = clampNum(height, DOCK_MIN_H, maxH);
  left = clampNum(left, pad, vw - width - pad);
  top = clampNum(top, pad, vh - height - pad);
  return { left, top, width, height };
}

function migrateStoredDock(raw: unknown): DockRect | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.left !== 'number' || typeof o.top !== 'number') return null;
  const defs = dockDefaultSize();
  const width = typeof o.width === 'number' ? o.width : defs.width;
  const height = typeof o.height === 'number' ? o.height : defs.height;
  return fitDockRect({ left: o.left, top: o.top, width, height });
}

function fabDefaultPos(): Vec2 {
  const w = 68;
  const h = 68;
  const pad = 22;
  return { left: window.innerWidth - w - pad, top: window.innerHeight - h - pad };
}

function clampDims(L: number, T: number, w: number, h: number, pad = 8): Vec2 {
  const maxL = Math.max(pad, window.innerWidth - w - pad);
  const maxT = Math.max(pad, window.innerHeight - h - pad);
  return {
    left: Math.min(maxL, Math.max(pad, L)),
    top: Math.min(maxT, Math.max(pad, T)),
  };
}

/** 首次展开：默认尺寸约 80% 视口，并在视口中居中（与产品设计一致） */
function defaultDockLayout(): DockRect {
  const { width, height } = dockDefaultSize();
  const left = Math.round((window.innerWidth - width) / 2);
  const top = Math.round((window.innerHeight - height) / 2);
  return fitDockRect({ left, top, width, height });
}

const FAB_SZ = 68;

function readStoredPositions(): { fab: Vec2; dock: DockRect | null } | null {
  try {
    const raw = localStorage.getItem(DOCK_LS_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as { fab?: Vec2; dock?: unknown };
    if (!j?.fab || typeof j.fab.left !== 'number' || typeof j.fab.top !== 'number') return null;
    const dock = j.dock != null ? migrateStoredDock(j.dock) : null;
    return { fab: j.fab, dock };
  } catch {
    return null;
  }
}

function writeStoredPositions(fab: Vec2, dock: DockRect | null) {
  try {
    localStorage.setItem(DOCK_LS_KEY, JSON.stringify({ fab, dock }));
  } catch {
    // ignore quota
  }
}

function CuteAiFab({
  fabRef,
  pos,
  setFabPos,
  onTapOpen,
  onLayoutsPersist,
}: {
  fabRef: React.RefObject<HTMLButtonElement>;
  pos: Vec2;
  setFabPos: React.Dispatch<React.SetStateAction<Vec2>>;
  onTapOpen: () => void;
  onLayoutsPersist: (fabNext: Vec2) => void;
}) {
  const dragRef = useRef<{
    pointerId: number;
    sx: number;
    sy: number;
    ox: number;
    oy: number;
  } | null>(null);
  const movedRef = useRef(false);
  const suppressClickRef = useRef(false);

  return (
    <button
      type="button"
      ref={fabRef}
      className="rss-ai-fab"
      style={{ left: pos.left, top: pos.top }}
      aria-label="打开 AI 对话（可拖动悬浮球调整位置）"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
        movedRef.current = false;
        dragRef.current = {
          pointerId: e.pointerId,
          sx: e.clientX,
          sy: e.clientY,
          ox: pos.left,
          oy: pos.top,
        };
      }}
      onPointerMove={(e) => {
        if (!dragRef.current || e.pointerId !== dragRef.current.pointerId) return;
        const dx = e.clientX - dragRef.current.sx;
        const dy = e.clientY - dragRef.current.sy;
        if (dx * dx + dy * dy > 16) movedRef.current = true;
        const next = clampDims(dragRef.current.ox + dx, dragRef.current.oy + dy, FAB_SZ, FAB_SZ);
        setFabPos(next);
      }}
      onPointerUp={(e) => {
        if (!dragRef.current || e.pointerId !== dragRef.current.pointerId) return;
        try {
          (e.currentTarget as HTMLButtonElement).releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
        dragRef.current = null;
        if (movedRef.current && fabRef.current) {
          suppressClickRef.current = true;
          const r = fabRef.current.getBoundingClientRect();
          const next = clampDims(r.left, r.top, FAB_SZ, FAB_SZ);
          setFabPos(next);
          onLayoutsPersist(next);
        }
      }}
      onPointerCancel={(e) => {
        dragRef.current = null;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }}
      onClick={(e) => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          e.preventDefault();
          return;
        }
        onTapOpen();
      }}
    >
      <span className="rss-ai-fab-glow" aria-hidden />
      <span className="rss-ai-fab-face">
        <svg className="rss-ai-fab-svg" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <ellipse cx="32" cy="36" rx="22" ry="20" fill="url(#fabGradFab)" />
          <ellipse cx="22" cy="30" rx="5" ry="7" fill="#fff5" transform="rotate(-15 22 30)" />
          <ellipse cx="42" cy="30" rx="5" ry="7" fill="#fff5" transform="rotate(15 42 30)" />
          <circle cx="24" cy="34" r="3.5" fill="#1a1520" />
          <circle cx="40" cy="34" r="3.5" fill="#1a1520" />
          <circle cx="25" cy="33" r="1.2" fill="#fff" />
          <circle cx="41" cy="33" r="1.2" fill="#fff" />
          <ellipse cx="26" cy="42" rx="3" ry="2" fill="#ffb6c8" opacity="0.65" />
          <ellipse cx="38" cy="42" rx="3" ry="2" fill="#ffb6c8" opacity="0.65" />
          <path
            d="M26 46 Q32 50 38 46"
            stroke="#1a1520"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
            opacity="0.85"
          />
          <path d="M14 18 Q32 8 50 18" stroke="#e8b84a" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.9" />
          <circle cx="18" cy="14" r="3" fill="#ffd966" opacity="0.95" />
          <circle cx="46" cy="14" r="3" fill="#ffd966" opacity="0.95" />
          <defs>
            <linearGradient id="fabGradFab" x1="18" y1="16" x2="46" y2="52" gradientUnits="userSpaceOnUse">
              <stop stopColor="#ffe8f0" />
              <stop offset="0.5" stopColor="#ffd6e8" />
              <stop offset="1" stopColor="#e8c4ff" />
            </linearGradient>
          </defs>
        </svg>
      </span>
      <span className="rss-ai-fab-sparkle" aria-hidden>
        ✨
      </span>
    </button>
  );
}

export function RssAiChatDock({ listEntries, selectedKeys, onToggleSelectKey, onClearSelection }: Props) {
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const fabRef = useRef<HTMLButtonElement>(null);
  const dockAsideRef = useRef<HTMLElement | null>(null);
  const dockDragRef = useRef<{ pointerId: number; sx: number; sy: number; ox: number; oy: number } | null>(
    null,
  );
  const dockResizeRef = useRef<{ pointerId: number; sx: number; sy: number; orig: DockRect } | null>(null);
  const dockMovedRef = useRef(false);
  const fabPosRef = useRef<Vec2>(fabDefaultPos());
  const dockPersistRef = useRef<DockRect | null>(null);

  const [fabPos, setFabPos] = useState<Vec2>(() => readStoredPositions()?.fab ?? fabDefaultPos());
  const [dockLayout, setDockLayout] = useState<DockRect | null>(() => readStoredPositions()?.dock ?? null);

  useEffect(() => {
    fabPosRef.current = fabPos;
  }, [fabPos]);

  useEffect(() => {
    dockPersistRef.current = dockLayout;
  }, [dockLayout]);

  const persistFabLayouts = useCallback((fabNext: Vec2) => {
    fabPosRef.current = fabNext;
    writeStoredPositions(fabNext, dockPersistRef.current ?? null);
  }, []);

  const revealDock = useCallback(() => {
    setDockLayout((prev) => prev ?? defaultDockLayout());
    setOpen(true);
  }, []);

  useEffect(() => {
    const onResize = () => {
      setFabPos((p) => clampDims(p.left, p.top, FAB_SZ, FAB_SZ));
      setDockLayout((d) => (d ? fitDockRect(d) : null));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const { agents, currentAgent, selectAgent, status: agentsStatus } = useAgents();
  const { messages, status, isTyping, sendError, send, clearMessages, reconnect, taskStartedAt } = useChatSession();

  const hasFeed = listEntries.length > 0;
  const noAgent = !currentAgent;
  const selectedEntries = useMemo(
    () => listEntries.filter((e) => selectedKeys.has(rssScopedItemKey(e.sourceName, e.sector, e.item))),
    [listEntries, selectedKeys],
  );

  const handleSend = useCallback(
    (text: string) => {
      setHint(null);
      if (noAgent) {
        setHint('当前没有可用 Agent，请前往 Agent 市场创建一位 Agent。');
        return;
      }
      const entries = selectedEntries;
      const missingLink = entries.length > 0 && entries.every((e) => !e.item.link?.trim());
      if (missingLink) {
        setHint('已选文章没有原文链接，请先取消选择或换一篇带链接的条目。');
        return;
      }
      const payload = buildAnalysisUserMessage(text, entries);
      send(payload);
    },
    [send, selectedEntries, noAgent],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const hasThread = messages.length > 0;

  const removeChip = (key: string) => {
    onToggleSelectKey(key);
  };

  return (
    <>
      <style>{DOCK_CSS}</style>
      {!open && (
        <CuteAiFab
          fabRef={fabRef}
          pos={fabPos}
          setFabPos={setFabPos}
          onTapOpen={revealDock}
          onLayoutsPersist={persistFabLayouts}
        />
      )}

      {open && dockLayout ? (
        <>
          <button type="button" className="rss-ai-backdrop" aria-label="关闭对话" onClick={() => setOpen(false)} />
          <aside
            ref={dockAsideRef}
            className="rss-ai-dock"
            style={{
              left: dockLayout.left,
              top: dockLayout.top,
              width: dockLayout.width,
              height: dockLayout.height,
            }}
            aria-label="AI 对话"
          >
            <div className="rss-ai-dock-head">
              <div
                className="rss-ai-dock-drag"
                role="presentation"
                title="拖拽移动浮窗 · 右下角可调整大小"
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  if ((e.target as HTMLElement).closest('a,button')) return;
                  const cur = dockLayout;
                  if (!cur) return;
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  dockMovedRef.current = false;
                  dockDragRef.current = {
                    pointerId: e.pointerId,
                    sx: e.clientX,
                    sy: e.clientY,
                    ox: cur.left,
                    oy: cur.top,
                  };
                }}
                onPointerMove={(e) => {
                  if (!dockDragRef.current || e.pointerId !== dockDragRef.current.pointerId) return;
                  const { sx, sy, ox, oy } = dockDragRef.current;
                  const dx = e.clientX - sx;
                  const dy = e.clientY - sy;
                  if (dx * dx + dy * dy > 16) dockMovedRef.current = true;
                  setDockLayout((prev) => {
                    if (!prev) return prev;
                    const pt = clampDims(ox + dx, oy + dy, prev.width, prev.height);
                    return { ...prev, left: pt.left, top: pt.top };
                  });
                }}
                onPointerUp={(e) => {
                  if (!dockDragRef.current || e.pointerId !== dockDragRef.current.pointerId) return;
                  try {
                    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                  } catch {
                    /* ignore */
                  }
                  dockDragRef.current = null;
                  if (dockMovedRef.current && dockAsideRef.current) {
                    const r = dockAsideRef.current.getBoundingClientRect();
                    const next = fitDockRect({
                      left: r.left,
                      top: r.top,
                      width: r.width,
                      height: r.height,
                    });
                    setDockLayout(next);
                    writeStoredPositions(fabPosRef.current, next);
                  }
                  dockMovedRef.current = false;
                }}
                onPointerCancel={(e) => {
                  dockDragRef.current = null;
                  dockMovedRef.current = false;
                  try {
                    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
                  } catch {
                    /* ignore */
                  }
                }}
              >
                <div className="rss-ai-dock-title">
                  <span className="rss-ai-dock-mark" aria-hidden>
                    <FinclawMark variant="mark" size={24} decorative />
                  </span>
                  <div>
                    <div className="rss-ai-dock-name">Finclaw AI</div>
                    <div className="rss-ai-dock-sub">
                      {hasFeed
                        ? '勾选金融资讯里的文章，可把原文链接一并发给助手 · 拖标题移动 · 右下调整大小'
                        : '直接提问即可 · 拖标题移动 · 右下调整大小'}
                    </div>
                  </div>
                </div>
              </div>
              <div className="rss-ai-dock-head-actions">
                <span className={`rss-ai-dock-dot rss-ai-dock-dot--${status}`} title={status} />
                {hasThread && (
                  <button
                    type="button"
                    className="rss-ai-dock-newchat"
                    onClick={clearMessages}
                    title="清空当前会话（元宝式新对话）"
                  >
                    新对话
                  </button>
                )}
                {!noAgent && (status === 'error' || status === 'idle') && (
                  <button type="button" className="rss-ai-dock-mini-btn" onClick={reconnect}>
                    重连
                  </button>
                )}
                <button type="button" className="rss-ai-dock-close" onClick={() => setOpen(false)} aria-label="关闭">
                  ×
                </button>
              </div>
            </div>

            <div className="rss-ai-dock-agentbar">
              <label className="rss-ai-dock-agentbar-label">Agent</label>
              {agents.length > 0 ? (
                <AgentSwitcher
                  agents={agents}
                  value={currentAgent}
                  onChange={selectAgent}
                  placeholder="请选择…"
                  showAvatar={false}
                  triggerClassName="rss-ai-dock-select-trigger"
                />
              ) : (
                <span className="rss-ai-dock-agentbar-empty">
                  {agentsStatus === 'loading' ? '加载中…' : '尚未创建 Agent'}
                </span>
              )}
              <Link
                to={agents.length === 0 ? '/agents/market' : '/agents'}
                className="rss-ai-dock-mini-btn rss-ai-dock-mini-btn--primary"
                title={agents.length === 0 ? '前往 Agent 市场' : '管理 Agent'}
              >
                {agents.length === 0 ? '市场' : '管理'}
              </Link>
            </div>

            {selectedEntries.length > 0 && (
              <div className="rss-ai-chips">
                <div className="rss-ai-chips-head">
                  <span>已选 {selectedEntries.length} 篇</span>
                  <button type="button" className="rss-ai-chips-clear" onClick={onClearSelection}>
                    清空
                  </button>
                </div>
                <div className="rss-ai-chips-row">
                  {selectedEntries.map((e) => {
                    const k = rssScopedItemKey(e.sourceName, e.sector, e.item);
                    const t = e.item.title || '(无标题)';
                    const short = t.length > 36 ? `${t.slice(0, 36)}…` : t;
                    return (
                      <span key={k} className="rss-ai-chip">
                        <span className="rss-ai-chip-text">
                          <span className="rss-ai-chip-title">{short}</span>
                          <span className="rss-ai-chip-meta">
                            {rssSourceDisplayLabel(e)} · {e.sector}
                          </span>
                        </span>
                        <button type="button" className="rss-ai-chip-x" onClick={() => removeChip(k)} aria-label="移除">
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {hint && <div className="rss-ai-hint">{hint}</div>}
            {sendError && <div className="rss-ai-warn">{sendError}</div>}

            <ErrorBoundary>
              <div className="rss-ai-dock-chat">
                <ChatContainer
                  messages={messages}
                  isTyping={isTyping}
                  onClear={clearMessages}
                  agentName={currentAgent}
                  variant="dock"
                  onQuickPrompt={handleSend}
                  taskStartedAt={taskStartedAt}
                />
              </div>
            </ErrorBoundary>

            <div className="rss-ai-dock-inputwrap">
              <InputArea
                onSend={handleSend}
                disabled={noAgent || status !== 'connected'}
                compact
                placeholder={
                  noAgent
                    ? agents.length === 0
                      ? '请前往 Agent 市场创建 Agent…'
                      : '请先选择一位 Agent…'
                    : selectedEntries.length > 0
                    ? '输入问题，将附带已选文章的原文链接…'
                    : '随便聊聊，或在列表勾选文章后再提问…'
                }
              />
            </div>
            <button
              type="button"
              className="rss-ai-dock-resize"
              aria-label="拖拽调整浮窗大小"
              onPointerDown={(e) => {
                e.stopPropagation();
                if (e.button !== 0) return;
                const cur = dockPersistRef.current;
                if (!cur) return;
                (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
                dockResizeRef.current = {
                  pointerId: e.pointerId,
                  sx: e.clientX,
                  sy: e.clientY,
                  orig: { ...cur },
                };
              }}
              onPointerMove={(e) => {
                const d = dockResizeRef.current;
                if (!d || e.pointerId !== d.pointerId) return;
                const pad = 8;
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const dx = e.clientX - d.sx;
                const dy = e.clientY - d.sy;
                const maxWByView = vw - d.orig.left - pad;
                const maxHByView = vh - d.orig.top - pad;
                const width = clampNum(d.orig.width + dx, DOCK_MIN_W, Math.max(DOCK_MIN_W, maxWByView));
                const height = clampNum(d.orig.height + dy, DOCK_MIN_H, Math.max(DOCK_MIN_H, maxHByView));
                setDockLayout({ ...d.orig, width, height });
              }}
              onPointerUp={(e) => {
                const d = dockResizeRef.current;
                if (!d || e.pointerId !== d.pointerId) return;
                try {
                  (e.currentTarget as HTMLButtonElement).releasePointerCapture(e.pointerId);
                } catch {
                  /* ignore */
                }
                dockResizeRef.current = null;
                if (!dockAsideRef.current) return;
                const r = dockAsideRef.current.getBoundingClientRect();
                const next = fitDockRect({
                  left: r.left,
                  top: r.top,
                  width: r.width,
                  height: r.height,
                });
                setDockLayout(next);
                writeStoredPositions(fabPosRef.current, next);
              }}
              onPointerCancel={(e) => {
                dockResizeRef.current = null;
                try {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                } catch {
                  /* ignore */
                }
              }}
            />
          </aside>
        </>
      ) : null}
    </>
  );
}

const DOCK_CSS = `
.rss-ai-fab {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 1100;
  width: 68px;
  height: 68px;
  border: none;
  border-radius: 50%;
  cursor: grab;
  padding: 0;
  background: transparent;
  filter: drop-shadow(0 8px 24px rgba(232, 184, 74, 0.35));
  transition: transform 0.2s ease;
}
.rss-ai-fab:hover:not(:active) { transform: scale(1.06); }
.rss-ai-fab:active { transform: scale(0.96); cursor: grabbing; }

.rss-ai-fab-glow {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, rgba(255,230,240,0.9), rgba(232,196,255,0.5) 55%, rgba(201,168,76,0.15));
  animation: rssAiFabPulse 2.8s ease-in-out infinite;
}
@keyframes rssAiFabPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.92; transform: scale(1.03); }
}

.rss-ai-fab-face {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}
.rss-ai-fab-svg { width: 56px; height: 56px; }
.rss-ai-fab-sparkle {
  position: absolute;
  right: -2px;
  top: -4px;
  font-size: 14px;
  animation: rssAiSpark 1.8s ease-in-out infinite;
  pointer-events: none;
}
@keyframes rssAiSpark {
  0%, 100% { opacity: 0.85; transform: rotate(-8deg) scale(1); }
  50% { opacity: 1; transform: rotate(8deg) scale(1.08); }
}

.rss-ai-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1090;
  background: rgba(15, 23, 42, 0.25);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: none;
  cursor: pointer;
  animation: rssAiFadeIn 0.2s ease;
}
@keyframes rssAiFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.rss-ai-dock {
  position: fixed;
  z-index: 1100;
  box-sizing: border-box;
  min-width: 280px;
  min-height: 320px;
  right: auto;
  bottom: auto;
  border-radius: 14px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--fc-bg-raised);
  border: 1px solid var(--fc-border-strong);
  box-shadow: -8px 12px 40px rgba(15, 23, 42, 0.16);
  animation: rssAiFadeIn 0.2s ease;
}

.rss-ai-dock-resize {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 22px;
  height: 22px;
  padding: 0;
  margin: 0;
  border: none;
  background: transparent;
  cursor: nwse-resize;
  z-index: 6;
  touch-action: none;
  opacity: 0.55;
  border-bottom-right-radius: 12px;
}
.rss-ai-dock-resize:hover { opacity: 0.95; background: rgba(36,104,242,0.06); }
.rss-ai-dock-resize::after {
  content: '';
  display: block;
  position: absolute;
  right: 5px;
  bottom: 5px;
  width: 8px;
  height: 8px;
  border-right: 2px solid rgba(36,104,242,0.45);
  border-bottom: 2px solid rgba(36,104,242,0.45);
}

.rss-ai-dock-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 14px 12px;
  border-bottom: 1px solid var(--fc-border);
  flex-shrink: 0;
}
.rss-ai-dock-drag {
  flex: 1;
  min-width: 0;
  cursor: grab;
  user-select: none;
  touch-action: none;
  margin: -4px -6px -4px -6px;
  padding: 4px 6px;
  border-radius: 10px;
}
.rss-ai-dock-drag:active { cursor: grabbing; }
.rss-ai-dock-title { display: flex; gap: 10px; min-width: 0; align-items: flex-start; }
.rss-ai-dock-mark {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(145deg, #fff9e6 0%, #ffe8b8 100%);
  border: 1px solid rgba(234, 179, 8, 0.28);
}
.rss-ai-dock-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--fc-text);
}
.rss-ai-dock-sub {
  font-size: 11px;
  color: var(--fc-text-muted);
  margin-top: 4px;
  line-height: 1.45;
}
.rss-ai-dock-head-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
.rss-ai-dock-newchat {
  font-size: 12px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid rgba(36,104,242,0.25);
  background: var(--fc-primary-soft);
  color: var(--fc-primary);
  cursor: pointer;
  font-family: inherit;
  line-height: 1.2;
  white-space: nowrap;
}
.rss-ai-dock-newchat:hover {
  background: #dbeafe;
  border-color: rgba(36,104,242,0.4);
}
.rss-ai-dock-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #5a5a5e;
}
.rss-ai-dock-dot--connected { background: #4ade80; box-shadow: 0 0 8px rgba(74,222,128,0.45); }
.rss-ai-dock-dot--connecting { background: #c9a84c; animation: pulse 1.2s ease-in-out infinite; }
.rss-ai-dock-dot--error { background: #f87171; }

.rss-ai-dock-mini-btn {
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid rgba(248,113,113,0.35);
  background: rgba(248,113,113,0.1);
  color: #f87171;
  cursor: pointer;
  font-family: JetBrains Mono, monospace;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  line-height: 1.3;
}
.rss-ai-dock-mini-btn--primary {
  border-color: rgba(36,104,242,0.35);
  background: var(--fc-primary-soft);
  color: var(--fc-primary);
}

.rss-ai-dock-agentbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px 10px;
  border-bottom: 1px solid var(--fc-border);
  flex-shrink: 0;
}
.rss-ai-dock-agentbar-label {
  font-size: 11px;
  color: var(--fc-text-muted);
  font-family: JetBrains Mono, monospace;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}
.rss-ai-dock-agentbar-empty {
  flex: 1;
  font-size: 12px;
  color: var(--fc-text-muted);
}
.rss-ai-dock-select-trigger {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-family: JetBrains Mono, monospace;
  padding: 5px 8px;
  border-radius: 6px;
  border: 1px solid var(--fc-border-strong);
  background: var(--fc-bg-app);
  color: var(--fc-text);
}
.rss-ai-dock-select-trigger:focus-visible { border-color: rgba(36,104,242,0.45); }
.rss-ai-dock-close {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: var(--fc-bg-muted);
  color: var(--fc-text-secondary);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}
.rss-ai-dock-close:hover { background: var(--fc-bg-app); color: var(--fc-text); }

.rss-ai-chips {
  padding: 10px 12px;
  border-bottom: 1px solid var(--fc-border);
  flex-shrink: 0;
  max-height: 120px;
  overflow: auto;
}
.rss-ai-chips-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  font-family: JetBrains Mono, monospace;
  color: var(--fc-primary);
  margin-bottom: 8px;
}
.rss-ai-chips-clear {
  background: none;
  border: none;
  color: var(--fc-primary-hover);
  cursor: pointer;
  font-size: 11px;
  font-family: JetBrains Mono, monospace;
}
.rss-ai-chips-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.rss-ai-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  padding: 4px 8px 4px 10px;
  border-radius: 999px;
  background: var(--fc-primary-soft);
  border: 1px solid rgba(36,104,242,0.2);
  font-size: 11px;
  color: var(--fc-primary);
}
.rss-ai-chip-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.rss-ai-chip-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px; }
.rss-ai-chip-meta {
  font-size: 10px;
  color: #7a8a9a;
  font-family: JetBrains Mono, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 260px;
}
.rss-ai-chip-x {
  border: none;
  background: transparent;
  color: var(--fc-accent-blue-soft);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
}

.rss-ai-hint, .rss-ai-warn {
  padding: 8px 12px;
  font-size: 12px;
  flex-shrink: 0;
}
.rss-ai-hint { color: #fbbf24; background: rgba(251,191,36,0.08); }
.rss-ai-warn { color: #f87171; background: rgba(248,113,113,0.08); }

.rss-ai-dock-chat {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0 12px;
  overflow-y: auto;
  overflow-x: hidden;
}

.rss-ai-dock-inputwrap form {
  padding-left: 12px !important;
  padding-right: 12px !important;
  padding-bottom: 16px !important;
}
.rss-ai-dock-inputwrap .finclaw-input {
  border-radius: 18px !important;
}

@media (max-width: 480px) {
  .rss-ai-fab { width: 60px; height: 60px; }
  .rss-ai-fab-svg { width: 50px; height: 50px; }
}
`;
