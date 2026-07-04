import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { IconCpu, IconChevronDown, IconEye, IconEyeOff, IconFileDescription, IconMessageCircle, IconPuzzle, IconSparkles, IconTrash, IconUpload, IconUser } from '@tabler/icons-react';
import { PanelResizeHandle } from '@/components/PanelResizeHandle';
import { useHorizontalResize } from '@/hooks/useHorizontalResize';
import {
  PANEL_WIDTH_DEFAULTS,
  PANEL_WIDTH_KEYS,
  PANEL_WIDTH_LIMITS,
} from '@/lib/panelWidths';
import { useAgents, findAgentSummary } from '../state/agents';
import {
  getAgent,
  getAgentSkillFile,
  writeAgentSkillFile,
  deleteAgentSkill,
  deleteAgentSkillPath,
  downloadAgentSkillPath,
  type AgentDetailBody,
} from '../api/agents';
import { AgentAvatar } from '../components/AgentAvatar';
import { AgentProfileSection } from '../components/AgentProfileSection';
import { AgentCreateDialog } from '../components/AgentCreateDialog';
import {
  isAgentModelSetupValid,
  type AgentModelsMeta,
} from '../components/AgentModelSetupSection';
import { ModelSwitcherMenu } from '@/components/ModelSwitcherMenu';
import { AgentPersonaEditor } from '../components/AgentPersonaEditor';
import { AgentSkillsPanel, skillFileKey, type SkillFileTarget } from '../components/AgentSkillsPanel';
import { createAgentAssetShare } from '../api/agentAssets';
import { copyToClipboard } from '../lib/clipboard';
import { DocReadingPanel } from '../components/DocReadingPanel';
import { uploadAgentToMarket, generateMarketSummary } from '../api/agentMarket';
import { useNavigationGuard } from '../state/navigationGuard';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SidebarExpandTrigger } from '@/components/chrome/SidebarExpandTrigger';
import { ThemeToggle } from '@/components/chrome/ThemeToggle';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/cn';
import { toast } from 'sonner';
import { PRIMARY_BUTTON_CLASS, PRIMARY_LIST_ITEM_SELECTED_CLASS, PRIMARY_TAB_ACTIVE_CLASS, PRIMARY_TAB_INACTIVE_HOVER_CLASS, PRIMARY_AI_PANEL_CLASS, PRIMARY_AI_PANEL_HOVER_CLASS, PRIMARY_ICON_GRADIENT_CLASS } from '@/lib/primaryButton';

type FormState = { name: string };
const EMPTY_FORM: FormState = { name: '' };

const MARKET_UPLOAD_TOKEN_KEY = 'finclaw.marketUploadToken';

function loadCachedUploadToken(): string {
  try {
    return localStorage.getItem(MARKET_UPLOAD_TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveCachedUploadToken(token: string) {
  try {
    if (token) {
      localStorage.setItem(MARKET_UPLOAD_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(MARKET_UPLOAD_TOKEN_KEY);
    }
  } catch {
    /* private mode */
  }
}


type DetailTab = 'profile' | 'persona' | 'skills' | 'config';

const DETAIL_TAB_STORAGE_KEY = 'finclaw.agents.detailTab';

const DETAIL_TABS: Array<{
  id: DetailTab;
  label: string;
  icon: typeof IconFileDescription;
}> = [
  { id: 'profile', label: '基本资料', icon: IconUser },
  { id: 'persona', label: '人设', icon: IconFileDescription },
  { id: 'skills', label: 'Skills', icon: IconPuzzle },
  { id: 'config', label: '模型', icon: IconCpu },
];

function loadDetailTab(): DetailTab {
  try {
    const v = sessionStorage.getItem(DETAIL_TAB_STORAGE_KEY);
    if (v === 'profile' || v === 'persona' || v === 'skills' || v === 'config') return v;
  } catch {
    /* private mode */
  }
  return 'profile';
}

function saveDetailTab(tab: DetailTab) {
  try {
    sessionStorage.setItem(DETAIL_TAB_STORAGE_KEY, tab);
  } catch {
    /* private mode */
  }
}

export default function AgentsPage() {
  const { agents, agentNames, avatarRevision, currentAgent, selectAgent, refresh, createAgent, deleteAgent } = useAgents();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const agentParam = searchParams.get('agent');
  const appliedAgentParamRef = useRef(false);

  const [search, setSearch] = useState('');
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [selectedModel, setSelectedModel] = useState('');
  const [modelsMeta, setModelsMeta] = useState<AgentModelsMeta>({
    models: [],
    loading: false,
    error: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [agentRuntime, setAgentRuntime] = useState<AgentDetailBody | null>(null);
  const [agentRuntimeError, setAgentRuntimeError] = useState<string | null>(null);
  const [detailTab, setDetailTabState] = useState<DetailTab>(loadDetailTab);
  const [personaDirty, setPersonaDirty] = useState(false);
  const [skillFile, setSkillFile] = useState<SkillFileTarget | null>(null);
  const [skillsRefreshRev, setSkillsRefreshRev] = useState(0);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { setNavigationGuard } = useNavigationGuard();
  const agentsListResize = useHorizontalResize({
    storageKey: PANEL_WIDTH_KEYS.agentsList,
    defaultWidth: PANEL_WIDTH_DEFAULTS.agentsList,
    ...PANEL_WIDTH_LIMITS.agentsList,
  });

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [showUploadToken, setShowUploadToken] = useState(false);
  const [uploadForm, setUploadForm] = useState({ displayName: '', summary: '', uploadToken: '' });
  const [summaryPolishOpen, setSummaryPolishOpen] = useState(false);
  const [summaryPolishPrompt, setSummaryPolishPrompt] = useState('');
  const [summaryPolishing, setSummaryPolishing] = useState(false);
  const [summaryPolishError, setSummaryPolishError] = useState<string | null>(null);

  const setDetailTab = useCallback((tab: DetailTab) => {
    saveDetailTab(tab);
    setDetailTabState(tab);
  }, []);

  const confirmLeavePersona = useCallback(async () => {
    if (!personaDirty) return true;
    return confirm({
      title: '未保存的修改',
      description: '人设有未保存的修改，离开后将丢失。确定要离开吗？',
      confirmText: '离开',
      cancelText: '继续编辑',
    });
  }, [confirm, personaDirty]);

  const handleDetailTabChange = useCallback(
    async (tab: DetailTab) => {
      if (tab === detailTab) return;
      if (detailTab === 'persona' && tab !== 'persona') {
        if (!(await confirmLeavePersona())) return;
      }
      setDetailTab(tab);
    },
    [confirmLeavePersona, detailTab, setDetailTab],
  );

  const handleSelectAgent = useCallback(
    async (name: string) => {
      if (name === selectedName) return;
      if (detailTab === 'persona') {
        if (!(await confirmLeavePersona())) return;
      }
      setSelectedName(name);
    },
    [confirmLeavePersona, detailTab, selectedName],
  );

  useEffect(() => {
    if (detailTab !== 'persona') setPersonaDirty(false);
  }, [detailTab]);

  useEffect(() => {
    if (detailTab === 'persona' && personaDirty) {
      setNavigationGuard(confirmLeavePersona);
    } else {
      setNavigationGuard(null);
    }
    return () => setNavigationGuard(null);
  }, [confirmLeavePersona, detailTab, personaDirty, setNavigationGuard]);

  useEffect(() => { void refresh(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter((a) => a.name.toLowerCase().includes(q));
  }, [agents, search]);

  const sortedFiltered = useMemo(
    () => [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN')),
    [filtered],
  );

  // 仅在校正无效选中项时同步，避免切换列表项时因 currentAgent 变化触发多余更新
  useEffect(() => {
    setSelectedName((prev) => {
      if (prev && agentNames.includes(prev)) return prev;
      if (currentAgent && agentNames.includes(currentAgent)) return currentAgent;
      return agentNames[0] ?? null;
    });
  }, [agentNames, currentAgent]);

  // 来自对话页「详情」跳转：?agent=xxx 时优先定位到该 Agent（仅应用一次，避免覆盖后续手动选择）
  useEffect(() => {
    if (appliedAgentParamRef.current) return;
    if (agentParam && agentNames.includes(agentParam)) {
      setSelectedName(agentParam);
      appliedAgentParamRef.current = true;
    }
  }, [agentParam, agentNames]);

  const handleChatWithAgent = useCallback(
    (name: string) => {
      selectAgent(name);
      navigate('/chat');
    },
    [navigate, selectAgent],
  );

  const detailName = selectedName;
  const detailSummary = useMemo(() => findAgentSummary(agents, detailName), [agents, detailName]);

  const openAddForm = useCallback(() => {
    void refresh();
    setForm(EMPTY_FORM);
    setSelectedModel('');
    setModelsMeta({ models: [], loading: false, error: null });
    setSubmitError(null);
    setAddOpen(true);
  }, [refresh]);

  const handleModelsMetaChange = useCallback((meta: AgentModelsMeta) => {
    setModelsMeta(meta);
  }, []);

  // 切换 Agent 或离开 Skills 标签时关闭已打开的 skill 文件
  useEffect(() => {
    setSkillFile(null);
  }, [detailName, detailTab]);

  const loadSkillContent = useCallback(
    (_agent: string, _file: string): Promise<string> => {
      if (!detailName || !skillFile) return Promise.reject(new Error('未选择 skill 文件'));
      return getAgentSkillFile(detailName, skillFile.source, skillFile.skill, skillFile.file).then(
        (b) => b.content,
      );
    },
    [detailName, skillFile],
  );

  const saveSkillContent = useCallback(
    async (content: string) => {
      if (!detailName || !skillFile) return;
      await writeAgentSkillFile(detailName, skillFile.source, skillFile.skill, skillFile.file, content);
    },
    [detailName, skillFile],
  );

  const handleDeleteSkill = useCallback(
    async (source: string, skill: string, name: string) => {
      if (!detailName) return;
      const ok = await confirm({
        title: `删除 Skill 包「${name}」`,
        description: '将永久删除该 Skill 包及其全部文件，操作不可恢复。',
        confirmText: '删除',
        danger: true,
      });
      if (!ok) return;
      try {
        await deleteAgentSkill(detailName, source, skill);
        if (skillFile && skillFile.source === source && skillFile.skill === skill) {
          setSkillFile(null);
        }
        setSkillsRefreshRev((n) => n + 1);
      } catch (err) {
        window.alert(err instanceof Error ? err.message : '删除失败');
      }
    },
    [detailName, skillFile, confirm],
  );

  const handleDownloadSkillPath = useCallback(
    async (source: string, skill: string, relPath: string) => {
      if (!detailName) return;
      try {
        await downloadAgentSkillPath(detailName, source, skill, relPath);
      } catch (err) {
        window.alert(err instanceof Error ? err.message : '下载失败');
      }
    },
    [detailName],
  );

  const handleShareSkillPath = useCallback(
    async (source: string, skill: string, relPath: string, isDir?: boolean) => {
      if (!detailName) return;
      if (isDir || !relPath.trim()) {
        toast.error('暂不支持分享文件夹');
        return;
      }
      try {
        const { url } = await createAgentAssetShare(detailName, {
          kind: 'skill',
          source,
          skill_dir: skill,
          path: relPath,
        });
        await copyToClipboard(url);
        toast.success('分享链接已复制到剪贴板');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '创建分享失败');
      }
    },
    [detailName],
  );

  const handleDeleteSkillPath = useCallback(
    async (source: string, skill: string, relPath: string, isDir: boolean, skillName: string) => {
      if (!detailName) return;
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
        await deleteAgentSkillPath(detailName, source, skill, relPath);
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
    [detailName, skillFile, confirm],
  );

  useEffect(() => {
    if (!detailName) { setAgentRuntime(null); setAgentRuntimeError(null); return; }
    let cancelled = false;
    setAgentRuntimeError(null);
    getAgent(detailName)
      .then((d) => { if (!cancelled) setAgentRuntime(d); })
      .catch((err) => { if (!cancelled) { setAgentRuntime(null); setAgentRuntimeError(err instanceof Error ? err.message : String(err)); } });
    return () => { cancelled = true; };
  }, [detailName]);

  const addNameConflict = useMemo(
    () => form.name.trim().length > 0 && agentNames.includes(form.name.trim()),
    [form.name, agentNames],
  );

  const formValid = useMemo(() => {
    if (!form.name.trim() || addNameConflict) return false;
    return isAgentModelSetupValid(selectedModel, modelsMeta);
  }, [form, selectedModel, modelsMeta, addNameConflict]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValid || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const createdName = form.name.trim();
      await createAgent({ name: createdName, model: selectedModel });
      setForm(EMPTY_FORM);
      setAddOpen(false);
      setSelectedName(createdName);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async (name: string) => {
    if (pendingDelete) return;
    const ok = await confirm({
      title: `删除 Agent「${name}」`,
      description:
        '将停止该 Agent 并永久删除其工作区、配置与 Skills；进行中的会话会被终止，操作不可恢复。',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    setPendingDelete(name);
    try {
      await deleteAgent(name);
      setSelectedName((prev) => (prev === name ? null : prev));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingDelete(null);
    }
  };

  const openUploadDialog = useCallback(() => {
    if (!detailName) return;
    setUploadForm({ displayName: detailName, summary: '', uploadToken: loadCachedUploadToken() });
    setUploadError(null);
    setUploadSuccess(false);
    setShowUploadToken(false);
    setSummaryPolishOpen(false);
    setSummaryPolishPrompt('');
    setSummaryPolishError(null);
    setUploadOpen(true);
  }, [detailName]);

  const onPolishSummary = useCallback(async () => {
    if (!detailName || summaryPolishing || uploading) return;
    setSummaryPolishing(true);
    setSummaryPolishError(null);
    try {
      const { summary } = await generateMarketSummary(detailName, {
        prompt: summaryPolishPrompt.trim() || undefined,
        current_summary: uploadForm.summary.trim() || undefined,
        display_name: uploadForm.displayName.trim() || detailName,
      });
      setUploadForm((s) => ({ ...s, summary }));
    } catch (err) {
      setSummaryPolishError(err instanceof Error ? err.message : String(err));
    } finally {
      setSummaryPolishing(false);
    }
  }, [detailName, summaryPolishing, uploading, summaryPolishPrompt, uploadForm.displayName, uploadForm.summary]);

  const onUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailName || uploading) return;
    setUploading(true);
    setUploadError(null);
    try {
      await uploadAgentToMarket({
        agentName: detailName,
        displayName: uploadForm.displayName.trim() || undefined,
        summary: uploadForm.summary.trim() || undefined,
        category: 'picoclaw',
        uploadToken: uploadForm.uploadToken.trim() || undefined,
      });
      setUploadSuccess(true);
      saveCachedUploadToken(uploadForm.uploadToken.trim());
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  if (searchParams.get('market') === '1') {
    return <Navigate to="/agents/market" replace />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border/50 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <SidebarExpandTrigger />
          <h1 className="text-base font-medium tracking-tight text-foreground/90">Agent 管理</h1>
          <Badge variant="outline" className="text-[10px]">{agents.length}</Badge>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <div className="flex gap-1 md:hidden">
            <Button
              variant="ghost"
              size="sm"
              className={cn('h-8 text-xs', PRIMARY_TAB_INACTIVE_HOVER_CLASS, 'dark:hover:bg-violet-500/14')}
              onClick={openAddForm}
            >
              添加 Agent
            </Button>
          </div>
          <ThemeToggle />
        </div>
      </div>

      {/* Content */}
      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden p-3">
        {/* Left Pane - Agent List */}
        <div className="hidden min-h-0 shrink-0 md:flex">
          <div
            className="@container flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card"
            style={{ width: agentsListResize.width }}
          >
          <div className="space-y-2 border-b border-border/50 p-4">
            <Button
              variant="outline"
              size="sm"
              className={cn('w-full text-xs', PRIMARY_TAB_INACTIVE_HOVER_CLASS, 'dark:hover:bg-violet-500/14')}
              onClick={openAddForm}
            >
              添加 Agent
            </Button>
            <Input
              placeholder="搜索 Agent..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <ScrollArea className="min-w-0 flex-1">
            {filtered.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {search.trim() ? '没有匹配的 Agent' : '暂无 Agent'}
              </div>
            ) : (
              <div className="p-2">
                {sortedFiltered.map((agent) => {
                  const { name } = agent;
                  const chatting = name === currentAgent;
                  const selected = name === selectedName;
                  const deleting = pendingDelete === name;
                  return (
                    <div
                      key={name}
                      className={cn(
                        'grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center overflow-hidden rounded-lg',
                        selected
                          ? PRIMARY_LIST_ITEM_SELECTED_CLASS
                          : cn('text-foreground', PRIMARY_TAB_INACTIVE_HOVER_CLASS),
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => void handleSelectAgent(name)}
                        className="flex min-w-0 items-center gap-2 overflow-hidden rounded-lg px-2 py-2 text-left"
                        title={name}
                      >
                        <AgentAvatar
                          name={name}
                          hasAvatar={agent.has_avatar}
                          avatarRevision={avatarRevision}
                          size="sm"
                          className="shrink-0"
                        />
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{name}</span>
                        {chatting && (
                          <Badge variant="secondary" className="shrink-0 text-[10px]">
                            当前
                          </Badge>
                        )}
                      </button>
                      <div className="flex shrink-0 items-center pr-0.5">
                        <button
                          type="button"
                          className={cn(
                            'flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors',
                            'hover:bg-violet-500/12 hover:text-violet-600 dark:hover:text-violet-300',
                          )}
                          onClick={() => handleChatWithAgent(name)}
                          title="去对话"
                          aria-label="与该 Agent 对话"
                        >
                          <IconMessageCircle className="size-3.5" stroke={1.75} />
                        </button>
                        <button
                          type="button"
                          className={cn(
                            'flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors',
                            'hover:bg-destructive/10 hover:text-destructive',
                            deleting && 'pointer-events-none opacity-50',
                          )}
                          onClick={() => void onDelete(name)}
                          disabled={deleting}
                          title="删除 Agent"
                          aria-label="删除 Agent"
                        >
                          <IconTrash className="size-3.5" stroke={1.75} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
          </div>
          <PanelResizeHandle overlay={false} {...agentsListResize.handleProps} />
        </div>

        {/* Right Pane - Detail */}
        <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card overflow-hidden">
          {detailName ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/50 px-4 py-2.5">
                <nav className="flex flex-wrap gap-1.5">
                  {DETAIL_TABS.map(({ id, label, icon: Icon }) => {
                    const active = detailTab === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => void handleDetailTabChange(id)}
                        className={cn(
                          'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm transition-colors',
                          active
                            ? PRIMARY_TAB_ACTIVE_CLASS
                            : cn('bg-muted/50 text-muted-foreground', PRIMARY_TAB_INACTIVE_HOVER_CLASS),
                        )}
                      >
                        <Icon className="h-4 w-4" stroke={active ? 2 : 1.75} />
                        {label}
                      </button>
                    );
                  })}
                </nav>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    className={PRIMARY_BUTTON_CLASS}
                    onClick={openUploadDialog}
                    disabled={uploading}
                  >
                    <IconUpload className="mr-1.5 h-3.5 w-3.5" stroke={1.75} />
                    发布到市场
                  </Button>
                </div>
              </div>

              {detailTab === 'profile' ? (
                <ScrollArea className="flex-1">
                  <div className="max-w-3xl p-4 md:p-5">
                    <Card size="sm">
                      <CardContent className="p-4 md:p-5">
                        <AgentProfileSection
                          agentName={detailName}
                          hasAvatar={detailSummary?.has_avatar ?? agentRuntime?.has_avatar ?? false}
                          onRenamed={setSelectedName}
                        />
                      </CardContent>
                    </Card>
                  </div>
                </ScrollArea>
              ) : detailTab === 'persona' ? (
                <AgentPersonaEditor
                  key={detailName}
                  agentName={detailName}
                  className="min-h-0 flex-1"
                  onDirtyChange={setPersonaDirty}
                />
              ) : detailTab === 'skills' ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <AgentSkillsPanel
                    key={detailName}
                    agentName={detailName}
                    className="min-h-0 flex-1"
                    onOpenFile={setSkillFile}
                    activeFileKey={
                      skillFile ? skillFileKey(skillFile.source, skillFile.skill, skillFile.file) : null
                    }
                    onDeleteSkill={handleDeleteSkill}
                    onDeleteSkillPath={handleDeleteSkillPath}
                    onDownloadSkillPath={handleDownloadSkillPath}
                    onShareSkillPath={handleShareSkillPath}
                    refreshRev={skillsRefreshRev}
                  />
                </div>
              ) : (
                <ScrollArea className="flex-1">
                  <div className="max-w-3xl p-4 md:p-5">
                    {agentRuntimeError && (
                      <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-destructive">⚠️ {agentRuntimeError}</div>
                    )}

                    <p className="mb-4 text-xs text-muted-foreground">
                      点击按钮选择模型即可热切换，当前对话与历史将保留。接入参数请在左侧栏「模型」页面管理。
                    </p>

                    {detailName && (
                      <ModelSwitcherMenu
                        agentName={detailName}
                        variant="panel"
                        active={detailTab === 'config'}
                      />
                    )}
                  </div>
                </ScrollArea>
              )}
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="text-4xl" aria-hidden>💬</div>
              <div className="text-sm font-medium text-muted-foreground">选择左侧 Agent</div>
              <p className="max-w-xs text-xs text-muted-foreground">点选列表中的条目进行管理</p>
            </div>
          )}
        </div>
      </div>

      {detailName && skillFile && (
        <DocReadingPanel
          key={skillFileKey(skillFile.source, skillFile.skill, skillFile.file)}
          agentName={detailName}
          filePath={`${skillFile.skill}/${skillFile.file}`}
          loadContent={loadSkillContent}
          onClose={() => setSkillFile(null)}
          onSave={saveSkillContent}
          onShare={() =>
            void handleShareSkillPath(skillFile.source, skillFile.skill, skillFile.file)
          }
        />
      )}

      {confirmDialog}

      <AgentCreateDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="添加 Agent"
        name={form.name}
        onNameChange={(name) => setForm((s) => ({ ...s, name }))}
        nameConflict={addNameConflict}
        selectedModel={selectedModel}
        onSelectedModelChange={setSelectedModel}
        onModelsMetaChange={handleModelsMetaChange}
        busy={submitting}
        submitDisabled={!formValid}
        error={submitError}
        onSubmit={onSubmit}
        onCancel={() => setSubmitError(null)}
      />

      {/* Upload to Marketplace Dialog */}
      <Dialog.Root
        open={uploadOpen}
        onOpenChange={(open) => {
          if (!open && !uploading) {
            setUploadOpen(false);
            setUploadError(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[1200] bg-black/45 supports-backdrop-filter:backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <Dialog.Content
            className={cn(
              'fixed left-1/2 top-1/2 z-[1201] w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2',
              'max-h-[min(90vh,640px)] overflow-y-auto rounded-xl border border-border bg-background p-5 shadow-2xl',
              'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            )}
          >
            <Dialog.Title className="text-base font-semibold text-foreground">发布到市场</Dialog.Title>
            <Dialog.Description className="mt-1 text-xs text-muted-foreground">
              将 Agent「{detailName}」的工作区打包上传至 AgentHub 市场。
            </Dialog.Description>

            {uploadSuccess ? (
              <div className="mt-4 rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-center">
                <p className="text-sm font-medium text-green-700 dark:text-green-300">✅ 提交成功！</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Agent 已提交至 AgentHub，待管理员审批通过后即可在市场展示，其他用户可搜索并安装。
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-3"
                  onClick={() => setUploadOpen(false)}
                >
                  完成
                </Button>
              </div>
            ) : (
              <form onSubmit={onUpload} className="mt-4 flex flex-col gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Agent 名称</label>
                  <Input value={detailName ?? ''} disabled className="bg-muted/50" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">上传 Token</label>
                  <div className="relative">
                    <Input
                      type={showUploadToken ? 'text' : 'password'}
                      value={uploadForm.uploadToken}
                      onChange={(e) => setUploadForm((s) => ({ ...s, uploadToken: e.target.value }))}
                      placeholder="AgentHub 上传令牌（首次输入后自动缓存）"
                      disabled={uploading}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowUploadToken((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                    >
                      {showUploadToken ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">显示名称</label>
                  <Input
                    value={uploadForm.displayName}
                    onChange={(e) => setUploadForm((s) => ({ ...s, displayName: e.target.value }))}
                    placeholder="在市场中显示的名称（默认为 Agent 名称）"
                    disabled={uploading}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">简介</label>
                  <div className={cn('mb-2 overflow-hidden rounded-lg', PRIMARY_AI_PANEL_CLASS)}>
                    <button
                      type="button"
                      onClick={() => setSummaryPolishOpen((open) => !open)}
                      disabled={summaryPolishing || uploading}
                      aria-expanded={summaryPolishOpen}
                      className={cn(
                        'flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors',
                        PRIMARY_AI_PANEL_HOVER_CLASS,
                        (summaryPolishing || uploading) && 'cursor-not-allowed opacity-70',
                      )}
                    >
                      <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-md', PRIMARY_ICON_GRADIENT_CLASS)}>
                        <IconSparkles className="size-3.5" stroke={1.75} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-medium text-violet-800 dark:text-violet-200">AI 润色</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {summaryPolishOpen ? '收起提示词' : '根据人设与 Skills 生成或润色简介'}
                        </span>
                      </span>
                      <IconChevronDown
                        className={cn(
                          'size-4 shrink-0 text-violet-600/70 transition-transform dark:text-violet-300/70',
                          summaryPolishOpen && 'rotate-180',
                        )}
                        stroke={1.75}
                        aria-hidden
                      />
                    </button>
                    {summaryPolishOpen && (
                      <div className="border-t border-violet-500/15 bg-background/60 px-3 py-2.5">
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Input
                            value={summaryPolishPrompt}
                            onChange={(e) => setSummaryPolishPrompt(e.target.value)}
                            placeholder="例如：突出量化选股与财报分析能力，语气专业简洁"
                            disabled={summaryPolishing || uploading}
                            className="min-w-0 flex-1 border-violet-500/20 text-sm focus-visible:ring-violet-500/30"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                void onPolishSummary();
                              }
                            }}
                          />
                          <Button
                            type="button"
                            size="sm"
                            className={cn('shrink-0 sm:min-w-[5.5rem]', PRIMARY_BUTTON_CLASS)}
                            disabled={summaryPolishing || uploading}
                            onClick={() => void onPolishSummary()}
                          >
                            {summaryPolishing ? '润色中…' : '开始润色'}
                          </Button>
                        </div>
                        {summaryPolishError && (
                          <p className="mt-2 text-xs text-destructive">{summaryPolishError}</p>
                        )}
                      </div>
                    )}
                  </div>
                  <textarea
                    value={uploadForm.summary}
                    onChange={(e) => setUploadForm((s) => ({ ...s, summary: e.target.value }))}
                    placeholder="简短描述该 Agent 的功能与特点..."
                    disabled={uploading || summaryPolishing}
                    rows={3}
                    className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>

                {uploadError && (
                  <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-destructive">
                    ⚠️ {uploadError}
                  </div>
                )}

                <div className="flex justify-end gap-2 border-t border-border/50 pt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={uploading}
                    onClick={() => {
                      setUploadOpen(false);
                      setUploadError(null);
                    }}
                  >
                    取消
                  </Button>
                  <Button type="submit" size="sm" className={PRIMARY_BUTTON_CLASS} disabled={uploading}>
                    {uploading ? '上传中…' : '确认上传'}
                  </Button>
                </div>
              </form>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}