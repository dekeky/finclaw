import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IconBuildingStore, IconCpu, IconFileDescription, IconPuzzle, IconTrash } from '@tabler/icons-react';
import { useAgents } from '../state/agents';
import {
  getAgent,
  getAgentSkillFile,
  writeAgentSkillFile,
  deleteAgentSkill,
  type AgentDetailBody,
} from '../api/agents';
import { AgentAvatar } from '../components/AgentAvatar';
import { AgentMarketPanel } from '../components/AgentMarketPanel';
import { AgentPersonaEditor } from '../components/AgentPersonaEditor';
import { AgentSkillsPanel, skillFileKey, type SkillFileTarget } from '../components/AgentSkillsPanel';
import { DocReadingPanel } from '../components/DocReadingPanel';
import { ModelConnectivityCheck } from '../components/ModelConnectivityCheck';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/cn';

type FormState = { name: string; model: string; apiBase: string; apiKey: string };
type EditFormState = { model: string; apiBase: string; apiKey: string };
const EMPTY_FORM: FormState = { name: '', model: '', apiBase: '', apiKey: '' };
const EMPTY_EDIT_FORM: EditFormState = { model: '', apiBase: '', apiKey: '' };

const PRESETS = [
  { label: 'DeepSeek Chat', model: 'deepseek/deepseek-chat', apiBase: 'https://api.deepseek.com/v1' },
  { label: 'DeepSeek Reasoner', model: 'deepseek/deepseek-reasoner', apiBase: 'https://api.deepseek.com/v1' },
  { label: 'OpenAI GPT-4o', model: 'openai/gpt-4o', apiBase: 'https://api.openai.com/v1' },
  { label: 'Qwen Plus', model: 'qwen/qwen-plus', apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
];

function ModelFieldHint() {
  return (
    <p className="mt-1 text-[11px] text-muted-foreground">
      格式为 <span className="font-mono">服务商/模型名</span>，例如{' '}
      <span className="font-mono">deepseek/deepseek-chat</span>、{' '}
      <span className="font-mono">openai/gpt-4o</span>。
    </p>
  );
}

function sectionKey(name: string): string {
  const ch = name.trim().charAt(0);
  return /[a-zA-Z]/.test(ch) ? ch.toUpperCase() : '#';
}

type DetailTab = 'persona' | 'skills' | 'config';

const DETAIL_TAB_STORAGE_KEY = 'finclaw.agents.detailTab';

const DETAIL_TABS: Array<{
  id: DetailTab;
  label: string;
  icon: typeof IconFileDescription;
}> = [
  { id: 'persona', label: '人设文件', icon: IconFileDescription },
  { id: 'skills', label: 'Skills', icon: IconPuzzle },
  { id: 'config', label: '模型配置', icon: IconCpu },
];

function loadDetailTab(): DetailTab {
  try {
    const v = sessionStorage.getItem(DETAIL_TAB_STORAGE_KEY);
    if (v === 'persona' || v === 'skills' || v === 'config') return v;
  } catch {
    /* private mode */
  }
  return 'persona';
}

function saveDetailTab(tab: DetailTab) {
  try {
    sessionStorage.setItem(DETAIL_TAB_STORAGE_KEY, tab);
  } catch {
    /* private mode */
  }
}

function groupAgents(names: string[]): Array<{ key: string; names: string[] }> {
  const sorted = [...names].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const map = new Map<string, string[]>();
  for (const n of sorted) {
    const k = sectionKey(n);
    const arr = map.get(k) ?? [];
    arr.push(n);
    map.set(k, arr);
  }
  return [...map.entries()].sort(([a], [b]) => {
    if (a === '#') return 1;
    if (b === '#') return -1;
    return a.localeCompare(b, 'en');
  }).map(([key, list]) => ({ key, names: list }));
}

export default function AgentsPage() {
  const { agents, currentAgent, refresh, createAgent, updateAgent, deleteAgent, selectAgent } = useAgents();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [marketOpen, setMarketOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
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
  const [skillFile, setSkillFile] = useState<SkillFileTarget | null>(null);
  const [skillsRefreshRev, setSkillsRefreshRev] = useState(0);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const setDetailTab = useCallback((tab: DetailTab) => {
    saveDetailTab(tab);
    setDetailTabState(tab);
  }, []);

  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    if (searchParams.get('market') !== '1') return;
    setAddOpen(false);
    setMarketOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete('market');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter((n) => n.toLowerCase().includes(q));
  }, [agents, search]);

  const sections = useMemo(() => groupAgents(filtered), [filtered]);

  // 仅在校正无效选中项时同步，避免切换列表项时因 currentAgent 变化触发多余更新
  useEffect(() => {
    setSelectedName((prev) => {
      if (prev && agents.includes(prev)) return prev;
      if (currentAgent && agents.includes(currentAgent)) return currentAgent;
      return agents[0] ?? null;
    });
  }, [agents, currentAgent]);

  const detailName = addOpen || marketOpen ? null : selectedName;

  const openMarket = useCallback(() => {
    setAddOpen(false);
    setMarketOpen(true);
  }, []);

  const handleTemplateInstalled = useCallback(
    async (name: string) => {
      setMarketOpen(false);
      await refresh();
      selectAgent(name);
      setSelectedName(name);
    },
    [refresh, selectAgent],
  );

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

  const formValid = useMemo(
    () => form.name.trim() && form.model.trim() && form.apiBase.trim() && form.apiKey.trim(),
    [form],
  );

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
      await createAgent({
        name: form.name.trim(),
        model_provider: {
          model: form.model.trim(),
          api_base: form.apiBase.trim(),
          api_key: form.apiKey.trim(),
        },
      });
      setForm(EMPTY_FORM);
      setAddOpen(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async (name: string) => {
    if (pendingDelete) return;
    if (!window.confirm(`确定移除 Agent「${name}」？后端将终止该 Agent 相关会话。`)) return;
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

  const applyPreset = (preset: (typeof PRESETS)[number]) =>
    setForm((prev) => ({ ...prev, model: preset.model, apiBase: preset.apiBase }));
  const applyEditPreset = (preset: (typeof PRESETS)[number]) =>
    setEditForm((prev) => ({ ...prev, model: preset.model, apiBase: preset.apiBase }));

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

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/50 px-4">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-medium tracking-tight text-foreground/90">Agent 管理</h1>
          <Badge variant="outline" className="text-[10px]">{agents.length}</Badge>
        </div>
        <div className="flex gap-1 md:hidden">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => {
              void refresh();
              setMarketOpen(false);
              setAddOpen(true);
            }}
          >
            添加 Agent
          </Button>
          <Button variant="ghost" size="sm" className="text-xs" onClick={openMarket}>
            市场
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden p-3">
        {/* Left Pane - Agent List */}
        <div className="hidden w-[14rem] shrink-0 flex-col rounded-xl border border-border bg-card lg:w-[15rem] xl:w-[16rem] md:flex">
          <div className="border-b border-border/50 p-4">
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
                {sections.map((sec) => (
                  <div key={sec.key}>
                    <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">{sec.key}</div>
                    {sec.names.map((name) => {
                      const chatting = name === currentAgent;
                      const selected = !addOpen && !marketOpen && name === selectedName;
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => {
                            setAddOpen(false);
                            setMarketOpen(false);
                            setSelectedName(name);
                          }}
                          className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${selected ? 'bg-accent/80 font-medium' : 'hover:bg-muted/60'}`}
                        >
                          <AgentAvatar name={name} />
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
                ))}
              </div>
            )}
          </ScrollArea>
          <div className="shrink-0 space-y-2 border-t border-border/50 p-3">
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={() => {
                void refresh();
                setMarketOpen(false);
                setAddOpen(true);
              }}
            >
              添加 Agent
            </Button>
            <Button
              variant="default"
              size="sm"
              className="w-full bg-violet-600 text-xs hover:bg-violet-600/90"
              onClick={openMarket}
            >
              <IconBuildingStore className="mr-1.5 h-3.5 w-3.5" stroke={1.75} />
              Agent 市场
            </Button>
          </div>
        </div>

        {/* Right Pane - Detail */}
        <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card overflow-hidden">
          {marketOpen ? (
            <AgentMarketPanel
              existingAgents={agents}
              onClose={() => setMarketOpen(false)}
              onInstalled={(name) => void handleTemplateInstalled(name)}
            />
          ) : addOpen ? (
            <ScrollArea className="flex-1">
              <div className="p-6">
                <div className="mb-6">
                  <h2 className="text-lg font-semibold text-foreground">添加 Agent</h2>
                  <p className="mt-1 text-sm text-muted-foreground">创建 Agent 并绑定模型后即可使用。</p>
                </div>

                <div className="mb-4 flex flex-wrap gap-2">
                  {PRESETS.map((p) => (
                    <button key={p.label} type="button" onClick={() => applyPreset(p)} className="rounded-full border border-violet-500/20 bg-violet-500/5 px-3 py-1 text-xs text-violet-600 transition-colors hover:bg-violet-500/10">
                      {p.label}
                    </button>
                  ))}
                </div>

                <form onSubmit={onSubmit} className="flex flex-col gap-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">显示名称 *</label>
                      <Input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} placeholder="例如：deepseek-default" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">模型 *</label>
                      <Input
                        value={form.model}
                        onChange={(e) => setForm((s) => ({ ...s, model: e.target.value }))}
                        placeholder="deepseek/deepseek-chat"
                        className="font-mono text-sm"
                      />
                      <ModelFieldHint />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">api_base *</label>
                      <Input value={form.apiBase} onChange={(e) => setForm((s) => ({ ...s, apiBase: e.target.value }))} placeholder="https://api.deepseek.com/v1" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">api_key *</label>
                    <Input type="password" value={form.apiKey} onChange={(e) => setForm((s) => ({ ...s, apiKey: e.target.value }))} placeholder="sk-..." />
                    <p className="mt-1 text-[11px] text-muted-foreground">密钥仅用于保存到服务端，不会留在浏览器中。</p>
                  </div>
                  <ModelConnectivityCheck
                    fields={{
                      model: form.model,
                      apiBase: form.apiBase,
                      apiKey: form.apiKey,
                    }}
                    disabled={submitting}
                  />
                  {submitError && <p className="text-xs text-destructive">{submitError}</p>}
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setForm(EMPTY_FORM)} disabled={submitting}>清空</Button>
                    <Button type="submit" size="sm" disabled={!formValid || submitting}>{submitting ? '添加中…' : '保存'}</Button>
                  </div>
                </form>
              </div>
            </ScrollArea>
          ) : detailName ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/50 px-4 py-2.5">
                <nav className="flex flex-wrap gap-1.5">
                  {DETAIL_TABS.map(({ id, label, icon: Icon }) => {
                    const active = detailTab === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setDetailTab(id)}
                        className={cn(
                          'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm transition-colors',
                          active
                            ? 'bg-violet-500 font-medium text-white shadow-sm shadow-violet-500/25'
                            : 'bg-muted/50 text-muted-foreground hover:bg-violet-500/10 hover:text-violet-700 dark:hover:text-violet-300',
                        )}
                      >
                        <Icon className="h-4 w-4" stroke={active ? 2 : 1.75} />
                        {label}
                      </button>
                    );
                  })}
                </nav>
                {detailTab === 'config' && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      className="bg-violet-600 hover:bg-violet-600/90"
                      onClick={() => {
                        setEditConfigOpen(!editConfigOpen);
                        if (!editConfigOpen) void loadLatestForEdit();
                      }}
                    >
                      {editConfigOpen ? '收起编辑' : '更新配置'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => void onDelete(detailName)}
                      disabled={pendingDelete === detailName}
                    >
                      <IconTrash className="mr-1.5 h-3.5 w-3.5" stroke={1.75} />
                      {pendingDelete === detailName ? '移除中…' : '移除'}
                    </Button>
                  </div>
                )}
              </div>

              {detailTab === 'persona' ? (
                <AgentPersonaEditor key={detailName} agentName={detailName} className="min-h-0 flex-1" />
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
                              {PRESETS.map((p) => (
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
                                <Button type="submit" size="sm" disabled={!editFormValid || editSubmitting}>{editSubmitting ? '保存中…' : '保存'}</Button>
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
    </div>
  );
}