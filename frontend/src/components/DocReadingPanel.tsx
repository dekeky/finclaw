import { useState, useEffect, useCallback, useRef } from 'react';
import { IconX, IconFileDescription, IconRefresh, IconLoader2, IconPencil, IconDeviceFloppy, IconList, IconDownload, IconLink } from '@tabler/icons-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MarkdownContent } from '@/components/MarkdownContent';
import { DocTocSidebar, DocTocOverlay } from '@/components/DocTocSidebar';
import { useTocHeadings } from '@/hooks/useTocHeadings';
import { useIsMobile } from '@/hooks/use-mobile';
import { getAgentDocFile, polishAgentDoc } from '@/api/agentDocs';
import { Button } from '@/components/ui/button';
import { AiPolishPromptPopover } from '@/components/AiPolishPromptPopover';
import {
  initialGenerateSteps,
  PersonaGenerateDialog,
  setGenerateStepStatus,
  type GenerateStep,
} from '@/components/PersonaGenerateDialog';
import { cn } from '@/lib/cn';
import { PRIMARY_BUTTON_CLASS } from '@/lib/primaryButton';
import { toast } from 'sonner';

/* ─── 浮窗布局工具 ─── */

type Vec2 = { left: number; top: number };
type DockRect = { left: number; top: number; width: number; height: number };

const DOCK_MIN_W = 480;
const DOCK_MIN_H = 400;
const DOCK_LS_KEY = 'finclaw.docDock.position';
const MOBILE_BREAKPOINT = 768;
/** 浮窗宽度低于此值时，目录改为浮层，避免挤压正文 */
const OVERLAY_TOC_BREAKPOINT = 900;

function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT;
}

function clampNum(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function fullscreenDockLayout(): DockRect {
  return {
    left: 0,
    top: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function docDockDefaultSize(): { width: number; height: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (isMobileViewport()) {
    return { width: vw, height: vh };
  }
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
  if (isMobileViewport()) {
    return fullscreenDockLayout();
  }
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
  border: 1px solid var(--border);
  background: var(--card);
  color: var(--card-foreground);
  box-shadow: 0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08);
  overflow: hidden;
  min-width: 0;
  max-width: 100vw;
  animation: docDockIn 0.2s ease-out;
}
.doc-dock-head {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  height: 42px;
  min-height: 42px;
  border-bottom: 1px solid var(--border);
  background: color-mix(in oklch, var(--muted) 60%, var(--card));
  user-select: none;
}
.doc-dock-head-left {
  min-width: 0;
  justify-self: start;
}
.doc-dock-head-center {
  justify-self: center;
  min-width: 0;
}
.doc-dock-head-right {
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 4px;
}
.doc-dock-drag {
  cursor: grab;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.doc-dock-drag:active { cursor: grabbing; }
.doc-dock-title {
  font-size: 13px; font-weight: 600;
  color: var(--foreground);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.doc-dock-close {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 6px;
  background: transparent; border: none; cursor: pointer;
  color: var(--muted-foreground); font-size: 16px;
  transition: background 0.12s, color 0.12s;
  flex-shrink: 0;
}
.doc-dock-close:hover {
  background: var(--muted);
  color: var(--foreground);
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
  border-right: 2px solid var(--border);
  border-bottom: 2px solid var(--border);
}

@keyframes docDockIn {
  from { opacity: 0; transform: scale(0.96) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes docDockFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* ─── 内容区 flex 容器 ─── */
.doc-dock-body {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
.doc-dock-scroll {
  min-width: 0;
  flex: 1;
  overflow: hidden;
}
.doc-dock-scroll [data-slot="scroll-area-viewport"] {
  overflow-x: hidden !important;
  max-width: 100%;
}
.doc-dock-scroll [data-slot="scroll-area-viewport"] > div {
  display: block !important;
  width: 100% !important;
  min-width: 0 !important;
  max-width: 100% !important;
  box-sizing: border-box;
  overflow-x: hidden;
}

/* ─── 目录侧边栏 ─── */
.doc-dock-toc-sidebar {
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  background: color-mix(in oklch, var(--muted) 40%, var(--card));
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.doc-dock-toc-inner {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.doc-dock-toc-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted-foreground);
  padding: 10px 8px 8px 14px;
  border-bottom: 1px solid var(--border);
}
.doc-dock-toc-collapse {
  display: flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 5px;
  background: transparent; border: none; cursor: pointer;
  color: var(--muted-foreground);
  flex-shrink: 0;
  transition: background 0.12s, color 0.12s;
}
.doc-dock-toc-collapse:hover {
  background: rgba(139,92,246,0.1);
  color: #7c3aed;
}

/* 收起态窄轨 */
.doc-dock-toc-rail {
  flex-shrink: 0;
  width: 34px;
  border-right: 1px solid var(--border);
  background: color-mix(in oklch, var(--muted) 40%, var(--card));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding-top: 6px;
}
.doc-dock-toc-expand {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 30px; border-radius: 6px;
  background: transparent; border: none; cursor: pointer;
  color: var(--muted-foreground);
  transition: background 0.12s, color 0.12s;
}
.doc-dock-toc-expand:hover {
  background: rgba(139,92,246,0.1);
  color: #7c3aed;
}
.doc-dock-toc-rail-label {
  writing-mode: vertical-rl;
  text-orientation: upright;
  font-size: 10px;
  letter-spacing: 0.15em;
  color: var(--muted-foreground);
  user-select: none;
}
.doc-dock-toc-item {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  border-left: 2px solid transparent;
  padding: 5px 12px 5px 12px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--muted-foreground);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.doc-dock-toc-item:hover {
  background: rgba(139,92,246,0.07);
  color: var(--foreground);
}
.doc-dock-toc-item--active {
  border-left-color: #8b5cf6;
  background: rgba(139,92,246,0.09);
  color: #7c3aed;
  font-weight: 600;
}

/* ─── 阅读区：舒适行宽 + 长词换行 ─── */
.doc-dock-article {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  margin-inline: auto;
  box-sizing: border-box;
}
.doc-reading-prose {
  max-width: 100%;
  min-width: 0;
  word-break: break-word;
  overflow-wrap: anywhere;
}
.doc-reading-prose :is(pre, table, img, video, iframe) {
  max-width: 100%;
}
.doc-reading-prose :is(.group\\/code, pre, .markdown-body > div) {
  max-width: 100%;
}
.doc-reading-prose .markdown-body {
  max-width: 100%;
  min-width: 0;
  overflow-x: hidden;
}
.doc-reading-prose :is(.group\\/code, table) {
  -webkit-overflow-scrolling: touch;
}

/* ─── 浮层目录：覆盖在正文上方，不占横向空间 ─── */
.doc-dock-toc-overlay {
  position: absolute;
  inset: 0;
  z-index: 6;
  pointer-events: none;
}
.doc-dock-toc-overlay--open {
  pointer-events: auto;
}
.doc-dock-toc-overlay-backdrop {
  position: absolute;
  inset: 0;
  border: none;
  background: rgba(0, 0, 0, 0.28);
  opacity: 0;
  transition: opacity 0.18s ease;
  cursor: default;
}
.doc-dock-toc-overlay--open .doc-dock-toc-overlay-backdrop {
  opacity: 1;
}
.doc-dock-toc-overlay-panel {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--card);
  border-right: 1px solid var(--border);
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.12);
  transform: translateX(-100%);
  transition: transform 0.2s ease;
}
.doc-dock-toc-overlay--open .doc-dock-toc-overlay-panel {
  transform: translateX(0);
}
.doc-dock-toc-trigger {
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: 6px;
  border: none;
  background: transparent;
  padding: 4px 8px;
  font-size: 12px;
  color: var(--muted-foreground);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  flex-shrink: 0;
}
.doc-dock-toc-trigger:hover {
  background: var(--muted);
  color: var(--foreground);
}

/* ─── 手机：全屏阅读，隐藏拖拽缩放 ─── */
@media (max-width: 767px) {
  .doc-dock-ai-bar--open {
    width: min(18rem, 72vw);
    max-width: 72vw;
  }
  .doc-dock--mobile {
    border-radius: 0;
    box-shadow: none;
    max-width: 100dvw;
  }
  .doc-dock--mobile .doc-dock-resize {
    display: none;
  }
  .doc-dock--mobile .doc-dock-drag {
    cursor: default;
  }
  .doc-dock--mobile .doc-dock-article {
    width: 100%;
    max-width: 100%;
    padding-inline: 12px;
    padding-block: 16px;
    overflow-x: hidden;
    box-sizing: border-box;
  }
  .doc-dock--mobile .doc-reading-prose {
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;
  }
  .doc-dock--mobile .doc-reading-prose :is(th, td) {
    padding-inline: 8px;
    padding-block: 6px;
  }
  .doc-dock--mobile .doc-reading-prose :is(.group\\/code pre, pre) {
    font-size: 12px;
  }
}

/* ─── 平板及以上：居中窄栏，利于长文阅读 ─── */
@media (min-width: 768px) {
  .doc-dock-article {
    max-width: 48rem;
    padding-inline: 24px;
    padding-block: 24px;
  }
}
@media (min-width: 1024px) {
  .doc-dock-article {
    max-width: 52rem;
    padding-inline: 32px;
    padding-block: 28px;
  }
}
@media (min-width: 1280px) {
  .doc-dock-article {
    max-width: 56rem;
  }
}
`;

/* ─── 主组件 ─── */

interface DocReadingPanelProps {
  agentName: string;
  filePath: string;
  onClose: () => void;
  /**
   * 自定义内容加载器，返回文件文本。默认读取 agent 的 docs/ 文件。
   * 用于复用本面板渲染其它来源的 Markdown（如 skills）。
   */
  loadContent?: (agentName: string, filePath: string) => Promise<string>;
  /** 提供则显示「编辑」按钮，保存时调用。 */
  onSave?: (content: string) => Promise<void>;
  /** 提供则显示「分享」按钮，点击时调用。 */
  onShare?: () => void;
  /** 文档目录侧边栏默认是否折叠（无本地记录时生效）。 */
  defaultTocCollapsed?: boolean;
  /** 目录折叠状态的 localStorage key。 */
  tocStorageKey?: string;
}

export function DocReadingPanel({
  agentName,
  filePath,
  onClose,
  loadContent,
  onSave,
  onShare,
  defaultTocCollapsed,
  tocStorageKey,
}: DocReadingPanelProps) {
  const isMobile = useIsMobile();
  const [tocOverlayOpen, setTocOverlayOpen] = useState(false);
  const [savedContent, setSavedContent] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 编辑态
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // AI 润色（与人设润色相同：结果仅写入本地 draft，保存后才持久化）
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [generatePhase, setGeneratePhase] = useState<'running' | 'success' | 'error'>('running');
  const [generateSteps, setGenerateSteps] = useState<GenerateStep[]>(() => initialGenerateSteps());
  const [generateModalPrompt, setGenerateModalPrompt] = useState('');

  // 用 ref 保存加载器，避免内联函数导致的重复加载
  const loadRef = useRef(loadContent);
  loadRef.current = loadContent;
  const runLoad = useCallback((a: string, f: string): Promise<string> => {
    const fn = loadRef.current ?? ((an: string, fp: string) => getAgentDocFile(an, fp).then((b) => b.content));
    return fn(a, f);
  }, []);

  // 浮窗位置（手机端全屏，桌面端记忆上次位置）
  const [dockLayout, setDockLayout] = useState<DockRect>(() =>
    isMobileViewport() ? fullscreenDockLayout() : (readStoredDock() ?? defaultDockLayout()),
  );
  const dockRef = useRef<HTMLElement | null>(null);
  const dockDragRef = useRef<{ pointerId: number; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const dockResizeRef = useRef<{ pointerId: number; sx: number; sy: number; orig: DockRect } | null>(null);
  const dockMovedRef = useRef(false);

  // TOC 侧边栏
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  // 文件路径变化时加载内容
  useEffect(() => {
    if (!agentName || !filePath) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSavedContent(null);
    setDraft('');
    setEditing(false);
    setSaveError(null);
    setAiPanelOpen(false);
    setAiPrompt('');
    setGenerateError(null);

    runLoad(agentName, filePath)
      .then((body) => {
        if (cancelled) return;
        setSavedContent(body);
        setDraft(body);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || '文件读取失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [agentName, filePath, runLoad]);

  // Escape：先关闭润色弹窗，再关闭文档浮窗
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (aiPanelOpen) {
        setAiPanelOpen(false);
        return;
      }
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, aiPanelOpen]);

  // 手机/桌面切换或视口变化时修正布局
  useEffect(() => {
    const onResize = () => {
      if (isMobileViewport()) {
        setDockLayout(fullscreenDockLayout());
        return;
      }
      setDockLayout((d) => fitDockRect(d));
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isMobile]);

  // 拖拽结束持久化（手机全屏不写入）
  const persistLayout = useCallback((next: DockRect) => {
    if (isMobileViewport()) return;
    writeStoredDock(next);
  }, []);

  // 重试加载
  const handleRetry = useCallback(() => {
    if (!agentName || !filePath) return;
    setLoading(true);
    setError(null);
    runLoad(agentName, filePath)
      .then((body) => {
        setSavedContent(body);
        setDraft(body);
      })
      .catch((err) => setError(err.message || '文件读取失败'))
      .finally(() => setLoading(false));
  }, [agentName, filePath, runLoad]);

  const dirty = onSave != null && savedContent !== null && draft !== savedContent;

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const startEdit = useCallback(() => {
    setSaveError(null);
    setAiPanelOpen(false);
    setEditing(true);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setSaveError(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (!onSave || !dirty) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(draft);
      setSavedContent(draft);
      setEditing(false);
      toast.success('保存成功');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }, [onSave, draft, dirty]);

  const handleUndo = useCallback(() => {
    if (savedContent == null) return;
    setDraft(savedContent);
    setEditing(false);
    setSaveError(null);
  }, [savedContent]);

  const handlePolish = useCallback(async () => {
    const prompt = aiPrompt.trim();
    if (!prompt || generating) return;

    setAiPanelOpen(false);
    setGenerating(true);
    setGenerateError(null);
    setGenerateModalOpen(true);
    setGeneratePhase('running');
    setGenerateModalPrompt(prompt);
    setGenerateSteps(setGenerateStepStatus(initialGenerateSteps(), 'validate', []));

    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    try {
      await sleep(200);
      setGenerateSteps(setGenerateStepStatus(initialGenerateSteps(), 'call', ['validate']));

      const { content: polished } = await polishAgentDoc(agentName, {
        prompt,
        current_content: draft,
      });

      setGenerateSteps(setGenerateStepStatus(initialGenerateSteps(), 'finalize', ['validate', 'call']));
      await sleep(150);
      setDraft(polished);
      setGenerateSteps(setGenerateStepStatus(initialGenerateSteps(), null, ['validate', 'call', 'finalize']));
      setGeneratePhase('success');
      await sleep(700);
      setGenerateModalOpen(false);
      setAiPanelOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : '润色失败';
      setGenerateError(message);
      setGenerateSteps(setGenerateStepStatus(initialGenerateSteps(), null, ['validate'], 'call'));
      setGeneratePhase('error');
      await sleep(2200);
      setGenerateModalOpen(false);
    } finally {
      setGenerating(false);
    }
  }, [agentName, aiPrompt, draft, generating]);

  const fileName = filePath.split('/').pop() ?? filePath;
  const isMd = isMarkdown(fileName);

  const handleDownload = useCallback(() => {
    if (savedContent === null) return;
    const mime = isMd ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8';
    const blob = new Blob([draft], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [draft, fileName, isMd, savedContent]);

  // TOC hook（编辑态下隐藏目录）
  const { headings, activeId, scrollToHeading } = useTocHeadings(
    scrollAreaRef,
    editing ? null : draft,
    isMd,
  );

  const showToc = isMd && !loading && !error && savedContent != null && headings.length > 0;
  const useOverlayToc = showToc && (isMobile || dockLayout.width < OVERLAY_TOC_BREAKPOINT);
  const showAiPolish = isMd && !loading && !error && savedContent !== null && !editing;

  // 切换为侧边栏模式时关闭浮层
  useEffect(() => {
    if (!useOverlayToc) setTocOverlayOpen(false);
  }, [useOverlayToc]);

  return (
    <>
      <style>{DOC_DOCK_CSS}</style>
      <PersonaGenerateDialog
        open={generateModalOpen}
        title={`AI 润色 ${fileName}`}
        description="正在根据你的描述润色文档…"
        prompt={generateModalPrompt}
        steps={generateSteps}
        error={generateError}
        phase={generatePhase}
      />

      {/* 半透明遮罩 */}
      <button type="button" className="doc-dock-backdrop" aria-label="关闭文档" onClick={onClose} />

      {/* 浮窗主体 */}
      <aside
        ref={dockRef}
        className={cn('doc-dock', isMobile && 'doc-dock--mobile')}
        style={{
          left: dockLayout.left,
          top: dockLayout.top,
          width: dockLayout.width,
          height: dockLayout.height,
        }}
        aria-label={`文档: ${fileName}`}
      >
        {/* 标题栏：左文件名 · 中 AI 润色 · 右操作 */}
        <div className="doc-dock-head">
          <div className="doc-dock-head-left">
          <div
            className="doc-dock-drag"
            role="presentation"
            title="拖拽移动浮窗 · 右下角可调整大小"
            onPointerDown={(e) => {
              if (isMobile) return;
              if (e.button !== 0) return;
              if ((e.target as HTMLElement).closest('button, input')) return;
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
            <span className="doc-dock-title">
              {fileName}
              {dirty && <span className="ml-1 text-violet-600">•</span>}
            </span>
          </div>
          </div>

          <div className="doc-dock-head-center">
            {showAiPolish && (
              <AiPolishPromptPopover
                open={aiPanelOpen}
                onOpenChange={setAiPanelOpen}
                prompt={aiPrompt}
                onPromptChange={setAiPrompt}
                onSubmit={() => void handlePolish()}
                submitting={generating}
                disabled={saving}
                side="bottom"
                align="center"
              />
            )}
          </div>

          <div className="doc-dock-head-right">
            {useOverlayToc && (
              <button
                type="button"
                className="doc-dock-toc-trigger"
                onClick={() => setTocOverlayOpen(true)}
                title="打开目录"
                aria-label="打开目录"
              >
                <IconList className="size-3.5" />
                目录
              </button>
            )}
            {!loading && !error && savedContent !== null && onShare && (
              <button
                type="button"
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={onShare}
                title="复制分享链接"
                aria-label="复制分享链接"
              >
                <IconLink className="size-3.5" />
              </button>
            )}
            {!loading && !error && savedContent !== null && (
              <button
                type="button"
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={handleDownload}
                title="下载"
                aria-label="下载文档"
              >
                <IconDownload className="size-3.5" />
              </button>
            )}
            {onSave && !loading && !error && savedContent !== null && (
              editing ? (
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  onClick={cancelEdit}
                  disabled={saving || generating}
                >
                  完成编辑
                </button>
              ) : (
                <button
                  type="button"
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                  onClick={startEdit}
                  title="编辑"
                  aria-label="编辑文档"
                  disabled={generating}
                >
                  <IconPencil className="size-3.5" />
                </button>
              )
            )}
            <button type="button" className="doc-dock-close" onClick={onClose} aria-label="关闭">
              <IconX className="size-4" />
            </button>
          </div>
        </div>

        {/* 内容区 */}
        <div className="doc-dock-body flex min-h-0 min-w-0 flex-col">
          {editing ? (
            <div className="flex min-h-0 flex-1 flex-col p-3">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                spellCheck={false}
                disabled={saving || generating}
                className="min-h-0 flex-1 w-full resize-none rounded-md border border-border/60 bg-background p-3 font-mono text-[13px] leading-relaxed text-foreground outline-none focus:border-violet-500/60"
                placeholder="输入文件内容…"
              />
            </div>
          ) : (
          <div className="flex min-h-0 min-w-0 flex-1">
          {showToc && !useOverlayToc && (
            <DocTocSidebar
              headings={headings}
              activeId={activeId}
              onHeadingClick={scrollToHeading}
              defaultCollapsed={defaultTocCollapsed}
              storageKey={tocStorageKey}
            />
          )}
          {useOverlayToc && (
            <DocTocOverlay
              open={tocOverlayOpen}
              onOpenChange={setTocOverlayOpen}
              headings={headings}
              activeId={activeId}
              onHeadingClick={scrollToHeading}
            />
          )}
          <ScrollArea ref={scrollAreaRef} className="doc-dock-scroll min-h-0 min-w-0 flex-1">
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
            ) : savedContent === null ? (
              <div className="px-8 py-16 text-center text-sm text-muted-foreground">
                文件内容为空
              </div>
            ) : isMd ? (
              <div className="doc-dock-article">
                <MarkdownContent
                  copyableCode
                  size={isMobile ? 'sm' : 'md'}
                  className="doc-reading-prose"
                >
                  {draft}
                </MarkdownContent>
              </div>
            ) : (
              <pre className="doc-dock-article overflow-x-auto text-sm leading-relaxed whitespace-pre-wrap break-words font-mono text-foreground/90">
                {draft}
              </pre>
            )}
          </ScrollArea>
          </div>
          )}

          {onSave && !loading && !error && savedContent !== null && (
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/40 px-3 py-2">
              {saveError && (
                <span className="mr-auto max-w-[50%] truncate text-[11px] text-destructive" title={saveError}>
                  {saveError}
                </span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!dirty || saving || generating}
                onClick={handleUndo}
              >
                撤销
              </Button>
              <Button
                type="button"
                size="sm"
                className={PRIMARY_BUTTON_CLASS}
                disabled={!dirty || saving || generating}
                onClick={() => void handleSave()}
              >
                {saving ? (
                  <>
                    <IconLoader2 className="mr-1 size-3.5 animate-spin" />
                    保存中…
                  </>
                ) : (
                  <>
                    <IconDeviceFloppy className="mr-1 size-3.5" />
                    保存
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* 右下角 resize 手柄 */}
        <div
          className="doc-dock-resize"
          role="presentation"
          onPointerDown={(e) => {
            if (isMobile) return;
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
