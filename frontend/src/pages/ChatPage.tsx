import { IconAlertTriangle, IconBuildingStore, IconFolder, IconHistory, IconMessagePlus, IconPhoto, IconTrash, IconX } from '@tabler/icons-react';
import { ChatComposerToolbar } from '@/components/chrome/ChatComposerToolbar';
import { SidebarExpandTrigger } from '@/components/chrome/SidebarExpandTrigger';
import { ThemeToggle } from '@/components/chrome/ThemeToggle';
import { ChatContainer } from '../components/ChatContainer';
import {
  ChatSlashHints,
  handleSlashInputKeyDown,
} from '@/components/ChatSlashHints';
import { AccountDocsSidebar } from '../components/AccountDocsSidebar';
import { CHAT_INPUT_GUTTER, CHAT_MAIN_COLUMN, CHAT_SCROLL_GUTTER } from '@/lib/chatLayout';
import { DocFileTree } from '../components/DocFileTree';
import { DocReadingPanel } from '../components/DocReadingPanel';
import {
  writeAccountDocFile,
  deleteAccountDocPath,
  downloadAccountDocFile,
} from '../api/agentDocs';
import { createAccountDocShare } from '../api/agentAssets';
import { messageTouchesDocScanRoot } from '../lib/agentDocRoots';
import { copyToClipboard } from '../lib/clipboard';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useChatSession } from '@/state/chatSession';
import { useAiDock } from '@/state/aiDock';
import { useAgents } from '@/state/agents';
import { useDocViewer } from '@/state/docViewer';
import { buildAnalysisUserMessage } from '@/utils/analysisPrompt';
import { rssScopedItemKey } from '@/utils/rssScopedKey';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  deleteConversation,
  listConversations,
  loadConversation,
  type ConversationSummary,
} from '@/lib/chatPersistence';
import { useAuth } from '@/state/auth';
import { prefetchModels } from '@/api/models';
import { getAgent } from '@/api/agents';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useState, useRef, useMemo, useEffect, useCallback, type ChangeEvent, type MouseEvent } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { filesToPendingImages, type PendingImage } from '@/lib/imageAttach';
import { cn } from '@/lib/cn';
import { TOOLBAR_ICON_BUTTON_CLASS } from '@/lib/toolbarButton';

export default function ChatPage() {
  const { user } = useAuth();
  const { agents, currentAgent, refresh, status: agentsLoadStatus, error: agentsLoadError } = useAgents();
  const { requireAuth } = useRequireAuth();
  const [value, setValue] = useState('');
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const dock = useAiDock();

  useEffect(() => {
    void refresh();
    if (user) void prefetchModels();
    if (user && currentAgent) void getAgent(currentAgent);
  }, [refresh, user, currentAgent]);

  const {
    messages,
    status,
    isTyping,
    sendError,
    send,
    clearMessages,
    restoreMessages,
    getSessionId,
    reconnect,
    taskStartedAt,
  } = useChatSession();

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRev, setHistoryRev] = useState(0);
  const {
    bumpRefresh: bumpDocsRefresh,
    refreshRev: docsRefreshRev,
    selectedDocPath,
    setSelectedDocPath,
  } = useDocViewer();

  // 文档侧栏开合
  const [docsOpen, setDocsOpen] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const openDoc = useCallback((fullPath: string) => {
    setSelectedDocPath(fullPath);
  }, [setSelectedDocPath]);

  // ── 编辑保存 ──
  const saveDocContent = useCallback(async (content: string) => {
    if (!selectedDocPath) return;
    await writeAccountDocFile(selectedDocPath, content);
    bumpDocsRefresh();
  }, [selectedDocPath, bumpDocsRefresh]);

  // ── 删除 ──
  const handleDownloadDoc = useCallback(async (fullPath: string, isDir: boolean) => {
    try {
      await downloadAccountDocFile(fullPath, isDir);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '下载失败');
    }
  }, []);

  const handleDeleteDoc = useCallback(async (fullPath: string, isDir: boolean) => {
    if (!requireAuth()) return false;
    const name = fullPath.split('/').pop() ?? fullPath;
    const ok = await confirm({
      title: isDir ? `删除文件夹「${name}」` : `删除文件「${name}」`,
      description: isDir
        ? `将永久删除该文件夹及其下全部文件，操作不可恢复。`
        : `将永久删除该文件，操作不可恢复。`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return false;
    try {
      await deleteAccountDocPath(fullPath);
      if (selectedDocPath && (selectedDocPath === fullPath || selectedDocPath.startsWith(`${fullPath}/`))) {
        setSelectedDocPath(null);
      }
      return true;
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '删除失败');
      return false;
    }
  }, [requireAuth, selectedDocPath, setSelectedDocPath, confirm]);

  const handleShareDoc = useCallback(async (fullPath: string, isDir?: boolean) => {
    if (!requireAuth()) return;
    if (isDir) {
      toast.error('暂不支持分享文件夹');
      return;
    }
    try {
      const { url } = await createAccountDocShare(fullPath);
      await copyToClipboard(url);
      toast.success('分享链接已复制到剪贴板');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '创建分享失败');
    }
  }, [requireAuth]);

  // 历史对话列表（含当前对话）：打开面板或数据变更时刷新
  const conversationList = useMemo(() => {
    if (!currentAgent) return [];
    return listConversations(currentAgent);
  }, [currentAgent, historyRev, historyOpen]);

  const activeConversationId = getSessionId();

  const bumpHistory = useCallback(() => setHistoryRev((n) => n + 1), []);

  // 新对话：当前对话持续落盘、本身就是历史记录，直接切换到新会话即可
  const handleNewChat = useCallback(() => {
    if (!requireAuth()) return;
    clearMessages({ startNewSession: true });
    bumpHistory();
  }, [requireAuth, clearMessages, bumpHistory]);

  const handleRestoreConversation = useCallback(
    (item: ConversationSummary) => {
      restoreMessages(loadConversation(item.id), item.id);
      setHistoryOpen(false);
    },
    [restoreMessages],
  );

  const handleDeleteConversation = useCallback(
    (e: MouseEvent, convId: string) => {
      e.stopPropagation();
      if (!requireAuth() || !currentAgent) return;
      if (convId === getSessionId()) {
        // 删除的是当前对话：清空聊天区并丢弃记录，切换到新会话
        clearMessages({ startNewSession: true, discard: true });
        bumpHistory();
        return;
      }
      if (deleteConversation(convId)) bumpHistory();
    },
    [requireAuth, currentAgent, bumpHistory, getSessionId, clearMessages],
  );

  const noAgents = agents.length === 0 && agentsLoadStatus === 'ready';

  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant' || lastMsg.kind !== 'tool') return;
    if (messageTouchesDocScanRoot(lastMsg.content)) {
      bumpDocsRefresh();
    }
  }, [messages, bumpDocsRefresh]);

  const handleSend = (text: string) => {
    if (!requireAuth()) return;
    if (status !== 'connected') return;
    if (!text.trim() && pendingImages.length === 0) return;
    const content = dock.selectedKeys.size > 0
      ? buildAnalysisUserMessage(text, dock.listEntries.filter(e => dock.selectedKeys.has(rssScopedItemKey(e.sourceName, e.sector, e.item))))
      : text;
    const media = pendingImages.map((img) => img.dataUrl);
    send(content, media.length > 0 ? media : undefined);
    setValue('');
    setPendingImages([]);
  };

  const handlePickImages = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const { images } = await filesToPendingImages(files);
    if (images.length > 0) setPendingImages((prev) => [...prev, ...images]);
    // reset so the same file can be re-selected
    e.target.value = '';
  };

  const removePendingImage = (index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#f7f7f8] dark:bg-background">
      {/* 主区顶栏单行 — 新对话 · 文档 · 历史 · 主题 */}
      <div className="flex shrink-0 items-center gap-2 px-5 py-2">
        <SidebarExpandTrigger />
        <div className="flex min-w-0 flex-1 items-center gap-0.5">
          {agentsLoadStatus === 'ready' && agents.length > 0 && (
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
          {currentAgent && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className={cn(
                    TOOLBAR_ICON_BUTTON_CLASS,
                    docsOpen && 'bg-violet-500/12 text-violet-600 shadow-[0_0_0_1px_rgba(139,92,246,0.22)] dark:text-violet-300 dark:shadow-[0_0_0_1px_rgba(167,139,250,0.32)]',
                  )}
                  aria-label={docsOpen ? '收起文档' : '打开文档'}
                  aria-pressed={docsOpen}
                  onClick={() => setDocsOpen((open) => !open)}
                >
                  <IconFolder className="size-[18px]" stroke={1.75} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">文档</TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {agentsLoadStatus === 'error' && agentsLoadError && (
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs text-destructive" onClick={() => void refresh()}>
              重试
            </Button>
          )}
          {dock.selectedKeys.size > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {dock.selectedKeys.size} 篇已选
            </Badge>
          )}
          {currentAgent && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className={TOOLBAR_ICON_BUTTON_CLASS}
                  aria-label="历史记录"
                  onClick={() => setHistoryOpen(true)}
                >
                  <IconHistory className="size-[18px]" stroke={1.75} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">历史记录</TooltipContent>
            </Tooltip>
          )}
          <ThemeToggle />
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
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          {agentsLoadStatus === 'loading' ? (
            <div className="text-sm font-medium text-muted-foreground">正在加载 Agent…</div>
          ) : noAgents ? (
            <>
              <div className="flex size-16 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-600 dark:text-violet-300">
                <IconBuildingStore size={32} stroke={1.5} />
              </div>
              <div className="text-sm font-medium text-foreground/90">还没有 Agent</div>
              <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                请前往 Agent 市场，从模板快速创建一位 Agent 后即可开始对话。
              </p>
            </>
          ) : (
            <>
              <div className="text-sm font-medium text-muted-foreground">请先选择 Agent</div>
              <p className="max-w-xs text-xs text-muted-foreground">
                从下方输入框选择一位 Agent，即可开始对话。
              </p>
            </>
          )}
        </div>
      )}

      {/* Main body: 左侧文档 + 聊天 */}
      {currentAgent && (
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          {docsOpen && (
            <AccountDocsSidebar onClose={() => setDocsOpen(false)}>
              <DocFileTree
                scopeKey="account"
                refreshRev={docsRefreshRev}
                onFileSelect={openDoc}
                selectedDocPath={selectedDocPath}
                hideHeader
                onDelete={handleDeleteDoc}
                onDownload={handleDownloadDoc}
                onShare={handleShareDoc}
              />
            </AccountDocsSidebar>
          )}

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className={cn('min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]', CHAT_SCROLL_GUTTER)}>
              <div className={cn('flex flex-col gap-8', CHAT_MAIN_COLUMN)}>
                <ErrorBoundary>
                  <ChatContainer
                    messages={messages}
                    isTyping={isTyping}
                    onClear={handleNewChat}
                    agentName={currentAgent}
                    taskStartedAt={taskStartedAt}
                  />
                </ErrorBoundary>
              </div>
            </div>

            <div className={cn('relative shrink-0 overflow-visible border-t border-border/40', CHAT_INPUT_GUTTER)}>
              <div className={CHAT_MAIN_COLUMN}>
                {status !== 'connected' && status !== 'idle' && (
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="inline-block size-1.5 animate-pulse rounded-full bg-amber-500" />
                    {status === 'connecting' ? '正在连接聊天服务…' : '连接已断开，正在自动重连…'}
                  </p>
                )}
                <form ref={formRef} onSubmit={(e) => { e.preventDefault(); handleSend(value); }}>
                  <div className="relative overflow-visible rounded-2xl border border-border/60 bg-card px-2 pt-2 pb-1.5 shadow-sm">
                    <ChatSlashHints
                      value={value}
                      onPick={(command) => setValue(command)}
                    />
                    {pendingImages.length > 0 && (
                      <div className="flex flex-wrap gap-2 px-1 pb-1.5 pt-0.5">
                        {pendingImages.map((img, i) => (
                          <div key={`${img.name}-${i}`} className="relative">
                            <img
                              src={img.dataUrl}
                              alt={img.name}
                              className="h-16 w-16 rounded-lg border border-border/60 object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => removePendingImage(i)}
                              className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-foreground/80 text-background transition-colors hover:bg-foreground"
                              aria-label="移除图片"
                            >
                              <IconX className="size-3" stroke={2.5} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp,image/bmp"
                      multiple
                      className="hidden"
                      onChange={handlePickImages}
                    />
                    <TextareaAutosize
                      className="w-full resize-none bg-transparent px-2 py-1.5 text-[15px] leading-normal text-foreground outline-none break-words whitespace-pre-wrap placeholder:text-muted-foreground"
                      placeholder={dock.selectedKeys.size > 0 ? '已选文章将自动附带到对话中...' : "输入您的问题...。输入'/'可使用系统命令，如'/stop'可中止当前回复"}
                      minRows={1}
                      maxRows={10}
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      disabled={status !== 'connected'}
                      onKeyDown={(e) => {
                        handleSlashInputKeyDown(e, value, {
                          onAutocomplete: (command) => setValue(command),
                          onSend: () => handleSend(value),
                        });
                      }}
                    />
                    <div className="flex items-center gap-1 pt-0.5">
                      <ChatComposerToolbar />
                      <div className="ml-auto flex shrink-0 items-center gap-0.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                              disabled={status !== 'connected'}
                              onClick={() => fileInputRef.current?.click()}
                              aria-label="添加图片"
                            >
                              <IconPhoto className="size-[18px]" stroke={1.75} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top">添加图片</TooltipContent>
                        </Tooltip>
                        <button
                          type="submit"
                          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-500 text-white transition-all hover:bg-violet-600 active:scale-95 disabled:opacity-50"
                          disabled={status !== 'connected' || (!value.trim() && pendingImages.length === 0)}
                          aria-label="发送"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Input (no agent selected) */}
      {!currentAgent && (
        <div className={cn('shrink-0 border-t border-border/40', CHAT_INPUT_GUTTER)}>
          <div className={CHAT_MAIN_COLUMN}>
            <form ref={formRef} onSubmit={(e) => { e.preventDefault(); handleSend(value); }}>
              <div className="relative rounded-2xl border border-border/60 bg-card px-2 pt-2 pb-1.5 shadow-sm">
                <textarea
                  className="min-h-[44px] w-full resize-none bg-transparent px-2 py-1.5 text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
                  placeholder={noAgents ? '请前往 Agent 市场创建 Agent…' : '请先选择 Agent…'}
                  rows={1}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  disabled
                />
                <div className="flex items-center gap-1 pt-0.5">
                  <ChatComposerToolbar />
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Document reading floating panel */}
      {currentAgent && selectedDocPath && (
        <DocReadingPanel
          agentName={currentAgent}
          filePath={selectedDocPath}
          onClose={() => setSelectedDocPath(null)}
          onSave={saveDocContent}
          onShare={() => void handleShareDoc(selectedDocPath)}
        />
      )}

      {confirmDialog}

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border/60 px-4 py-4 text-left">
            <SheetTitle className="text-base">历史对话</SheetTitle>
            <SheetDescription className="text-xs">
              所有对话（含当前）自动保存在这里；点击记录载入主聊天区，点击删除图标可移除该条对话。仅保存在本机浏览器。
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1">
            <ScrollArea className="h-[calc(100vh-8rem)] px-2 py-2">
              {!currentAgent ? (
                <p className="px-3 py-8 text-center text-xs text-muted-foreground">请先选择 Agent</p>
              ) : conversationList.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                  暂无历史对话。发送消息后会自动保存到这里。
                </p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {conversationList.map((item) => (
                    <li key={item.id} className="group relative">
                      <button
                        type="button"
                        className="flex w-full flex-col gap-0.5 rounded-lg border border-transparent py-2.5 pl-3 pr-10 text-left text-sm transition-colors hover:bg-muted/80 hover:border-border/60"
                        onClick={() => handleRestoreConversation(item)}
                      >
                        <span className="flex items-start gap-1.5">
                          <span className="line-clamp-2 min-w-0 font-medium leading-snug">{item.title}</span>
                          {item.id === activeConversationId && (
                            <Badge variant="secondary" className="mt-px shrink-0 px-1.5 text-[10px]">
                              当前
                            </Badge>
                          )}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(item.updatedAt).toLocaleString()} · {item.messageCount} 条消息
                        </span>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                        aria-label="删除此条历史对话"
                        title="删除"
                        onClick={(e) => handleDeleteConversation(e, item.id)}
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
