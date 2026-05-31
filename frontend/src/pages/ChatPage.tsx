import { IconAlertTriangle, IconBuildingStore, IconHistory, IconTrash } from '@tabler/icons-react';
import { Link } from 'react-router-dom';
import { AgentAvatar } from '../components/AgentAvatar';
import { ChatContainer } from '../components/ChatContainer';
import { AgentAssetsSidebar, AGENT_ASSETS_EXPANDED_INSET } from '../components/AgentAssetsSidebar';
import { CHAT_INPUT_GUTTER, CHAT_MAIN_COLUMN, CHAT_SCROLL_GUTTER } from '@/lib/chatLayout';
import { DocFileTree } from '../components/DocFileTree';
import { DocReadingPanel } from '../components/DocReadingPanel';
import { AgentSkillsPanel, skillFileKey, type SkillFileTarget } from '../components/AgentSkillsPanel';
import { getAgentSkillFile, writeAgentSkillFile, deleteAgentSkill } from '../api/agents';
import { writeAgentDocFile, deleteAgentDocPath } from '../api/agentDocs';
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

  const { messages, status, isTyping, sendError, send, clearMessages, restoreMessages, reconnect } = useChatSession();

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
  const [assetsCollapsed, setAssetsCollapsed] = useState(true);
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

  // 切换 Agent 时关闭已打开的 skill 文件
  useEffect(() => {
    setSkillFile(null);
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
  const handleDeleteDoc = useCallback(async (fullPath: string, isDir: boolean) => {
    if (!currentAgent) return;
    const name = fullPath.split('/').pop() ?? fullPath;
    const ok = await confirm({
      title: isDir ? `删除文件夹「${name}」` : `删除文件「${name}」`,
      description: isDir
        ? `将永久删除该文件夹及其下全部文件，操作不可恢复。`
        : `将永久删除该文件，操作不可恢复。`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteAgentDocPath(currentAgent, fullPath);
      if (selectedDocPath && (selectedDocPath === fullPath || selectedDocPath.startsWith(`${fullPath}/`))) {
        setSelectedDocPath(null);
      }
      bumpDocsRefresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '删除失败');
    }
  }, [currentAgent, selectedDocPath, setSelectedDocPath, bumpDocsRefresh, confirm]);

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
  const noAgents = agents.length === 0 && agentsLoadStatus === 'ready';

  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant' || lastMsg.kind !== 'tool') return;
    if (lastMsg.content.includes('write_file') && lastMsg.content.includes('docs/')) {
      bumpDocsRefresh();
    }
  }, [messages, bumpDocsRefresh]);

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
            agentsLoadStatus === 'ready' ? (
              <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                <Link to="/agents?market=1">暂无 Agent · 去市场创建</Link>
              </Button>
            ) : (
              <Badge variant="outline" className="h-7 text-xs text-muted-foreground">
                {agentsLoadStatus === 'loading' ? '加载 Agent…' : 'Agent 列表加载失败'}
              </Badge>
            )
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
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          {agentsLoadStatus === 'loading' ? (
            <>
              <AgentAvatar name="?" size="xl" className="opacity-60" />
              <div className="text-sm font-medium text-muted-foreground">正在加载 Agent…</div>
            </>
          ) : noAgents ? (
            <>
              <div className="flex size-16 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-600 dark:text-violet-300">
                <IconBuildingStore size={32} stroke={1.5} />
              </div>
              <div className="text-sm font-medium text-foreground/90">还没有 Agent</div>
              <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                请前往 Agent 市场，从模板快速创建一位 Agent 后即可开始对话。
              </p>
              <Button asChild className="bg-violet-600 hover:bg-violet-600/90">
                <Link to="/agents?market=1">前往 Agent 市场</Link>
              </Button>
            </>
          ) : (
            <>
              <AgentAvatar name="?" size="xl" className="opacity-60" />
              <div className="text-sm font-medium text-muted-foreground">请先选择 Agent</div>
              <p className="max-w-xs text-xs text-muted-foreground">从上方 Agent 选择框中选一位开始对话</p>
            </>
          )}
        </div>
      )}

      {/* Main body: file tree sidebar + chat */}
      {currentAgent && (
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <AgentAssetsSidebar
            assetTab={assetTab}
            onAssetTabChange={setAssetTab}
            onCollapsedChange={setAssetsCollapsed}
          >
            {assetTab === 'docs' ? (
              <DocFileTree
                agentName={currentAgent}
                refreshRev={docsRefreshRev}
                onFileSelect={openDoc}
                selectedDocPath={selectedDocPath}
                hideHeader
                onDelete={handleDeleteDoc}
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
                refreshRev={skillsRefreshRev}
              />
            )}
          </AgentAssetsSidebar>

          {/* 折叠时全宽居中；桌面展开资产侧栏时为浮层留白 */}
          <div
            className={cn(
              'flex min-h-0 min-w-0 flex-1 flex-col',
              'max-md:pl-10',
              !assetsCollapsed && AGENT_ASSETS_EXPANDED_INSET,
            )}
          >
            <div className={cn('min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]', CHAT_SCROLL_GUTTER)}>
              <div className={cn('flex flex-col gap-8', CHAT_MAIN_COLUMN)}>
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

            <div className={cn('shrink-0 border-t border-border/40', CHAT_INPUT_GUTTER)}>
              <div className={CHAT_MAIN_COLUMN}>
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
