import { IconAlertTriangle, IconHistory, IconTrash } from '@tabler/icons-react';
import { AgentAvatar } from '../components/AgentAvatar';
import { ChatContainer } from '../components/ChatContainer';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useWebSocket } from '../hooks/useWebSocket';
import { useAiDock } from '@/state/aiDock';
import { useAgents } from '@/state/agents';
import { buildAnalysisUserMessage } from '@/utils/analysisPrompt';
import { rssScopedItemKey } from '@/utils/rssScopedKey';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  archiveConversation,
  deleteArchived,
  listArchived,
  persistedToMessages,
  type ArchivedChat,
} from '@/lib/chatPersistence';
import { useState, useRef, useMemo, useEffect, useCallback, type MouseEvent } from 'react';
import { cn } from '@/lib/cn';

const WS_STATUS_CONFIG = {
  idle: { label: '待连接', color: 'text-muted-foreground' },
  connecting: { label: '连接中...', color: 'text-amber-500' },
  connected: { label: '已连接', color: 'text-emerald-500' },
  error: { label: '连接错误', color: 'text-red-500' },
};

export default function ChatPage() {
  const { agents, currentAgent, selectAgent, refresh, status: agentsLoadStatus, error: agentsLoadError } = useAgents();
  const [value, setValue] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const dock = useAiDock();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const wsUrl = useMemo(() => {
    if (!currentAgent) return null;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${window.location.host}/ws/chat/${encodeURIComponent(currentAgent)}`;
  }, [currentAgent]);

  const { messages, status, isTyping, sendError, send, clearMessages, restoreMessages, reconnect } = useWebSocket(wsUrl, {
    persistAgentKey: currentAgent,
  });

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRev, setHistoryRev] = useState(0);

  const archivedList = useMemo(() => {
    if (!currentAgent) return [];
    return listArchived(currentAgent);
  }, [currentAgent, historyRev]);

  const bumpHistory = useCallback(() => setHistoryRev((n) => n + 1), []);

  const handleArchiveAndClear = useCallback(() => {
    if (currentAgent && messages.length > 0) {
      archiveConversation(currentAgent, messages);
      bumpHistory();
    }
    clearMessages();
  }, [currentAgent, messages, clearMessages, bumpHistory]);

  const handleRestoreArchive = useCallback(
    (item: ArchivedChat) => {
      restoreMessages(persistedToMessages(item.messages));
      setHistoryOpen(false);
    },
    [restoreMessages],
  );

  const handleDeleteArchive = useCallback(
    (e: MouseEvent, archiveId: string) => {
      e.stopPropagation();
      if (!currentAgent) return;
      if (deleteArchived(currentAgent, archiveId)) bumpHistory();
    },
    [currentAgent, bumpHistory],
  );

  const statusCfg = WS_STATUS_CONFIG[status] || WS_STATUS_CONFIG.idle;

  const handleSend = (text: string) => {
    if (!text.trim() || status !== 'connected') return;
    const content = dock.selectedKeys.size > 0
      ? buildAnalysisUserMessage(text, dock.listEntries.filter(e => dock.selectedKeys.has(rssScopedItemKey(e.sourceName, e.sector, e.item))))
      : text;
    send(content);
    setValue('');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background/95">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-medium tracking-tight text-foreground/90">对话</h1>

          {/* Agent Switcher */}
          {agents.length === 0 ? (
            <Badge variant="outline" className="h-7 text-xs text-muted-foreground">
              {agentsLoadStatus === 'loading' ? '加载 Agent…' : agentsLoadStatus === 'error' ? 'Agent 列表加载失败' : '暂无 Agent'}
            </Badge>
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              {currentAgent && <AgentAvatar name={currentAgent} size="sm" />}
              <label className="relative flex min-w-0 flex-1 items-center">
              <span className="sr-only">选择对话使用的 Agent</span>
              <select
                aria-label="选择对话使用的 Agent"
                value={currentAgent ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  selectAgent(v ? v : null);
                }}
                className={cn(
                  'h-7 max-w-[min(100%,18rem)] min-w-[10rem] cursor-pointer appearance-none rounded-md border border-input bg-background py-1 pl-3 pr-8 text-xs shadow-xs outline-none transition-colors',
                  'hover:bg-accent/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
                )}
              >
                {!currentAgent && <option value="">选择 Agent…</option>}
                {agents.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <svg
                className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </label>
            </div>
          )}

          {agentsLoadStatus === 'error' && agentsLoadError && (
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive" onClick={() => void refresh()}>
              重试加载
            </Button>
          )}

          <Badge
            variant={status === 'connected' ? 'default' : status === 'error' ? 'destructive' : 'outline'}
            className={`text-[10px] ${statusCfg.color}`}
          >
            {statusCfg.label}
          </Badge>
          {dock.selectedKeys.size > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {dock.selectedKeys.size} 篇已选
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {currentAgent && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => setHistoryOpen(true)}
            >
              <IconHistory size={14} className="mr-1 opacity-80" />
              历史记录
            </Button>
          )}
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={handleArchiveAndClear} className="text-xs">
              新对话
            </Button>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {sendError && (
        <div className="mx-4 mt-3 flex items-center justify-between gap-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 animate-in fade-in-0">
          <span className="flex items-center gap-2 text-xs text-destructive">
            <IconAlertTriangle size={15} />
            {sendError}
          </span>
          <Button variant="outline" size="sm" onClick={reconnect} className="h-7 text-xs">
            重连
          </Button>
        </div>
      )}

      {/* No Agent Selected State */}
      {!currentAgent && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <AgentAvatar name="?" size="xl" className="opacity-60" />
          <div className="text-sm font-medium text-muted-foreground">请先选择 Agent</div>
          <p className="max-w-xs text-xs text-muted-foreground">从上方 Agent 选择框中选一位开始对话</p>
        </div>
      )}

      {/* Messages */}
      {currentAgent && (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8 lg:px-24 xl:px-48 [scrollbar-gutter:stable]">
          <div className="mx-auto flex w-full max-w-[64rem] flex-col gap-8">
            <ErrorBoundary>
              <ChatContainer
                messages={messages}
                isTyping={isTyping}
                onClear={handleArchiveAndClear}
                agentName={currentAgent}
              />
            </ErrorBoundary>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 px-4 pb-4 md:px-8 lg:px-24 xl:px-48">
        <div className="mx-auto max-w-[64rem]">
          <form ref={formRef} onSubmit={(e) => { e.preventDefault(); handleSend(value); }}>
            <div className="relative rounded-2xl border border-border/60 bg-card p-1.5 pr-1 shadow-sm">
              <div className="relative flex items-end gap-2">
                <textarea
                  className="min-h-[44px] w-full resize-none bg-transparent px-3 py-2.5 text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
                  placeholder={dock.selectedKeys.size > 0 ? '已选文章将自动附带到对话中...' : '输入你的问题...'}
                  rows={1}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  disabled={status !== 'connected'}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend(value);
                    }
                  }}
                />
                <button
                  type="submit"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-500 text-white transition-all hover:bg-violet-600 active:scale-95 disabled:opacity-50"
                  disabled={status !== 'connected' || !value.trim()}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
            </div>
          </form>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Enter</kbd> 发送 ·
            <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Shift</kbd>+<kbd className="rounded bg-muted px-1.5 py-0.5 font-mono">Enter</kbd> 换行
          </p>
          <p className="mt-1 text-center text-[10px] text-muted-foreground/80">
            对话内容会缓存在本浏览器（localStorage），刷新后仍可从当前 Agent 恢复。
          </p>
        </div>
      </div>

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border/60 px-4 py-4 text-left">
            <SheetTitle className="text-base">历史对话</SheetTitle>
            <SheetDescription className="text-xs">
              点击记录载入主聊天区；点击删除图标可移除该条归档。仅保存在本机浏览器。
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1">
            <ScrollArea className="h-[calc(100vh-8rem)] px-2 py-2">
              {!currentAgent ? (
                  <p className="px-3 py-8 text-center text-xs text-muted-foreground">请先选择 Agent</p>
                ) : archivedList.length === 0 ? (
                  <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                    暂无归档。发起对话后点击「新对话」即可保存本轮记录。
                  </p>
                ) : (
                <ul className="flex flex-col gap-1">
                  {archivedList.map((item) => (
                    <li key={item.id} className="group relative">
                      <button
                        type="button"
                        className="flex w-full flex-col gap-0.5 rounded-lg border border-transparent py-2.5 pl-3 pr-10 text-left text-sm transition-colors hover:bg-muted/80 hover:border-border/60"
                        onClick={() => handleRestoreArchive(item)}
                      >
                        <span className="line-clamp-2 font-medium leading-snug">{item.title}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(item.updatedAt).toLocaleString()} · {item.messages.length} 条消息
                        </span>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                        aria-label="删除此条历史对话"
                        title="删除"
                        onClick={(e) => handleDeleteArchive(e, item.id)}
                      >
                        <IconTrash size={16} />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}