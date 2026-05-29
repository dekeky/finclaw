import { useState, useEffect, useCallback, useRef } from 'react';
import { IconX, IconFileDescription, IconRefresh, IconLoader2 } from '@tabler/icons-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MarkdownContent } from '@/components/MarkdownContent';
import { getAgentDocFile } from '@/api/agentDocs';
import { cn } from '@/lib/cn';

/* ─── 浮窗布局工具 ─── */

type Vec2 = { left: number; top: number };
type DockRect = { left: number; top: number; width: number; height: number };

const DOCK_MIN_W = 480;
const DOCK_MIN_H = 400;
const DOCK_LS_KEY = 'finclaw.docDock.position';

function clampNum(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function docDockDefaultSize(): { width: number; height: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pad = 24;
  // 默认约占视口 85% 宽，80% 高
  const w = Math.round(vw * 0.85);
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

function defaultDockLayout(): DockRect {
  const { width, height } = docDockDefaultSize();
  const left = Math.round((window.innerWidth - width) / 2);
  const top = Math.round((window.innerHeight - height) / 2);
  return fitDockRect({ left, top, width, height });
}

function migrateStoredDock(raw: unknown): DockRect | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.left !== 'number' || typeof o.top !== 'number') return null;
  const defs = docDockDefaultSize();
  const width = typeof o.width === 'number' ? o.width : defs.width;
  const height = typeof o.height === 'number' ? o.height : defs.height;
  return fitDockRect({ left: o.left, top: o.top, width, height });
}

function readStoredDock(): DockRect | null {
  try {
    const raw = localStorage.getItem(DOCK_LS_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as { dock?: unknown };
    return j.dock != null ? migrateStoredDock(j.dock) : null;
  } catch {
    return null;
  }
}

function writeStoredDock(dock: DockRect | null) {
  try {
    localStorage.setItem(DOCK_LS_KEY, JSON.stringify({ dock }));
  } catch {
    // ignore quota
  }
}

function clampDims(L: number, T: number, w: number, h: number, pad = 8): Vec2 {
  const maxL = Math.max(pad, window.innerWidth - w - pad);
  const maxT = Math.max(pad, window.innerHeight - h - pad);
  return {
    left: Math.min(maxL, Math.max(pad, L)),
    top: Math.min(maxT, Math.max(pad, T)),
  };
}

function isMarkdown(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown');
}

/* ─── 浮窗样式 ─── */

const DOC_DOCK_CSS = `
.doc-dock-backdrop {
  position: fixed; inset: 0; z-index: 1090;
  background: rgba(0,0,0,0.3);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  animation: docDockFadeIn 0.15s ease-out;
}
.doc-dock {
  position: fixed; z-index: 1100;
  display: flex; flex-direction: column;
  border-radius: 12px;
  border: 1px solid var(--fc-border-strong, rgba(120,120,140,0.25));
  background: var(--fc-bg-raised, #fff);
  box-shadow: 0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08);
  overflow: hidden;
  animation: docDockIn 0.2s ease-out;
}
.doc-dock-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 12px; height: 42px; min-height: 42px;
  border-bottom: 1px solid var(--fc-border-strong, rgba(120,120,140,0.15));
  background: var(--fc-bg-raised, #fafafa);
  user-select: none;
}
.doc-dock-drag {
  flex: 1; cursor: grab; display: flex; align-items: center; gap: 8px;
  min-width: 0;
}
.doc-dock-drag:active { cursor: grabbing; }
.doc-dock-title {
  font-size: 13px; font-weight: 600;
  color: var(--fc-text, #1a1a2e);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.doc-dock-close {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 6px;
  background: transparent; border: none; cursor: pointer;
  color: var(--fc-text, #666); font-size: 16px;
  transition: background 0.12s, color 0.12s;
  flex-shrink: 0;
}
.doc-dock-close:hover {
  background: var(--fc-border-strong, rgba(120,120,140,0.15));
  color: var(--fc-text, #222);
}
.doc-dock-resize {
  position: absolute; right: 0; bottom: 0;
  width: 18px; height: 18px;
  cursor: nwse-resize;
  z-index: 2;
}
.doc-dock-resize::after {
  content: '';
  position: absolute; right: 4px; bottom: 4px;
  width: 8px; height: 8px;
  border-right: 2px solid rgba(120,120,140,0.35);
  border-bottom: 2px solid rgba(120,120,140,0.35);
}

@keyframes docDockIn {
  from { opacity: 0; transform: scale(0.96) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes docDockFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
`;

/* ─── 主组件 ─── */

interface DocReadingPanelProps {
  agentName: string;
  filePath: string;
  onClose: () => void;
}

export function DocReadingPanel({ agentName, filePath, onClose }: DocReadingPanelProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 浮窗位置
  const [dockLayout, setDockLayout] = useState<DockRect>(() => readStoredDock() ?? defaultDockLayout());
  const dockRef = useRef<HTMLElement | null>(null);
  const dockDragRef = useRef<{ pointerId: number; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const dockResizeRef = useRef<{ pointerId: number; sx: number; sy: number; orig: DockRect } | null>(null);
  const dockMovedRef = useRef(false);

  // 文件路径变化时加载内容
  useEffect(() => {
    if (!agentName || !filePath) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContent(null);

    getAgentDocFile(agentName, filePath)
      .then((body) => {
        if (cancelled) return;
        setContent(body.content);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || '文件读取失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [agentName, filePath]);

  // Escape 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 视口 resize 时修正位置
  useEffect(() => {
    const onResize = () => {
      setDockLayout((d) => fitDockRect(d));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 拖拽结束持久化
  const persistLayout = useCallback((next: DockRect) => {
    writeStoredDock(next);
  }, []);

  // 重试加载
  const handleRetry = useCallback(() => {
    if (!agentName || !filePath) return;
    setLoading(true);
    setError(null);
    getAgentDocFile(agentName, filePath)
      .then((body) => setContent(body.content))
      .catch((err) => setError(err.message || '文件读取失败'))
      .finally(() => setLoading(false));
  }, [agentName, filePath]);

  const fileName = filePath.split('/').pop() ?? filePath;
  const isMd = isMarkdown(fileName);

  return (
    <>
      <style>{DOC_DOCK_CSS}</style>

      {/* 半透明遮罩 */}
      <button type="button" className="doc-dock-backdrop" aria-label="关闭文档" onClick={onClose} />

      {/* 浮窗主体 */}
      <aside
        ref={dockRef}
        className="doc-dock"
        style={{
          left: dockLayout.left,
          top: dockLayout.top,
          width: dockLayout.width,
          height: dockLayout.height,
        }}
        aria-label={`文档: ${fileName}`}
      >
        {/* 标题栏 - 可拖拽 */}
        <div className="doc-dock-head">
          <div
            className="doc-dock-drag"
            role="presentation"
            title="拖拽移动浮窗 · 右下角可调整大小"
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              if ((e.target as HTMLElement).closest('button')) return;
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              dockMovedRef.current = false;
              dockDragRef.current = {
                pointerId: e.pointerId,
                sx: e.clientX,
                sy: e.clientY,
                ox: dockLayout.left,
                oy: dockLayout.top,
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
              try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
              dockDragRef.current = null;
              if (dockMovedRef.current && dockRef.current) {
                const r = dockRef.current.getBoundingClientRect();
                const next = fitDockRect({ left: r.left, top: r.top, width: r.width, height: r.height });
                setDockLayout(next);
                persistLayout(next);
              }
              dockMovedRef.current = false;
            }}
            onPointerCancel={(e) => {
              dockDragRef.current = null;
              dockMovedRef.current = false;
              try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
            }}
          >
            <IconFileDescription className={cn('size-4 shrink-0', isMd ? 'text-violet-500/70' : 'text-muted-foreground')} />
            <span className="doc-dock-title">{fileName}</span>
          </div>

          <button type="button" className="doc-dock-close" onClick={onClose} aria-label="关闭">
            <IconX className="size-4" />
          </button>
        </div>

        {/* 内容区 */}
        <ScrollArea className="min-h-0 flex-1">
          {loading ? (
            <div className="flex flex-col items-center gap-2 px-8 py-16 text-center">
              <IconLoader2 className="size-5 animate-spin text-muted-foreground/50" />
              <span className="text-xs text-muted-foreground">加载文档中...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 px-8 py-16 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-violet-500 hover:underline"
                onClick={handleRetry}
              >
                <IconRefresh className="size-3" />
                重试
              </button>
            </div>
          ) : content === null ? (
            <div className="px-8 py-16 text-center text-sm text-muted-foreground">
              文件内容为空
            </div>
          ) : isMd ? (
            <div className="mx-auto max-w-4xl px-8 py-6">
              <MarkdownContent copyableCode>{content}</MarkdownContent>
            </div>
          ) : (
            <pre className="overflow-x-auto px-8 py-6 text-sm leading-relaxed whitespace-pre-wrap break-all font-mono text-foreground/90">
              {content}
            </pre>
          )}
        </ScrollArea>

        {/* 右下角 resize 手柄 */}
        <div
          className="doc-dock-resize"
          role="presentation"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            dockResizeRef.current = {
              pointerId: e.pointerId,
              sx: e.clientX,
              sy: e.clientY,
              orig: { ...dockLayout },
            };
          }}
          onPointerMove={(e) => {
            if (!dockResizeRef.current || e.pointerId !== dockResizeRef.current.pointerId) return;
            const { sx, sy, orig } = dockResizeRef.current;
            const dx = e.clientX - sx;
            const dy = e.clientY - sy;
            setDockLayout((prev) => {
              if (!prev) return prev;
              return fitDockRect({
                left: orig.left,
                top: orig.top,
                width: Math.max(DOCK_MIN_W, orig.width + dx),
                height: Math.max(DOCK_MIN_H, orig.height + dy),
              });
            });
          }}
          onPointerUp={(e) => {
            if (!dockResizeRef.current || e.pointerId !== dockResizeRef.current.pointerId) return;
            try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
            dockResizeRef.current = null;
            if (dockRef.current) {
              const r = dockRef.current.getBoundingClientRect();
              const next = fitDockRect({ left: r.left, top: r.top, width: r.width, height: r.height });
              setDockLayout(next);
              persistLayout(next);
            }
          }}
          onPointerCancel={(e) => {
            dockResizeRef.current = null;
            try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
          }}
        />
      </aside>
    </>
  );
}
