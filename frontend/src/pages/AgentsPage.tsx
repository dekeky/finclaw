import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  IconAdjustmentsHorizontal,
  IconArrowLeft,
  IconBuildingWarehouse,
  IconChevronDown,
  IconEye,
  IconEyeOff,
  IconFileDescription,
  IconPlus,
  IconPuzzle,
  IconRobot,
  IconSparkles,
  IconUpload,
  IconUser,
} from '@tabler/icons-react';
import { useRequireAuth } from '@/hooks/useRequireAuth';
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
import { AgentGalleryTile } from '@/components/agent/AgentGalleryTile';
import { AgentMarketPanel } from '@/components/AgentMarketPanel';
import { AgentProfileSection } from '../components/AgentProfileSection';
import { AgentCreateDialog } from '../components/AgentCreateDialog';
import {
  isAgentModelSetupValid,
  type AgentModelsMeta,
} from '../components/AgentModelSetupSection';
import { AgentRuntimeSettingsPanel } from '@/components/AgentRuntimeSettingsPanel';
import { AgentPersonaEditor } from '../components/AgentPersonaEditor';
import { AgentSkillsPanel, skillFileKey, type SkillFileTarget } from '../components/AgentSkillsPanel';
import { createAgentAssetShare } from '../api/agentAssets';
import { copyToClipboard } from '../lib/clipboard';
import { DocReadingPanel } from '../components/DocReadingPanel';
import { uploadAgentToMarket, generateMarketSummary } from '../api/agentMarket';
import { useNavigationGuard } from '../state/navigationGuard';
import { galleryShellClassName } from '@/components/strategy/strategyGallery';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SidebarExpandTrigger } from '@/components/chrome/SidebarExpandTrigger';
import { ThemeToggle } from '@/components/chrome/ThemeToggle';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/cn';
import { toast } from 'sonner';
import {
  PRIMARY_BUTTON_CLASS,
  PRIMARY_AI_PANEL_CLASS,
  PRIMARY_AI_PANEL_HOVER_CLASS,
  PRIMARY_ICON_GRADIENT_CLASS,
} from '@/lib/primaryButton';

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
  { id: 'config', label: '运行时设置', icon: IconAdjustmentsHorizontal },
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
  const { requireAuth } = useRequireAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const agentParam = searchParams.get('agent');
  const appliedAgentParamRef = useRef(false);

  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [showMarket, setShowMarket] = useState(false);
  const [marketDetailOpen, setMarketDetailOpen] = useState(false);
  const [marketPanelKey, setMarketPanelKey] = useState(0);
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

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [showUploadToken, setShowUploadToken] = useState(false);
  const [uploadForm, setUploadForm] = useState({ displayName: '', summary: '', uploadToken: '' });
  const [summaryPolishOpen, setSummaryPolishOpen] = useState(false);
  const [summaryPolishPrompt, setSummaryPolishPrompt] = useState('');
  const [summaryPolishing, setSummaryPolishing] = useState(false);
  const [runtimeSettingsRev, setRuntimeSettingsRev] = useState(0);
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
      setShowMarket(false);
      setMarketDetailOpen(false);
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

  useEffect(() => {
    const state = location.state as { showMarket?: boolean } | null;
    if (state?.showMarket) {
      setShowMarket(true);
      setSelectedName(null);
      setMarketDetailOpen(false);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  useEffect(() => {
    if (searchParams.get('market') !== '1') return;
    setShowMarket(true);
    setSelectedName(null);
    setMarketDetailOpen(false);
    navigate('/agents', { replace: true });
  }, [searchParams, navigate]);

  const sortedAgents = useMemo(
    () => [...agents].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN')),
    [agents],
  );

  // 仅清除已删除的选中项；浏览态默认不自动选中
  useEffect(() => {
    setSelectedName((prev) => {
      if (prev && agentNames.includes(prev)) return prev;
      return null;
    });
  }, [agentNames]);

  // 来自对话页「详情」跳转：?agent=xxx 时优先定位到该 Agent（仅应用一次，避免覆盖后续手动选择）
  useEffect(() => {
    if (appliedAgentParamRef.current) return;
    if (agentParam && agentNames.includes(agentParam)) {
      setShowMarket(false);
      setMarketDetailOpen(false);
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

  const openMarket = useCallback(() => {
    setShowMarket(true);
    setSelectedName(null);
    setMarketDetailOpen(false);
  }, []);

  const openMine = useCallback(() => {
    setShowMarket(false);
    setMarketDetailOpen(false);
    setMarketPanelKey((n) => n + 1);
  }, []);

  const backToBrowse = useCallback(async () => {
    if (detailTab === 'persona') {
      if (!(await confirmLeavePersona())) return;
    }
    setSelectedName(null);
    setMarketDetailOpen(false);
  }, [confirmLeavePersona, detailTab]);

  const detailName = selectedName;
  const detailSummary = useMemo(() => findAgentSummary(agents, detailName), [agents, detailName]);
  const browsing = !selectedName && !marketDetailOpen;
  const browseMode = showMarket ? 'market' : 'mine';

  const openAddForm = useCallback(() => {
    if (!requireAuth()) return;
    void refresh();
    setForm(EMPTY_FORM);
    setSelectedModel('');
    setModelsMeta({ models: [], loading: false, error: null });
    setSubmitError(null);
    setAddOpen(true);
  }, [refresh, requireAuth]);

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
      if (!requireAuth() || !detailName || !skillFile) return;
      await writeAgentSkillFile(detailName, skillFile.source, skillFile.skill, skillFile.file, content);
    },
    [requireAuth, detailName, skillFile],
  );

  const handleDeleteSkill = useCallback(
    async (source: string, skill: string, name: string) => {
      if (!requireAuth() || !detailName) return;
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
    [requireAuth, detailName, skillFile, confirm],
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
      if (!requireAuth() || !detailName) return;
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
    [requireAuth, detailName],
  );

  const handleDeleteSkillPath = useCallback(
    async (source: string, skill: string, relPath: string, isDir: boolean, skillName: string) => {
      if (!requireAuth() || !detailName) return;
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
    [requireAuth, detailName, skillFile, confirm],
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
    if (!requireAuth() || !formValid || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const createdName = form.name.trim();
      await createAgent({ name: createdName, model: selectedModel });
      setForm(EMPTY_FORM);
      setAddOpen(false);
      setShowMarket(false);
      setMarketDetailOpen(false);
      setSelectedName(createdName);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async (name: string) => {
    if (!requireAuth()) return;
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
    if (!requireAuth() || !detailName) return;
    setUploadForm({ displayName: detailName, summary: '', uploadToken: loadCachedUploadToken() });
    setUploadError(null);
    setUploadSuccess(false);
    setShowUploadToken(false);
    setSummaryPolishOpen(false);
    setSummaryPolishPrompt('');
    setSummaryPolishError(null);
    setUploadOpen(true);
  }, [requireAuth, detailName]);

  const onPolishSummary = useCallback(async () => {
    if (!requireAuth() || !detailName || summaryPolishing || uploading) return;
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
  }, [requireAuth, detailName, summaryPolishing, uploading, summaryPolishPrompt, uploadForm.displayName, uploadForm.summary]);

  const onUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireAuth() || !detailName || uploading) return;
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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border/50 px-3">
        <SidebarExpandTrigger />
        {browsing ? (
          <SegmentedControl
            aria-label="Agent 视图"
            value={browseMode}
            options={[
              { value: 'mine', label: '我的 Agent' },
              { value: 'market', label: 'Agent 市场' },
            ]}
            onChange={(mode) => {
              if (mode === 'market') openMarket();
              else openMine();
            }}
          />
        ) : selectedName ? (
          <div className="flex min-w-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              onClick={() => void backToBrowse()}
              aria-label="返回 Agent 列表"
            >
              <IconArrowLeft className="size-4" />
            </Button>
            <span className="max-w-[240px] truncate px-1.5 text-[13px] font-medium" title={selectedName}>
              {selectedName}
            </span>
          </div>
        ) : null}
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {selectedName && detailName ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/50 bg-card/80 px-2.5 backdrop-blur-sm">
                <nav className="flex h-full items-stretch gap-0 self-stretch">
                  {DETAIL_TABS.map(({ id, label }) => {
                    const active = detailTab === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => void handleDetailTabChange(id)}
                        className={cn(
                          'h-full px-3 text-[12px] transition-colors',
                          active
                            ? 'border-b-2 border-violet-600 font-medium text-violet-700 dark:border-violet-400 dark:text-violet-300'
                            : 'border-b-2 border-transparent text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </nav>
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                  <Button
                    variant="default"
                    size="xs"
                    className={cn('gap-1', PRIMARY_BUTTON_CLASS)}
                    onClick={openUploadDialog}
                    disabled={uploading}
                  >
                    <IconUpload className="size-3.5" stroke={1.75} />
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
                      <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-destructive">
                        ⚠️ {agentRuntimeError}
                      </div>
                    )}

                    {detailName && (
                      <AgentRuntimeSettingsPanel
                        agentName={detailName}
                        active={detailTab === 'config'}
                        reloadToken={runtimeSettingsRev}
                        onModelSwitched={() => setRuntimeSettingsRev((v) => v + 1)}
                      />
                    )}
                  </div>
                </ScrollArea>
              )}
            </div>
          ) : showMarket ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <AgentMarketPanel
                key={marketPanelKey}
                existingAgents={agentNames}
                hideTitle
                onClose={openMine}
                onDetailOpenChange={setMarketDetailOpen}
                onInstalled={(name) => {
                  setShowMarket(false);
                  setMarketDetailOpen(false);
                  setSelectedName(name);
                  void refresh();
                }}
              />
            </div>
          ) : (
              <ScrollArea className="min-h-0 flex-1">
                <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
                  {sortedAgents.length === 0 ? (
                    <div className="px-4 py-16 text-center">
                      <div className="mx-auto flex max-w-md flex-col items-center gap-4">
                        <div className="flex size-16 items-center justify-center rounded-2xl border border-border/60 bg-card shadow-sm">
                          <IconRobot className="size-7 text-primary" stroke={1.5} />
                        </div>
                        <div className="space-y-1.5">
                          <h3 className="text-base font-semibold tracking-tight">开始你的第一个 Agent</h3>
                          <p className="text-sm leading-relaxed text-muted-foreground">
                            从空白 Agent 起步，或从 Agent 市场安装社区模板，随后即可配置人设、Skills 与模型。
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <Button type="button" className={PRIMARY_BUTTON_CLASS} onClick={openAddForm}>
                            <IconPlus className="size-4" />
                            新建 Agent
                          </Button>
                          <Button type="button" variant="outline" onClick={openMarket}>
                            <IconBuildingWarehouse className="size-4" stroke={1.75} />
                            浏览 Agent 市场
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {sortedAgents.map((agent) => {
                        const { name } = agent;
                        const chatting = name === currentAgent;
                        return (
                          <AgentGalleryTile
                            key={name}
                            title={name}
                            avatar={{
                              name,
                              hasAvatar: agent.has_avatar,
                              avatarRevision,
                            }}
                            corner={
                              chatting ? (
                                <span className="rounded-md border border-border/70 bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                  当前
                                </span>
                              ) : null
                            }
                            onOpen={() => void handleSelectAgent(name)}
                            onChat={() => handleChatWithAgent(name)}
                            onDelete={() => void onDelete(name)}
                            deleting={pendingDelete === name}
                          />
                        );
                      })}
                      <button
                        type="button"
                        onClick={openAddForm}
                        className={cn(
                          galleryShellClassName(),
                          'min-h-[120px] items-center justify-center border-dashed bg-transparent p-4 text-muted-foreground',
                          'hover:border-primary/40 hover:bg-muted/30 hover:text-foreground',
                        )}
                      >
                        <span className="flex flex-col items-center gap-2">
                          <span className="flex size-10 items-center justify-center rounded-xl border border-dashed border-current/30">
                            <IconPlus className="size-5" stroke={1.75} />
                          </span>
                          <span className="text-sm font-medium">新建 Agent</span>
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </ScrollArea>
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