import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconAlertTriangle, IconBuildingStore, IconMessagePlus } from '@tabler/icons-react';
import { ChatMainToolbar } from '@/components/chrome/ChatMainToolbar';
import { ChatContainer } from '@/components/ChatContainer';
import { ChatSlashHints, handleSlashInputKeyDown } from '@/components/ChatSlashHints';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { syncStrategyToAgent } from '@/api/strategies';
import { buildAgentWsUrl } from '@/lib/agentWsUrl';
import { findStrategyFileTouchInTurn, turnHasUserMessage } from '@/lib/strategyFileDetect';
import {
  buildStrategyAgentPrompt,
  type StrategyPlatform,
} from '@/lib/strategyPlatforms';
import { TOOLBAR_ICON_BUTTON_CLASS } from '@/lib/toolbarButton';
import { useWebSocket } from '@/hooks/useWebSocket';
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
  strategyName?: string | null;
  strategyPath?: string | null;
  strategyReady: boolean;
  onStrategyFileChanged?: (agentName: string) => void;
  className?: string;
}

export function StrategyChatPanel({
  platform,
  strategyName,
  strategyPath,
  strategyReady,
  onStrategyFileChanged,
  className,
}: StrategyChatPanelProps) {
  const { agents, currentAgent, status: agentsLoadStatus } = useAgents();
  const wsUrl = useMemo(() => buildAgentWsUrl(currentAgent), [currentAgent]);
  const persistKey = currentAgent ? `backtest:${currentAgent}` : null;
  const {
    messages,
    status,
    isTyping,
    sendError,
    send,
    clearMessages,
    reconnect,
    taskStartedAt,
  } = useWebSocket(wsUrl, { persistAgentKey: persistKey });

  const [value, setValue] = useState('');
  const lastPulledTouchRef = useRef<string | null>(null);
  const wasTypingRef = useRef(false);

  const buildMessage = useCallback(
    (text: string) => buildStrategyAgentPrompt(platform, text, {
      strategyPath: strategyPath ?? undefined,
    }),
    [platform, strategyPath],
  );

  const handleSend = useCallback(
    (text: string) => {
      if (status !== 'connected' || !strategyReady) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      const content = buildMessage(trimmed);
      lastPulledTouchRef.current = null;
      send(content, undefined, { displayContent: trimmed });
      setValue('');
    },
    [status, strategyReady, buildMessage, send],
  );

  const handleNewChat = useCallback(() => {
    lastPulledTouchRef.current = null;
    clearMessages({ startNewSession: true });
  }, [clearMessages]);

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
    if (!strategyReady || !currentAgent || !strategyName) return;
    void syncStrategyToAgent(strategyName, currentAgent).catch(() => {
      // Best-effort: ensure agent workspace has the strategy file before chat.
    });
  }, [strategyReady, currentAgent, strategyName]);

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
      <div className="flex shrink-0 items-center gap-1 border-b border-border/50 px-3 py-2">
        <div className="min-w-0 flex-1">
          <ChatMainToolbar />
        </div>
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
                <Link to="/agents/market">前往 Agent 市场</Link>
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">请先选择 Agent</p>
          )}
        </div>
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
              />
            </ErrorBoundary>
          </div>

          <div className="shrink-0 border-t border-border/40 p-3">
            {!strategyReady && (
              <p className="mb-2 text-xs text-amber-600 dark:text-amber-400">
                请先保存策略后再使用 AI 生成。
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend(value);
              }}
            >
              <div className="relative rounded-xl border border-border/60 bg-card p-1.5 shadow-sm">
                <ChatSlashHints value={value} onPick={(command) => setValue(command)} />
                <div className="flex items-end gap-2">
                  <textarea
                    className="min-h-9 w-full resize-none bg-transparent px-2 py-1.5 text-sm leading-normal text-foreground outline-none placeholder:text-muted-foreground"
                    placeholder={strategyReady ? '描述你想要的量化策略…' : '请先保存策略…'}
                    rows={2}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    disabled={status !== 'connected' || !strategyReady}
                    onKeyDown={(e) => {
                      handleSlashInputKeyDown(e, value, {
                        onAutocomplete: (command) => setValue(command),
                        onSend: () => handleSend(value),
                      });
                    }}
                  />
                  <button
                    type="submit"
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-500 text-white transition-all hover:bg-violet-600 active:scale-95 disabled:opacity-50"
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
