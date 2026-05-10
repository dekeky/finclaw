import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAgents } from '../state/agents';
import { getAgent, type AgentDetailBody } from '../api/agents';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

type FormState = { name: string; modelName: string; model: string; apiBase: string; apiKey: string };
type EditFormState = { modelName: string; model: string; apiBase: string; apiKey: string };
const EMPTY_FORM: FormState = { name: '', modelName: '', model: '', apiBase: '', apiKey: '' };
const EMPTY_EDIT_FORM: EditFormState = { modelName: '', model: '', apiBase: '', apiKey: '' };

const PRESETS = [
  { label: 'DeepSeek Chat', modelName: 'deepseek-chat', model: 'deepseek-chat', apiBase: 'https://api.deepseek.com/v1' },
  { label: 'DeepSeek Reasoner', modelName: 'deepseek-reasoner', model: 'deepseek-reasoner', apiBase: 'https://api.deepseek.com/v1' },
  { label: 'OpenAI GPT-4o', modelName: 'gpt-4o', model: 'gpt-4o', apiBase: 'https://api.openai.com/v1' },
  { label: 'Qwen Plus', modelName: 'qwen-plus', model: 'qwen-plus', apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
];

function sectionKey(name: string): string {
  const ch = name.trim().charAt(0);
  return /[a-zA-Z]/.test(ch) ? ch.toUpperCase() : '#';
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
  const { agents, currentAgent, selectAgent, refresh, createAgent, updateAgent, deleteAgent } = useAgents();

  const [search, setSearch] = useState('');
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
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

  useEffect(() => { void refresh(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter((n) => n.toLowerCase().includes(q));
  }, [agents, search]);

  const sections = useMemo(() => groupAgents(filtered), [filtered]);

  useEffect(() => {
    setSelectedName((prev) => {
      if (prev && agents.includes(prev)) return prev;
      if (currentAgent && agents.includes(currentAgent)) return currentAgent;
      return agents[0] ?? null;
    });
  }, [agents, currentAgent]);

  const detailName = addOpen ? null : selectedName;

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
      setEditForm({ modelName: mp.model_name ?? '', model: mp.model ?? '', apiBase: mp.api_base ?? '', apiKey: '' });
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

  const formValid = useMemo(() => form.name.trim() && form.modelName.trim() && form.model.trim() && form.apiBase.trim() && form.apiKey.trim(), [form]);

  const editFormValid = useMemo(() => {
    const hasStoredKey = editBaseline?.model_provider.has_api_key === true;
    return !!editBaseline && !editFetchLoading && !editFetchError && editForm.modelName.trim() && editForm.model.trim() && editForm.apiBase.trim() && (editForm.apiKey.trim().length > 0 || hasStoredKey);
  }, [editBaseline, editFetchError, editFetchLoading, editForm]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValid || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await createAgent({ name: form.name.trim(), model_provider: { model_name: form.modelName.trim(), model: form.model.trim(), api_base: form.apiBase.trim(), api_key: form.apiKey.trim() } });
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

  const applyPreset = (preset: typeof PRESETS[number]) => setForm((prev) => ({ ...prev, modelName: preset.modelName, model: preset.model, apiBase: preset.apiBase }));
  const applyEditPreset = (preset: typeof PRESETS[number]) => setEditForm((prev) => ({ ...prev, modelName: preset.modelName, model: preset.model, apiBase: preset.apiBase }));

  const onEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailName || !editFormValid || editSubmitting) return;
    setEditSubmitting(true);
    setEditSubmitError(null);
    try {
      await updateAgent(detailName, { model_provider: { model_name: editForm.modelName.trim(), model: editForm.model.trim(), api_base: editForm.apiBase.trim(), api_key: editForm.apiKey.trim() } });
      try { const d = await getAgent(detailName); setAgentRuntime(d); } catch { /* ignore */ }
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
        <Button variant="ghost" size="sm" onClick={() => { void refresh(); setAddOpen(true); }} className="text-xs">
          添加 Agent
        </Button>
      </div>

      {/* Content */}
      <div className="flex min-h-0 flex-1 gap-0 overflow-hidden p-4">
        {/* Left Pane - Agent List */}
        <div className="hidden w-[18rem] shrink-0 flex-col rounded-xl border border-border bg-card md:flex">
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
                      const selected = !addOpen && name === selectedName;
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => { setAddOpen(false); setSelectedName(name); selectAgent(name); }}
                          className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${selected ? 'bg-accent/80 font-medium' : 'hover:bg-muted/60'}`}
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 text-xs font-semibold text-white">
                            {name.slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm text-foreground">{name}</span>
                              {chatting && <Badge variant="secondary" className="text-[10px]">当前</Badge>}
                            </div>
                            <span className="font-mono text-[10px] text-muted-foreground">/ws/chat/{name}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Right Pane - Detail */}
        <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card overflow-hidden">
          {addOpen ? (
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
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">model_name *</label>
                      <Input value={form.modelName} onChange={(e) => setForm((s) => ({ ...s, modelName: e.target.value }))} placeholder="deepseek-chat" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">model *</label>
                      <Input value={form.model} onChange={(e) => setForm((s) => ({ ...s, model: e.target.value }))} placeholder="deepseek-chat" />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">api_base *</label>
                      <Input value={form.apiBase} onChange={(e) => setForm((s) => ({ ...s, apiBase: e.target.value }))} placeholder="https://api.deepseek.com/v1" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">api_key *</label>
                    <Input type="password" value={form.apiKey} onChange={(e) => setForm((s) => ({ ...s, apiKey: e.target.value }))} placeholder="sk-..." />
                    <p className="mt-1 text-[11px] text-muted-foreground">仅发往后端，不会在浏览器里长期保存。</p>
                  </div>
                  {submitError && <p className="text-xs text-destructive">{submitError}</p>}
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setForm(EMPTY_FORM)} disabled={submitting}>清空</Button>
                    <Button type="submit" size="sm" disabled={!formValid || submitting}>{submitting ? '添加中…' : '保存'}</Button>
                  </div>
                </form>
              </div>
            </ScrollArea>
          ) : detailName ? (
            <ScrollArea className="flex-1">
              <div className="p-6">
                {/* Profile Header */}
                <div className="mb-6 flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-violet-600 text-xl font-bold text-white">
                    {detailName.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">{detailName}</h2>
                    <code className="text-xs text-muted-foreground">/ws/chat/{detailName}</code>
                  </div>
                </div>

                <p className="mb-4 text-xs text-muted-foreground">本页仅做配置与管理。与 Agent 聊天请使用右下角浮窗。</p>

                {agentRuntimeError && (
                  <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-destructive">⚠️ {agentRuntimeError}</div>
                )}

                {agentRuntimeLoading ? (
                  <p className="text-xs text-muted-foreground">正在同步配置…</p>
                ) : agentRuntime ? (
                  <Card size="sm" className="mb-4">
                    <CardContent className="p-4">
                      <dl className="grid gap-2 text-sm">
                        {agentRuntime.workspace && (
                          <div className="grid grid-cols-[80px_1fr] gap-2">
                            <dt className="text-xs text-muted-foreground">工作目录</dt>
                            <dd className="font-mono text-xs">{agentRuntime.workspace}</dd>
                          </div>
                        )}
                        <div className="grid grid-cols-[80px_1fr] gap-2">
                          <dt className="text-xs text-muted-foreground">model</dt>
                          <dd className="font-mono text-xs">{agentRuntime.model_provider.model_name || '—'}</dd>
                        </div>
                        <div className="grid grid-cols-[80px_1fr] gap-2">
                          <dt className="text-xs text-muted-foreground">API</dt>
                          <dd className="font-mono text-xs">{agentRuntime.model_provider.has_api_key ? '已配置' : '未检测到密钥'}</dd>
                        </div>
                      </dl>
                    </CardContent>
                  </Card>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setEditConfigOpen(!editConfigOpen); if (!editConfigOpen) void loadLatestForEdit(); }}>
                    {editConfigOpen ? '收起' : '更新配置'}
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => void onDelete(detailName)} disabled={pendingDelete === detailName}>
                    {pendingDelete === detailName ? '移除中…' : '移除'}
                  </Button>
                </div>

                {editConfigOpen && (
                  <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4">
                    <p className="mb-3 text-xs text-muted-foreground">保存后将重启该 Agent。{editBaseline?.model_provider.has_api_key ? '若已配置密钥，可留空 api_key 以沿用。' : '必须填写 api_key。'}</p>

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
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                              <label className="mb-1 block text-xs text-muted-foreground">model_name *</label>
                              <Input value={editForm.modelName} onChange={(e) => setEditForm((s) => ({ ...s, modelName: e.target.value }))} disabled={editSubmitting} />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs text-muted-foreground">model *</label>
                              <Input value={editForm.model} onChange={(e) => setEditForm((s) => ({ ...s, model: e.target.value }))} disabled={editSubmitting} />
                            </div>
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-muted-foreground">api_base *</label>
                            <Input value={editForm.apiBase} onChange={(e) => setEditForm((s) => ({ ...s, apiBase: e.target.value }))} disabled={editSubmitting} />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs text-muted-foreground">api_key {editBaseline.model_provider.has_api_key ? '（可选）' : '*'}</label>
                            <Input type="password" value={editForm.apiKey} onChange={(e) => setEditForm((s) => ({ ...s, apiKey: e.target.value }))} placeholder={editBaseline.model_provider.has_api_key ? '留空沿用已有密钥' : 'sk-...'} disabled={editSubmitting} />
                          </div>
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
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="text-4xl" aria-hidden>💬</div>
              <div className="text-sm font-medium text-muted-foreground">选择左侧 Agent</div>
              <p className="max-w-xs text-xs text-muted-foreground">点选列表中的条目进行管理</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}