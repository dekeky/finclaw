import { IconAlertTriangle, IconBuildingStore, IconFolder, IconHistory, IconMessagePlus, IconPhoto, IconTrash, IconX } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { ChatMainToolbar } from '@/components/chrome/ChatMainToolbar';
import { SidebarExpandTrigger } from '@/components/chrome/SidebarExpandTrigger';
import { ThemeToggle } from '@/components/chrome/ThemeToggle';
import { ChatContainer } from '../components/ChatContainer';
import {
  ChatSlashHints,
  handleSlashInputKeyDown,
} from '@/components/ChatSlashHints';
import { AgentAssetsSidebar } from '../components/AgentAssetsSidebar';
import { CHAT_INPUT_GUTTER, CHAT_MAIN_COLUMN, CHAT_SCROLL_GUTTER } from '@/lib/chatLayout';
import { DocFileTree } from '../components/DocFileTree';
import { DocReadingPanel } from '../components/DocReadingPanel';
import { AgentSkillsPanel, skillFileKey, type SkillFileTarget } from '../components/AgentSkillsPanel';
import {
  getAgentSkillFile,
  writeAgentSkillFile,
  deleteAgentSkill,
  deleteAgentSkillPath,
  downloadAgentSkillPath,
} from '../api/agents';
import { writeAgentDocFile, deleteAgentDocPath, downloadAgentDocFile } from '../api/agentDocs';
import { messageTouchesDocScanRoot } from '../lib/agentDocRoots';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useChatSession } from '@/state/chatSession';
import { useAiDock } from '@/state/aiDock';
import { useAgents } from '@/state/agents';
import { useDocViewer } from '@/state/docViewer';
import { buildAnalysisUserMessage } from '@/utils/analysisPrompt';
import { rssScopedItemKey } from '@/utils/rssScopedKey';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  archiveConversation,
  deleteArchived,
  listArchived,
  persistedToMessages,
  type ArchivedChat,
} from '@/lib/chatPersistence';
import { useState, useRef, useMemo, useEffect, useCallback, type ChangeEvent, type MouseEvent } from 'react';
import { filesToPendingImages, type PendingImage } from '@/lib/imageAttach';
import { cn } from '@/lib/cn';
import { PRIMARY_BUTTON_CLASS } from '@/lib/primaryButton';
import { TOOLBAR_ICON_BUTTON_CLASS } from '@/lib/toolbarButton';

export default function ChatPage() {
  const { agents, currentAgent, refresh, status: agentsLoadStatus, error: agentsLoadError } = useAgents();
  const [value, setValue] = useState('');
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const dock = useAiDock();

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
    completedTaskElapsedSec,
  } = useChatSession();

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRev, setHistoryRev] = useState(0);
  const {
    bumpRefresh: bumpDocsRefresh,
    refreshRev: docsRefreshRev,
    selectedDocPath,
    setSelectedDocPath,
  } = useDocViewer();

  // Agent 资产侧栏：文档 / Skills
  const [assetTab, setAssetTab] = useState<'docs' | 'skills'>('docs');
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [skillFile, setSkillFile] = useState<SkillFileTarget | null>(null);
  const [skillsRefreshRev, setSkillsRefreshRev] = useState(0);
  const { confirm, dialog: confirmDialog } = useConfirm();

  // 打开文档时关闭 skill 阅读，反之亦然（同一时间只展示一个阅读面板）
  const openDoc = useCallback((fullPath: string) => {
    setSkillFile(null);
    setSelectedDocPath(fullPath);
  }, [setSelectedDocPath]);

  const openSkill = useCallback((target: SkillFileTarget) => {
    setSelectedDocPath(null);
    setSkillFile(target);
  }, [setSelectedDocPath]);

  const loadSkillContent = useCallback((): Promise<string> => {
    if (!currentAgent || !skillFile) return Promise.reject(new Error('未选择 skill 文件'));
    return getAgentSkillFile(currentAgent, skillFile.source, skillFile.skill, skillFile.file).then(
      (b) => b.content,
    );
  }, [currentAgent, skillFile]);

  // 切换 Agent 时关闭 skill 文件与资产面板
  useEffect(() => {
    setSkillFile(null);
    setAssetsOpen(false);
  }, [currentAgent]);

  // ── 编辑保存 ──
  const saveDocContent = useCallback(async (content: string) => {
    if (!currentAgent || !selectedDocPath) return;
    await writeAgentDocFile(currentAgent, selectedDocPath, content);
    bumpDocsRefresh();
  }, [currentAgent, selectedDocPath, bumpDocsRefresh]);

  const saveSkillContent = useCallback(async (content: string) => {
    if (!currentAgent || !skillFile) return;
    await writeAgentSkillFile(currentAgent, skillFile.source, skillFile.skill, skillFile.file, content);
  }, [currentAgent, skillFile]);

  // ── 删除 ──
  const handleDownloadDoc = useCallback(async (fullPath: string, isDir: boolean) => {
    if (!currentAgent) return;
    try {
      await downloadAgentDocFile(currentAgent, fullPath, isDir);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '下载失败');
    }
  }, [currentAgent]);

  const handleDeleteDoc = useCallback(async (fullPath: string, isDir: boolean) => {
    if (!currentAgent) return false;
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
      await deleteAgentDocPath(currentAgent, fullPath);
      if (selectedDocPath && (selectedDocPath === fullPath || selectedDocPath.startsWith(`${fullPath}/`))) {
        setSelectedDocPath(null);
      }
      return true;
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '删除失败');
      return false;
    }
  }, [currentAgent, selectedDocPath, setSelectedDocPath, confirm]);

  const handleDownloadSkillPath = useCallback(
    async (source: string, skill: string, relPath: string) => {
      if (!currentAgent) return;
      try {
        await downloadAgentSkillPath(currentAgent, source, skill, relPath);
      } catch (err) {
        window.alert(err instanceof Error ? err.message : '下载失败');
      }
    },
    [currentAgent],
  );

  const handleDeleteSkill = useCallback(async (source: string, skill: string, name: string) => {
    if (!currentAgent) return;
    const ok = await confirm({
      title: `删除 Skill 包「${name}」`,
      description: '将永久删除该 Skill 包及其全部文件，操作不可恢复。',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteAgentSkill(currentAgent, source, skill);
      if (skillFile && skillFile.source === source && skillFile.skill === skill) {
        setSkillFile(null);
      }
      setSkillsRefreshRev((n) => n + 1);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '删除失败');
    }
  }, [currentAgent, skillFile, confirm]);

  const handleDeleteSkillPath = useCallback(
    async (source: string, skill: string, relPath: string, isDir: boolean, skillName: string) => {
      if (!currentAgent) return;
      const label = relPath.split('/').pop() ?? relPath;
      const ok = await confirm({
        title: isDir ? `删除文件夹「${label}」` : `删除文件「${label}」`,
        description: isDir
          ? `将永久删除 Skill「${skillName}」下的该文件夹及其全部内容，操作不可恢复。`
          : `将永久删除 Skill「${skillName}」下的该文件，操作不可恢复。`,
        confirmText: '删除',
        danger: true,
      });
      if (!ok) return;
      try {
        await deleteAgentSkillPath(currentAgent, source, skill, relPath);
        if (
          skillFile &&
          skillFile.source === source &&
          skillFile.skill === skill &&
          (skillFile.file === relPath || skillFile.file.startsWith(`${relPath}/`))
        ) {
          setSkillFile(null);
        }
      } catch (err) {
        window.alert(err instanceof Error ? err.message : '删除失败');
      }
    },
    [currentAgent, skillFile, confirm],
  );

  const archivedList = useMemo(() => {
    if (!currentAgent) return [];
    return listArchived(currentAgent);
  }, [currentAgent, historyRev]);

  const bumpHistory = useCallback(() => setHistoryRev((n) => n + 1), []);

  const handleArchiveAndClear = useCallback(() => {
    if (currentAgent && messages.length > 0) {
      // 归档时记录当前会话的 sessionId，恢复时据此切回，避免缓存串台
      archiveConversation(currentAgent, messages, getSessionId());
      bumpHistory();
    }
    clearMessages({ startNewSession: true });
  }, [currentAgent, messages, clearMessages, bumpHistory, getSessionId]);

  const handleRestoreArchive = useCallback(
    (item: ArchivedChat) => {
      restoreMessages(persistedToMessages(item.messages), item.sessionId ?? null);
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

  const handleNewChat = useCallback(() => {
    if (messages.length > 0) handleArchiveAndClear();
    else clearMessages({ startNewSession: true });
  }, [messages.length, handleArchiveAndClear, clearMessages]);

  const noAgents = agents.length === 0 && agentsLoadStatus === 'ready';

  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant' || lastMsg.kind !== 'tool') return;
    if (messageTouchesDocScanRoot(lastMsg.content)) {
      bumpDocsRefresh();
    }
  }, [messages, bumpDocsRefresh]);

  const handleSend = (text: string) => {
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
      {/* 元宝式：主区顶栏单行 — Agent 下拉 · 新对话 · 资产 · 历史 · 主题 */}
      <div className="flex shrink-0 items-center gap-2 px-5 py-2">
        <SidebarExpandTrigger />
        <div className="flex min-w-0 flex-1 items-center gap-0.5">
          <ChatMainToolbar />
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
                    assetsOpen && 'bg-violet-500/12 text-violet-600 shadow-[0_0_0_1px_rgba(139,92,246,0.22)] dark:text-violet-300 dark:shadow-[0_0_0_1px_rgba(167,139,250,0.32)]',
                  )}
                  aria-label={assetsOpen ? '收起 Agent 资产' : '打开 Agent 资产'}
                  aria-pressed={assetsOpen}
                  onClick={() => setAssetsOpen((open) => !open)}
                >
                  <IconFolder className="size-[18px]" stroke={1.75} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Agent 资产</TooltipContent>
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
              <Button asChild className={PRIMARY_BUTTON_CLASS}>
                <Link to="/agents/market">前往 Agent 市场</Link>
              </Button>
            </>
          ) : (
            <>
              <div className="text-sm font-medium text-muted-foreground">请先选择 Agent</div>
              <p className="max-w-xs text-xs text-muted-foreground">点击左上角 Agent 名称，从下拉列表中选择一位开始对话</p>
            </>
          )}
        </div>
      )}

      {/* Main body: 左侧资产 + 聊天 */}
      {currentAgent && (
        <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          {assetsOpen && (
            <AgentAssetsSidebar
              assetTab={assetTab}
              onAssetTabChange={setAssetTab}
              onClose={() => setAssetsOpen(false)}
            >
              {assetTab === 'docs' ? (
                <DocFileTree
                  agentName={currentAgent}
                  refreshRev={docsRefreshRev}
                  onFileSelect={openDoc}
                  selectedDocPath={selectedDocPath}
                  hideHeader
                  onDelete={handleDeleteDoc}
                  onDownload={handleDownloadDoc}
                />
              ) : (
                <AgentSkillsPanel
                  key={currentAgent}
                  agentName={currentAgent}
                  className="min-h-0 flex-1"
                  onOpenFile={openSkill}
                  activeFileKey={
                    skillFile ? skillFileKey(skillFile.source, skillFile.skill, skillFile.file) : null
                  }
                  onDeleteSkill={handleDeleteSkill}
                  onDeleteSkillPath={handleDeleteSkillPath}
                  onDownloadSkillPath={handleDownloadSkillPath}
                  refreshRev={skillsRefreshRev}
                />
              )}
            </AgentAssetsSidebar>
          )}

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className={cn('min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]', CHAT_SCROLL_GUTTER)}>
              <div className={cn('flex flex-col gap-8', CHAT_MAIN_COLUMN)}>
                <ErrorBoundary>
                  <ChatContainer
                    messages={messages}
                    isTyping={isTyping}
                    onClear={handleArchiveAndClear}
                    agentName={currentAgent}
                    taskStartedAt={taskStartedAt}
                    completedTaskElapsedSec={completedTaskElapsedSec}
                  />
                </ErrorBoundary>
              </div>
            </div>

            <div className={cn('relative shrink-0 overflow-visible border-t border-border/40', CHAT_INPUT_GUTTER)}>
              <div className={CHAT_MAIN_COLUMN}>
                <form ref={formRef} onSubmit={(e) => { e.preventDefault(); handleSend(value); }}>
                  <div className="relative overflow-visible rounded-2xl border border-border/60 bg-card p-1.5 pr-1 shadow-sm">
                    <ChatSlashHints
                      value={value}
                      onPick={(command) => setValue(command)}
                    />
                    {pendingImages.length > 0 && (
                      <div className="flex flex-wrap gap-2 px-2 pb-1.5 pt-1">
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
                    <div className="flex items-center gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp,image/bmp"
                        multiple
                        className="hidden"
                        onChange={handlePickImages}
                      />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                            disabled={status !== 'connected'}
                            onClick={() => fileInputRef.current?.click()}
                            aria-label="添加图片"
                          >
                            <IconPhoto className="size-[18px]" stroke={1.75} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">添加图片</TooltipContent>
                      </Tooltip>
                      <textarea
                        className="min-h-9 w-full resize-none bg-transparent px-3 py-1.5 text-[15px] leading-normal text-foreground outline-none placeholder:text-muted-foreground"
                        placeholder={dock.selectedKeys.size > 0 ? '已选文章将自动附带到对话中...' : "输入您的问题...。输入'/'可使用系统命令，如'/stop'可中止当前回复"}
                        rows={1}
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
                      <button
                        type="submit"
                        className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-violet-500 text-white transition-all hover:bg-violet-600 active:scale-95 disabled:opacity-50"
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
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Input (no agent selected) */}
      {!currentAgent && (
        <div className={cn('shrink-0', CHAT_INPUT_GUTTER)}>
          <div className={CHAT_MAIN_COLUMN}>
            <form ref={formRef} onSubmit={(e) => { e.preventDefault(); handleSend(value); }}>
              <div className="relative rounded-2xl border border-border/60 bg-card p-1.5 pr-1 shadow-sm opacity-60">
                <div className="relative flex items-end gap-2">
                  <textarea
                    className="min-h-[44px] w-full resize-none bg-transparent px-3 py-2.5 text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
                    placeholder={noAgents ? '请前往 Agent 市场创建 Agent…' : '请先选择 Agent…'}
                    rows={1}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    disabled
                  />
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
        />
      )}

      {/* Skill reading floating panel */}
      {currentAgent && skillFile && (
        <DocReadingPanel
          key={skillFileKey(skillFile.source, skillFile.skill, skillFile.file)}
          agentName={currentAgent}
          filePath={`${skillFile.skill}/${skillFile.file}`}
          loadContent={loadSkillContent}
          onClose={() => setSkillFile(null)}
          onSave={saveSkillContent}
        />
      )}

      {confirmDialog}

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
                  暂无归档。发起对话后点击 Agent 旁的新对话按钮即可保存本轮记录。
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
