import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconAlertTriangle, IconBuildingStore, IconChevronsRight, IconMessagePlus, IconX } from '@tabler/icons-react';
import { BacktestMentionHints } from '@/components/BacktestMentionHints';
import { ChatComposerToolbar } from '@/components/chrome/ChatComposerToolbar';
import { ChatContainer } from '@/components/ChatContainer';
import { ChatSlashHints, handleSlashInputKeyDown } from '@/components/ChatSlashHints';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { listBacktestRuns, runDisplayName } from '@/api/backtest';
import { buildAgentWsUrl } from '@/lib/agentWsUrl';
import { runBelongsToStrategy } from '@/lib/backtestStrategy';
import {
  filterMentionRuns,
  findBacktestMention,
  mentionableBacktests,
  mentionKey,
  removeBacktestMention,
  type MentionRun,
} from '@/lib/backtestMention';
import { findStrategyFileTouchInTurn, turnHasUserMessage } from '@/lib/strategyFileDetect';
import {
  buildStrategyAgentPrompt,
  type BacktestAnalysisTarget,
  type StrategyPlatform,
} from '@/lib/strategyPlatforms';
import { TOOLBAR_ICON_BUTTON_CLASS } from '@/lib/toolbarButton';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useAuth } from '@/state/auth';
import { useAgents } from '@/state/agents';
import { cn } from '@/lib/cn';

const STRATEGY_QUICK_PROMPTS = [
  '帮我写一个双均线金叉死叉策略',
  '生成一个基于 RSI 的超买超卖策略',
  '为当前策略增加止损与仓位管理',
  '解释策略逻辑并给出改进建议',
];

interface StrategyChatPanelProps {
  platform: StrategyPlatform;
  strategyPath?: string | null;
  strategyId?: string | null;
  strategyName?: string | null;
  strategyReady: boolean;
  analysisRun?: BacktestAnalysisTarget | null;
  analysisFocus?: number;
  onClearAnalysisRun?: () => void;
  onSelectAnalysisRun?: (target: BacktestAnalysisTarget) => void;
  onStrategyFileChanged?: (agentName: string) => void;
  onCollapse?: () => void;
  className?: string;
}

export function StrategyChatPanel({
  platform,
  strategyPath,
  strategyId,
  strategyName,
  strategyReady,
  analysisRun,
  analysisFocus = 0,
  onClearAnalysisRun,
  onSelectAnalysisRun,
  onStrategyFileChanged,
  onCollapse,
  className,
}: StrategyChatPanelProps) {
  const { user } = useAuth();
  const { requireAuth } = useRequireAuth();
  const { agents, currentAgent, status: agentsLoadStatus } = useAgents();
  const wsUrl = useMemo(
    () => (user && currentAgent ? buildAgentWsUrl(currentAgent) : null),
    [user, currentAgent],
  );
  const persistKey = currentAgent ? `backtest:${currentAgent}` : null;
  const {
    messages,
    status,
    isTyping,
    sendError,
    send,
    interrupt,
    clearMessages,
    reconnect,
    taskStartedAt,
  } = useWebSocket(wsUrl, { persistAgentKey: persistKey });

  const [value, setValue] = useState('');
  const [cursor, setCursor] = useState(0);
  const [mentionRuns, setMentionRuns] = useState<MentionRun[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [mentionError, setMentionError] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [dismissedMention, setDismissedMention] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastPulledTouchRef = useRef<string | null>(null);
  const wasTypingRef = useRef(false);

  const buildMessage = useCallback(
    (text: string) => buildStrategyAgentPrompt(platform, text, {
      strategyPath: strategyPath ?? undefined,
      analysisRun,
    }),
    [platform, strategyPath, analysisRun],
  );

  useEffect(() => {
    if (!analysisRun || analysisFocus === 0) return;
    inputRef.current?.focus();
  }, [analysisFocus, analysisRun]);

  const mention = platform === 'finclaw' && onSelectAnalysisRun
    ? findBacktestMention(value, cursor)
    : null;
  const mentionOpen = Boolean(mention && dismissedMention !== mentionKey(mention));
  const filteredMentions = useMemo(
    () => (mentionOpen && mention ? filterMentionRuns(mentionRuns, mention.query) : []),
    [mentionOpen, mention, mentionRuns],
  );

  useEffect(() => {
    setMentionIndex(0);
  }, [mention?.start, mention?.query]);

  useEffect(() => {
    setMentionRuns([]);
    setMentionError(false);
  }, [strategyId, strategyName]);

  useEffect(() => {
    if (!mentionOpen || !strategyName) return;
    let cancelled = false;
    setMentionLoading(true);
    setMentionError(false);
    listBacktestRuns()
      .then((list) => {
        if (cancelled) return;
        const scoped = list.filter((item) => runBelongsToStrategy(item, { id: strategyId, name: strategyName }));
        setMentionRuns(mentionableBacktests(scoped, runDisplayName));
      })
      .catch(() => {
        if (!cancelled) {
          setMentionRuns([]);
          setMentionError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setMentionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mentionOpen, strategyId, strategyName]);

  const selectMention = useCallback((run: MentionRun) => {
    const active = findBacktestMention(value, cursor);
    onSelectAnalysisRun?.({ id: run.id, name: run.name, status: run.status });
    if (!active) return;
    const next = removeBacktestMention(value, active);
    setValue(next.value);
    setCursor(next.cursor);
    setDismissedMention(null);
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(next.cursor, next.cursor);
    });
  }, [cursor, onSelectAnalysisRun, value]);

  const syncCursor = (element: HTMLTextAreaElement) => {
    setCursor(element.selectionStart ?? element.value.length);
  };

  const handleSend = useCallback(
    (text: string) => {
      if (!requireAuth()) return;
      if (status !== 'connected' || !strategyReady) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      const content = buildMessage(trimmed);
      lastPulledTouchRef.current = null;
      send(content, undefined, { displayContent: trimmed });
      setValue('');
      setCursor(0);
    },
    [requireAuth, status, strategyReady, buildMessage, send],
  );

  const handleInterrupt = useCallback(() => {
    if (!requireAuth()) return;
    if (status !== 'connected') return;
    interrupt();
  }, [requireAuth, status, interrupt]);

  const handleNewChat = useCallback(() => {
    if (!requireAuth()) return;
    lastPulledTouchRef.current = null;
    clearMessages({ startNewSession: true });
  }, [requireAuth, clearMessages]);

  const tryPullStrategyUpdate = useCallback(() => {
    if (!currentAgent || !strategyReady || !onStrategyFileChanged) return;

    const touch = findStrategyFileTouchInTurn(messages, strategyPath);
    if (!touch) return;

    const touchKey = `${touch.id}:${touch.content.length}`;
    if (lastPulledTouchRef.current === touchKey) return;

    lastPulledTouchRef.current = touchKey;
    onStrategyFileChanged(currentAgent);
  }, [currentAgent, strategyReady, onStrategyFileChanged, messages, strategyPath]);

  useEffect(() => {
    tryPullStrategyUpdate();
  }, [tryPullStrategyUpdate]);

  useEffect(() => {
    const wasTyping = wasTypingRef.current;
    wasTypingRef.current = isTyping;
    if (!wasTyping || isTyping || !strategyReady || !currentAgent || !onStrategyFileChanged) return;
    if (!turnHasUserMessage(messages)) return;
    onStrategyFileChanged(currentAgent);
  }, [isTyping, strategyReady, currentAgent, onStrategyFileChanged, messages]);

  useEffect(() => {
    lastPulledTouchRef.current = null;
  }, [strategyPath]);

  const noAgents = agents.length === 0 && agentsLoadStatus === 'ready';

  return (
    <div className={cn('flex min-h-0 flex-col border-l border-border/50 bg-[#f7f7f8] dark:bg-background', className)}>
      <div className="flex shrink-0 items-center justify-end gap-1 border-b border-border/50 px-3 py-2">
        {currentAgent && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={TOOLBAR_ICON_BUTTON_CLASS}
                aria-label="新对话"
                onClick={handleNewChat}
              >
                <IconMessagePlus className="size-[18px]" stroke={1.75} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">新对话</TooltipContent>
          </Tooltip>
        )}
        {onCollapse ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={TOOLBAR_ICON_BUTTON_CLASS}
                aria-label="收起 AI"
                onClick={onCollapse}
              >
                <IconChevronsRight className="size-[18px]" stroke={1.75} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">收起 AI</TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      {sendError && (
        <div className="mx-3 mt-2 flex items-center justify-between gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
          <span className="flex items-center gap-1.5 text-xs text-destructive">
            <IconAlertTriangle size={14} />
            {sendError}
          </span>
          <Button variant="outline" size="sm" onClick={reconnect} className="h-7 text-xs">
            重连
          </Button>
        </div>
      )}

      {!currentAgent ? (
        <>
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            {agentsLoadStatus === 'loading' ? (
              <p className="text-sm text-muted-foreground">正在加载 Agent…</p>
            ) : noAgents ? (
              <>
                <div className="flex size-12 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-600 dark:text-violet-300">
                  <IconBuildingStore size={24} stroke={1.5} />
                </div>
                <p className="text-sm text-foreground/90">还没有 Agent</p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  创建 Agent 后即可通过对话智能生成量化策略脚本。
                </p>
                <Button asChild size="sm">
                  <Link to="/agents" state={{ showMarket: true }}>前往 Agent 市场</Link>
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">请从下方输入框选择 Agent</p>
            )}
          </div>
          <div className="shrink-0 border-t border-border/40 p-3">
            <div className="rounded-xl border border-border/60 bg-card px-2 pt-2 pb-1.5 shadow-sm">
              <textarea
                className="min-h-9 w-full resize-none bg-transparent px-1.5 py-1.5 text-sm leading-normal text-foreground outline-none placeholder:text-muted-foreground"
                placeholder={noAgents ? '请前往 Agent 市场创建 Agent…' : '请先选择 Agent…'}
                rows={2}
                disabled
              />
              <div className="flex items-center gap-1 pt-0.5">
                <ChatComposerToolbar />
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            <ErrorBoundary>
              <ChatContainer
                messages={messages}
                isTyping={isTyping}
                onClear={handleNewChat}
                agentName={currentAgent}
                variant="dock"
                onQuickPrompt={handleSend}
                quickPrompts={STRATEGY_QUICK_PROMPTS}
                dockTitle="智能生成策略"
                dockDescription="描述量化思路，Agent 将直接修改左侧当前策略文件。"
                taskStartedAt={taskStartedAt}
                onInterrupt={handleInterrupt}
              />
            </ErrorBoundary>
          </div>

          <div className="shrink-0 border-t border-border/40 p-3">
            {!strategyReady && (
              <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">
                请先保存策略后再使用 AI 生成。
              </p>
            )}
            {status !== 'connected' && status !== 'idle' && (
              <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="inline-block size-1.5 animate-pulse rounded-full bg-amber-500" />
                {status === 'connecting' ? '正在连接聊天服务…' : '连接已断开，正在自动重连…'}
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (mentionOpen && filteredMentions.length > 0) {
                  const pick = filteredMentions[Math.min(mentionIndex, filteredMentions.length - 1)];
                  if (pick) selectMention(pick);
                  return;
                }
                handleSend(value);
              }}
            >
              <div className="relative rounded-xl border border-border/60 bg-card px-2 pt-2 pb-1.5 shadow-sm">
                {analysisRun ? (
                  <div className="mb-1 flex items-center gap-1 px-1">
                    <span className="inline-flex min-w-0 items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[11px] text-violet-700 dark:text-violet-300">
                      <span className="truncate">定向分析 · {analysisRun.name}</span>
                      <button
                        type="button"
                        className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full text-violet-700/80 hover:bg-violet-500/15 hover:text-violet-800 dark:text-violet-200"
                        aria-label="移出对话"
                        onClick={onClearAnalysisRun}
                      >
                        <IconX className="size-3" stroke={2} />
                      </button>
                    </span>
                  </div>
                ) : null}
                {mentionOpen && mention ? (
                  <BacktestMentionHints
                    runs={filteredMentions}
                    activeIndex={mentionIndex}
                    loading={mentionLoading}
                    error={mentionError}
                    query={mention.query}
                    onPick={selectMention}
                  />
                ) : (
                  <ChatSlashHints value={value} onPick={(command) => setValue(command)} />
                )}
                <textarea
                  ref={inputRef}
                  className="min-h-9 w-full resize-none bg-transparent px-1.5 py-1.5 text-sm leading-normal text-foreground outline-none placeholder:text-muted-foreground"
                  placeholder={
                    !strategyReady
                      ? '请先保存策略…'
                      : analysisRun
                        ? '针对这次回测提问，例如：分析收益、回撤和交易'
                        : platform === 'finclaw'
                          ? '输入@可选择回测记录'
                          : '描述你想要的量化策略…'
                  }
                  rows={2}
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    syncCursor(e.target);
                  }}
                  onClick={(e) => syncCursor(e.currentTarget)}
                  onKeyUp={(e) => syncCursor(e.currentTarget)}
                  onSelect={(e) => syncCursor(e.currentTarget)}
                  disabled={status !== 'connected' || !strategyReady}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return;
                    if (mentionOpen && mention) {
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setDismissedMention(mentionKey(mention));
                        return;
                      }
                      if (filteredMentions.length > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                        e.preventDefault();
                        const count = filteredMentions.length;
                        setMentionIndex((index) => {
                          const current = ((index % count) + count) % count;
                          return e.key === 'ArrowDown' ? (current + 1) % count : (current - 1 + count) % count;
                        });
                        return;
                      }
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (filteredMentions.length > 0) {
                          const pick = filteredMentions[Math.min(mentionIndex, filteredMentions.length - 1)];
                          if (pick) selectMention(pick);
                        }
                        return;
                      }
                      if (e.key === 'Tab' && filteredMentions.length > 0) {
                        e.preventDefault();
                        const pick = filteredMentions[Math.min(mentionIndex, filteredMentions.length - 1)];
                        if (pick) selectMention(pick);
                        return;
                      }
                    }
                    handleSlashInputKeyDown(e, value, {
                      onAutocomplete: (command) => setValue(command),
                      onSend: () => handleSend(value),
                    });
                  }}
                />
                <div className="flex items-center gap-1 pt-0.5">
                  <ChatComposerToolbar />
                  <button
                    type="submit"
                    className="ml-auto flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-500 text-white transition-all hover:bg-violet-600 active:scale-95 disabled:opacity-50"
                    disabled={status !== 'connected' || !strategyReady || !value.trim()}
                    aria-label="发送"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
