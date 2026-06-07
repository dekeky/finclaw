import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { Navigate, useSearchParams } from 'react-router-dom';
import { IconCpu, IconChevronDown, IconEye, IconEyeOff, IconFileDescription, IconPuzzle, IconSparkles, IconTrash, IconUpload, IconUser } from '@tabler/icons-react';
import { useAgents, findAgentSummary } from '../state/agents';
import {
  getAgent,
  getAgentSkillFile,
  writeAgentSkillFile,
  deleteAgentSkill,
  deleteAgentSkillPath,
  type AgentDetailBody,
} from '../api/agents';
import { AgentAvatar } from '../components/AgentAvatar';
import { AgentProfileSection } from '../components/AgentProfileSection';
import { AgentCreateDialog } from '../components/AgentCreateDialog';
import { isAgentModelSetupValid, type ReuseAgentSourceMeta } from '../components/AgentModelSetupSection';
import { AgentPersonaEditor } from '../components/AgentPersonaEditor';
import { AgentSkillsPanel, skillFileKey, type SkillFileTarget } from '../components/AgentSkillsPanel';
import { DocReadingPanel } from '../components/DocReadingPanel';
import { ModelConnectivityCheck } from '../components/ModelConnectivityCheck';
import { uploadAgentToMarket, generateMarketSummary } from '../api/agentMarket';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useNavigationGuard } from '../state/navigationGuard';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SidebarExpandTrigger } from '@/components/chrome/SidebarExpandTrigger';
import { ThemeToggle } from '@/components/chrome/ThemeToggle';
import { AGENT_MODEL_PRESETS } from '@/lib/agentModelPresets';
import { cn } from '@/lib/cn';
import { PRIMARY_BUTTON_CLASS, PRIMARY_LIST_ITEM_SELECTED_CLASS, PRIMARY_TAB_ACTIVE_CLASS, PRIMARY_TAB_INACTIVE_HOVER_CLASS, PRIMARY_AI_PANEL_CLASS, PRIMARY_AI_PANEL_HOVER_CLASS, PRIMARY_ICON_GRADIENT_CLASS } from '@/lib/primaryButton';

type FormState = { name: string; model: string; apiBase: string; apiKey: string };
type EditFormState = { model: string; apiBase: string; apiKey: string };
type CredMode = 'reuse' | 'manual';
const EMPTY_FORM: FormState = { name: '', model: '', apiBase: '', apiKey: '' };
const EMPTY_EDIT_FORM: EditFormState = { model: '', apiBase: '', apiKey: '' };

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

function ModelFieldHint() {
  return (
    <p className="mt-1 text-[11px] text-muted-foreground">
      格式为 <span className="font-mono">服务商/模型名</span>，例如{' '}
      <span className="font-mono">deepseek/deepseek-chat</span>、{' '}
      <span className="font-mono">openai/gpt-4o</span>。
    </p>
  );
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
  { id: 'config', label: '模型配置', icon: IconCpu },
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
  const { agents, agentNames, avatarRevision, currentAgent, refresh, createAgent, updateAgent, deleteAgent } = useAgents();
  const [searchParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [credMode, setCredMode] = useState<CredMode>('manual');
  const [reuseAgent, setReuseAgent] = useState('');
  const [reuseMeta, setReuseMeta] = useState<ReuseAgentSourceMeta>({
    source: null,
    loading: false,
    error: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [editConfigOpen, setEditConfigOpen] = useState(false);
  const [editFetchLoading, setEditFetchLoading] = useState(false);
  const [editFetchError, setEditFetchError] = useState<string | null>(null);
  const [editBaseline, setEditBaseline] = useState<AgentDetailBody | null>(null);
  const editLoadGenRef = useRef(0);
  const [editForm, setEditForm] = useState<EditFormState>(EMPTY_EDIT_FORM);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editSubmitError, setEditSubmitError] = useState<string | null>(null);
  const [agentRuntime, setAgentRuntime] = useState<AgentDetailBody | null>(null);
  const [agentRuntimeLoading, setAgentRuntimeLoading] = useState(false);
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
  const [uploadForm, setUploadForm] = useState({ displayName: '', summary: '', category: 'picoclaw', uploadToken: '' });
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

  const detailName = selectedName;
  const detailSummary = useMemo(() => findAgentSummary(agents, detailName), [agents, detailName]);

  const openAddForm = useCallback(() => {
    void refresh();
    setForm(EMPTY_FORM);
    setCredMode(agentNames.length > 0 ? 'reuse' : 'manual');
    setReuseAgent(agentNames[0] ?? '');
    setReuseMeta({ source: null, loading: false, error: null });
    setSubmitError(null);
    setAddOpen(true);
  }, [agentNames, refresh]);

  const handleReuseMetaChange = useCallback((meta: ReuseAgentSourceMeta) => {
    setReuseMeta(meta);
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
        setSkillsRefreshRev((n) => n + 1);
      } catch (err) {
        window.alert(err instanceof Error ? err.message : '删除失败');
      }
    },
    [detailName, skillFile, confirm],
  );

  useEffect(() => {
    setEditConfigOpen(false);
    editLoadGenRef.current += 1;
    setEditFetchLoading(false);
    setEditFetchError(null);
    setEditBaseline(null);
    setEditForm(EMPTY_EDIT_FORM);
    setEditSubmitError(null);
  }, [detailName]);

  const loadLatestForEdit = useCallback(async () => {
    if (!detailName) return;
    const gen = ++editLoadGenRef.current;
    setEditFetchLoading(true);
    setEditFetchError(null);
    setEditBaseline(null);
    setEditSubmitError(null);
    setEditForm(EMPTY_EDIT_FORM);
    try {
      const d = await getAgent(detailName);
      if (gen !== editLoadGenRef.current) return;
      setAgentRuntime(d);
      setEditBaseline(d);
      const mp = d.model_provider;
      setEditForm({ model: mp.model ?? '', apiBase: mp.api_base ?? '', apiKey: '' });
    } catch (err) {
      if (gen !== editLoadGenRef.current) return;
      setEditFetchError(err instanceof Error ? err.message : String(err));
    } finally {
      if (gen === editLoadGenRef.current) setEditFetchLoading(false);
    }
  }, [detailName]);

  useEffect(() => {
    if (!detailName) { setAgentRuntime(null); setAgentRuntimeError(null); setAgentRuntimeLoading(false); return; }
    let cancelled = false;
    setAgentRuntimeLoading(true);
    setAgentRuntimeError(null);
    getAgent(detailName)
      .then((d) => { if (!cancelled) { setAgentRuntime(d); setAgentRuntimeLoading(false); } })
      .catch((err) => { if (!cancelled) { setAgentRuntime(null); setAgentRuntimeLoading(false); setAgentRuntimeError(err instanceof Error ? err.message : String(err)); } });
    return () => { cancelled = true; };
  }, [detailName]);

  const addNameConflict = useMemo(
    () => form.name.trim().length > 0 && agentNames.includes(form.name.trim()),
    [form.name, agentNames],
  );

  const formValid = useMemo(() => {
    if (!form.name.trim() || addNameConflict) return false;
    return isAgentModelSetupValid(
      credMode,
      { model: form.model, apiBase: form.apiBase, apiKey: form.apiKey },
      reuseMeta,
      reuseAgent,
    );
  }, [form, credMode, reuseAgent, reuseMeta, addNameConflict]);

  const editFormValid = useMemo(() => {
    const hasStoredKey = editBaseline?.model_provider.has_api_key === true;
    return (
      !!editBaseline
      && !editFetchLoading
      && !editFetchError
      && editForm.model.trim()
      && editForm.apiBase.trim()
      && (editForm.apiKey.trim().length > 0 || hasStoredKey)
    );
  }, [editBaseline, editFetchError, editFetchLoading, editForm]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValid || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const req =
        credMode === 'reuse'
          ? { name: form.name.trim(), from_agent: reuseAgent }
          : {
              name: form.name.trim(),
              model_provider: {
                model: form.model.trim(),
                api_base: form.apiBase.trim(),
                api_key: form.apiKey.trim(),
              },
            };
      const createdName = form.name.trim();
      await createAgent(req);
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

  const applyEditPreset = (preset: (typeof AGENT_MODEL_PRESETS)[number]) =>
    setEditForm((prev) => ({ ...prev, model: preset.model, apiBase: preset.apiBase }));

  const openUploadDialog = useCallback(() => {
    if (!detailName) return;
    setUploadForm({ displayName: detailName, summary: '', category: 'picoclaw', uploadToken: loadCachedUploadToken() });
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
        category: uploadForm.category || undefined,
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

  const onEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailName || !editFormValid || editSubmitting) return;
    setEditSubmitting(true);
    setEditSubmitError(null);
    try {
      await updateAgent(detailName, {
        model_provider: {
          model: editForm.model.trim(),
          api_base: editForm.apiBase.trim(),
          api_key: editForm.apiKey.trim(),
        },
      });
      try {
        const d = await getAgent(detailName);
        setAgentRuntime(d);
      } catch {
        /* ignore */
      }
      setEditForm(EMPTY_EDIT_FORM);
      setEditConfigOpen(false);
    } catch (err) {
      setEditSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setEditSubmitting(false);
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
        <div className="hidden w-[14rem] shrink-0 flex-col rounded-xl border border-border bg-card lg:w-[15rem] xl:w-[16rem] md:flex">
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
          <ScrollArea className="flex-1">
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
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => void handleSelectAgent(name)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                        selected
                          ? PRIMARY_LIST_ITEM_SELECTED_CLASS
                          : cn('text-foreground', PRIMARY_TAB_INACTIVE_HOVER_CLASS),
                      )}
                    >
                      <AgentAvatar
                        name={name}
                        hasAvatar={agent.has_avatar}
                        avatarRevision={avatarRevision}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm text-foreground">{name}</span>
                          {chatting && <Badge variant="secondary" className="text-[10px]">当前</Badge>}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
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
                  {detailTab === 'config' && (
                    <Button
                      variant="default"
                      size="sm"
                      className={PRIMARY_BUTTON_CLASS}
                      onClick={() => {
                        setEditConfigOpen(!editConfigOpen);
                        if (!editConfigOpen) void loadLatestForEdit();
                      }}
                    >
                      {editConfigOpen ? '收起编辑' : '更新配置'}
                    </Button>
                  )}
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
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => void onDelete(detailName)}
                    disabled={pendingDelete === detailName}
                  >
                    <IconTrash className="mr-1.5 h-3.5 w-3.5" stroke={1.75} />
                    {pendingDelete === detailName ? '删除中…' : '删除 Agent'}
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
                  refreshRev={skillsRefreshRev}
                />
              ) : (
                <ScrollArea className="flex-1">
                  <div className="max-w-3xl p-4 md:p-5">
                    {agentRuntimeError && (
                      <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-destructive">⚠️ {agentRuntimeError}</div>
                    )}

                    {agentRuntimeLoading ? (
                      <p className="text-xs text-muted-foreground">正在同步配置…</p>
                    ) : agentRuntime ? (
                      <Card size="sm" className="mb-4">
                        <CardContent className="p-4">
                          <dl className="grid gap-2 text-sm">
                            <div className="grid grid-cols-[80px_1fr] gap-2">
                              <dt className="text-xs text-muted-foreground">模型</dt>
                              <dd className="break-all font-mono text-xs">{agentRuntime.model_provider.model || '—'}</dd>
                            </div>
                            {agentRuntime.model_provider.api_base && (
                              <div className="grid grid-cols-[80px_1fr] gap-2">
                                <dt className="text-xs text-muted-foreground">api_base</dt>
                                <dd className="break-all font-mono text-xs">{agentRuntime.model_provider.api_base}</dd>
                              </div>
                            )}
                            <div className="grid grid-cols-[80px_1fr] gap-2">
                              <dt className="text-xs text-muted-foreground">API Key</dt>
                              <dd className="font-mono text-xs">{agentRuntime.model_provider.has_api_key ? '已配置' : '未检测到密钥'}</dd>
                            </div>
                          </dl>
                        </CardContent>
                      </Card>
                    ) : null}

                    {editConfigOpen && (
                      <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4">
                        <p className="mb-3 text-xs text-muted-foreground">
                          保存后将重启该 Agent。
                          {editBaseline?.model_provider.has_api_key ? ' 若已配置密钥，可留空以沿用。' : ' 请填写 API 密钥。'}
                        </p>

                        {editFetchLoading ? (
                          <p className="text-xs text-muted-foreground">加载配置中…</p>
                        ) : editFetchError && !editBaseline ? (
                          <div className="text-xs text-destructive">⚠️ {editFetchError}</div>
                        ) : editBaseline ? (
                          <>
                            <div className="mb-3 flex flex-wrap gap-2">
                              {AGENT_MODEL_PRESETS.map((p) => (
                                <button key={p.label} type="button" onClick={() => applyEditPreset(p)} className="rounded-full border border-violet-500/20 bg-violet-500/5 px-2 py-1 text-[10px] text-violet-600 hover:bg-violet-500/10">
                                  {p.label}
                                </button>
                              ))}
                            </div>
                            <form onSubmit={onEditSubmit} className="flex flex-col gap-3">
                              <div>
                                <label className="mb-1 block text-xs text-muted-foreground">模型 *</label>
                                <Input
                                  value={editForm.model}
                                  onChange={(e) => setEditForm((s) => ({ ...s, model: e.target.value }))}
                                  placeholder="deepseek/deepseek-chat"
                                  className="font-mono text-sm"
                                  disabled={editSubmitting}
                                />
                                <ModelFieldHint />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs text-muted-foreground">api_base *</label>
                                <Input value={editForm.apiBase} onChange={(e) => setEditForm((s) => ({ ...s, apiBase: e.target.value }))} disabled={editSubmitting} />
                              </div>
                              <div>
                                <label className="mb-1 block text-xs text-muted-foreground">api_key {editBaseline.model_provider.has_api_key ? '（可选）' : '*'}</label>
                                <Input type="password" value={editForm.apiKey} onChange={(e) => setEditForm((s) => ({ ...s, apiKey: e.target.value }))} placeholder={editBaseline.model_provider.has_api_key ? '留空沿用已有密钥' : 'sk-...'} disabled={editSubmitting} />
                              </div>
                              <ModelConnectivityCheck
                                fields={{
                                  model: editForm.model,
                                  apiBase: editForm.apiBase,
                                  apiKey: editForm.apiKey,
                                  agentName:
                                    editForm.apiKey.trim() || editBaseline.model_provider.has_api_key
                                      ? detailName ?? undefined
                                      : undefined,
                                }}
                                disabled={editSubmitting}
                              />
                              {editSubmitError && <p className="text-xs text-destructive">{editSubmitError}</p>}
                              <div className="flex justify-end">
                                <Button type="submit" size="sm" className={PRIMARY_BUTTON_CLASS} disabled={!editFormValid || editSubmitting}>{editSubmitting ? '保存中…' : '保存'}</Button>
                              </div>
                            </form>
                          </>
                        ) : null}
                      </div>
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
        />
      )}

      {confirmDialog}

      <AgentCreateDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="添加 Agent"
        existingAgents={agentNames}
        name={form.name}
        onNameChange={(name) => setForm((s) => ({ ...s, name }))}
        nameConflict={addNameConflict}
        credMode={credMode}
        onCredModeChange={setCredMode}
        reuseAgent={reuseAgent}
        onReuseAgentChange={setReuseAgent}
        manual={{ model: form.model, apiBase: form.apiBase, apiKey: form.apiKey }}
        onManualChange={(patch) => setForm((s) => ({ ...s, ...patch }))}
        onReuseMetaChange={handleReuseMetaChange}
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
                <p className="text-sm font-medium text-green-700 dark:text-green-300">✅ 上传成功！</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  该 Agent 已发布到 AgentHub 市场，其他用户可以搜索并安装。
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
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted-foreground">分类</label>
                  <select
                    value={uploadForm.category}
                    onChange={(e) => setUploadForm((s) => ({ ...s, category: e.target.value }))}
                    disabled={uploading}
                    className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
                  >
                    <option value="picoclaw">picoclaw</option>
                    <option value="openclaw">openclaw</option>
                  </select>
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