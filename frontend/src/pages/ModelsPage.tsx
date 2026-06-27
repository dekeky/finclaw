import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconCpu, IconPlus, IconTrash } from '@tabler/icons-react';
import { PanelResizeHandle } from '@/components/PanelResizeHandle';
import { ModelConnectivityCheck } from '@/components/ModelConnectivityCheck';
import { useHorizontalResize } from '@/hooks/useHorizontalResize';
import {
  PANEL_WIDTH_DEFAULTS,
  PANEL_WIDTH_KEYS,
  PANEL_WIDTH_LIMITS,
} from '@/lib/panelWidths';
import {
  createModel,
  deleteModel,
  getModel,
  listModels,
  modelDisplayName,
  updateModel,
  type ModelProfileDetail,
  type ModelProfileSummary,
} from '@/api/models';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SecretInput } from '@/components/ui/secret-input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SidebarExpandTrigger } from '@/components/chrome/SidebarExpandTrigger';
import { ThemeToggle } from '@/components/chrome/ThemeToggle';
import { AGENT_MODEL_PRESETS } from '@/lib/agentModelPresets';
import { cn } from '@/lib/cn';
import {
  PRIMARY_BUTTON_CLASS,
  PRIMARY_LIST_ITEM_SELECTED_CLASS,
  PRIMARY_TAB_INACTIVE_HOVER_CLASS,
} from '@/lib/primaryButton';
import { toast } from 'sonner';

type FormState = {
  displayName: string;
  model: string;
  apiBase: string;
  apiKey: string;
};

const EMPTY_FORM: FormState = { displayName: '', model: '', apiBase: '', apiKey: '' };

function ModelFieldHint() {
  return (
    <p className="mt-1 text-[11px] text-muted-foreground">
      格式为 <span className="font-mono">服务商/模型名</span>，例如{' '}
      <span className="font-mono">deepseek/deepseek-chat</span>。
    </p>
  );
}

export default function ModelsPage() {
  const [models, setModels] = useState<ModelProfileSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [detail, setDetail] = useState<ModelProfileDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const listResize = useHorizontalResize({
    storageKey: PANEL_WIDTH_KEYS.agentsList,
    defaultWidth: PANEL_WIDTH_DEFAULTS.agentsList,
    ...PANEL_WIDTH_LIMITS.agentsList,
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const list = await listModels();
      setModels(list);
      setSelectedName((prev) => {
        if (prev && list.some((m) => m.display_name === prev)) return prev;
        return list[0]?.display_name ?? null;
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (m) =>
        m.display_name.toLowerCase().includes(q)
        || m.model.toLowerCase().includes(q),
    );
  }, [models, search]);

  const sortedFiltered = useMemo(
    () => [...filtered].sort((a, b) => modelDisplayName(a).localeCompare(modelDisplayName(b), 'zh-Hans-CN')),
    [filtered],
  );

  const openCreate = () => {
    setCreating(true);
    setForm(EMPTY_FORM);
    setDetail(null);
    setDetailError(null);
    setSubmitError(null);
    setSelectedName(null);
  };

  const openEdit = useCallback(async (displayName: string) => {
    setCreating(false);
    setSelectedName(displayName);
    setSubmitError(null);
    setDetailLoading(true);
    setDetailError(null);
    try {
      const d = await getModel(displayName);
      setDetail(d);
      setForm({
        displayName: d.display_name,
        model: d.model,
        apiBase: d.api_base,
        apiKey: d.api_key?.trim() ?? '',
      });
    } catch (err) {
      setDetail(null);
      setDetailError(err instanceof Error ? err.message : String(err));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!creating && selectedName) {
      void openEdit(selectedName);
    }
  }, [creating, selectedName, openEdit]);

  const displayNameConflict = useMemo(() => {
    const dn = form.displayName.trim();
    if (!dn) return false;
    return models.some((m) => m.display_name === dn && m.display_name !== selectedName);
  }, [form.displayName, models, selectedName]);

  const formValid = useMemo(() => {
    if (!form.displayName.trim() || displayNameConflict) return false;
    if (creating) {
      return form.model.trim() && form.apiBase.trim() && form.apiKey.trim();
    }
    return form.model.trim() && form.apiBase.trim() && (form.apiKey.trim().length > 0 || detail?.has_api_key);
  }, [creating, form, displayNameConflict, detail]);

  const applyPreset = (preset: (typeof AGENT_MODEL_PRESETS)[number]) =>
    setForm((s) => ({ ...s, model: preset.model, apiBase: preset.apiBase }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValid || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (creating) {
        const created = await createModel({
          display_name: form.displayName.trim(),
          model: form.model.trim(),
          api_base: form.apiBase.trim(),
          api_key: form.apiKey.trim(),
        });
        await refresh();
        setCreating(false);
        setSelectedName(created.display_name);
        toast.success('模型已创建');
      } else if (selectedName) {
        const updated = await updateModel(selectedName, {
          display_name: form.displayName.trim(),
          model: form.model.trim(),
          api_base: form.apiBase.trim(),
          api_key: form.apiKey.trim() || undefined,
        });
        await refresh();
        setSelectedName(updated.display_name);
        await openEdit(updated.display_name);
        toast.success('保存成功');
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async (displayName: string) => {
    if (pendingDelete) return;
    const ok = await confirm({
      title: `删除模型「${displayName}」`,
      description: '若有 Agent 正在使用该模型，将无法删除。删除后不可恢复。',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    setPendingDelete(displayName);
    try {
      await deleteModel(displayName);
      if (selectedName === displayName) {
        setSelectedName(null);
        setDetail(null);
      }
      await refresh();
      toast.success('已删除');
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '删除失败');
    } finally {
      setPendingDelete(null);
    }
  };

  const showForm = creating || !!selectedName;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border/50 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <SidebarExpandTrigger />
          <h1 className="text-base font-medium tracking-tight text-foreground/90">模型配置</h1>
          <Badge variant="outline" className="text-[10px]">{models.length}</Badge>
        </div>
        <ThemeToggle />
      </div>

      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden p-3">
        <div className="hidden min-h-0 shrink-0 md:flex">
          <div
            className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card"
            style={{ width: listResize.width }}
          >
            <div className="space-y-2 border-b border-border/50 p-4">
              <Button
                variant="outline"
                size="sm"
                className={cn('w-full text-xs', PRIMARY_TAB_INACTIVE_HOVER_CLASS, 'dark:hover:bg-violet-500/14')}
                onClick={openCreate}
              >
                <IconPlus className="mr-1.5 h-3.5 w-3.5" stroke={1.75} />
                添加模型
              </Button>
              <Input
                placeholder="搜索模型..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <ScrollArea className="min-w-0 flex-1">
              {loading ? (
                <p className="p-4 text-center text-sm text-muted-foreground">加载中…</p>
              ) : loadError ? (
                <p className="p-4 text-center text-xs text-destructive">{loadError}</p>
              ) : sortedFiltered.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  {search.trim() ? '没有匹配的模型' : '暂无模型配置'}
                </div>
              ) : (
                <div className="p-2">
                  {sortedFiltered.map((m) => {
                    const selected = !creating && m.display_name === selectedName;
                    const deleting = pendingDelete === m.display_name;
                    return (
                      <div
                        key={m.display_name}
                        className={cn(
                          'grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center overflow-hidden rounded-lg',
                          selected
                            ? PRIMARY_LIST_ITEM_SELECTED_CLASS
                            : cn('text-foreground', PRIMARY_TAB_INACTIVE_HOVER_CLASS),
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setCreating(false);
                            setSelectedName(m.display_name);
                          }}
                          className="flex min-w-0 items-center overflow-hidden rounded-lg px-2 py-2 text-left"
                          title={m.display_name}
                        >
                          <span className="truncate text-sm font-medium">{modelDisplayName(m)}</span>
                        </button>
                        <button
                          type="button"
                          className={cn(
                            'mr-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors',
                            'hover:bg-destructive/10 hover:text-destructive',
                            deleting && 'pointer-events-none opacity-50',
                          )}
                          onClick={() => void onDelete(m.display_name)}
                          disabled={deleting}
                          title="删除模型"
                          aria-label="删除模型"
                        >
                          <IconTrash className="size-3.5" stroke={1.75} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
          <PanelResizeHandle overlay={false} {...listResize.handleProps} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
          {showForm ? (
            <ScrollArea className="flex-1">
              <div className="max-w-2xl p-4 md:p-5">
                <div className="mb-4 flex items-center gap-2">
                  <IconCpu className="h-5 w-5 text-violet-500" stroke={1.75} />
                  <h2 className="text-sm font-semibold">{creating ? '新建模型' : '编辑模型'}</h2>
                </div>

                {detailLoading && !creating ? (
                  <p className="text-xs text-muted-foreground">加载中…</p>
                ) : detailError && !creating ? (
                  <p className="text-xs text-destructive">{detailError}</p>
                ) : (
                  <form onSubmit={onSubmit} className="flex flex-col gap-4">
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">显示名称 *</label>
                      <Input
                        value={form.displayName}
                        onChange={(e) => setForm((s) => ({ ...s, displayName: e.target.value }))}
                        placeholder="例如：DeepSeek Chat"
                        disabled={submitting}
                      />
                      {displayNameConflict && (
                        <p className="mt-1 text-[11px] text-destructive">已存在同名模型。</p>
                      )}
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        仅用于 FinClaw 平台内展示与 Agent 选择，作为该模型配置的唯一标识。
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {AGENT_MODEL_PRESETS.map((p) => (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => applyPreset(p)}
                          disabled={submitting}
                          className="rounded-full border border-violet-500/20 bg-violet-500/5 px-2.5 py-0.5 text-[11px] text-violet-600 hover:bg-violet-500/10"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">模型 *</label>
                      <Input
                        value={form.model}
                        onChange={(e) => setForm((s) => ({ ...s, model: e.target.value }))}
                        placeholder="deepseek/deepseek-chat"
                        className="font-mono text-sm"
                        disabled={submitting}
                      />
                      <ModelFieldHint />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">api_base *</label>
                      <Input
                        value={form.apiBase}
                        onChange={(e) => setForm((s) => ({ ...s, apiBase: e.target.value }))}
                        disabled={submitting}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">
                        api_key {creating || !detail?.has_api_key ? '*' : '（可选）'}
                      </label>
                      <SecretInput
                        key={creating ? 'create' : selectedName ?? 'edit'}
                        value={form.apiKey}
                        onChange={(e) => setForm((s) => ({ ...s, apiKey: e.target.value }))}
                        placeholder={detail?.has_api_key && !form.apiKey ? '留空沿用已有密钥' : 'sk-...'}
                        disabled={submitting}
                        autoComplete="off"
                      />
                    </div>

                    <ModelConnectivityCheck
                      fields={{
                        model: form.model,
                        apiBase: form.apiBase,
                        apiKey: form.apiKey,
                        modelProfileName:
                          !creating && (form.apiKey.trim() || detail?.has_api_key) ? selectedName ?? undefined : undefined,
                      }}
                      disabled={submitting}
                    />

                    {submitError && <p className="text-xs text-destructive">{submitError}</p>}

                    <div className="flex justify-end gap-2">
                      <Button
                        type="submit"
                        size="sm"
                        className={PRIMARY_BUTTON_CLASS}
                        disabled={!formValid || submitting}
                      >
                        {submitting ? '保存中…' : creating ? '创建' : '保存'}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <IconCpu className="h-10 w-10 text-muted-foreground/40" stroke={1.25} />
              <div className="text-sm font-medium text-muted-foreground">选择或创建模型配置</div>
              <p className="max-w-xs text-xs text-muted-foreground">
                在此配置 LLM 接入信息，创建 Agent 时直接选用。
              </p>
              <Button size="sm" className={PRIMARY_BUTTON_CLASS} onClick={openCreate}>
                添加模型
              </Button>
            </div>
          )}
        </div>
      </div>

      {!showForm && models.length === 0 && !loading && (
        <div className="px-6 pb-4">
          <Card size="sm">
            <CardContent className="p-4 text-xs text-muted-foreground">
              提示：Agent 创建时需要选择已配置的模型。
              请先在左侧添加至少一个模型，或前往{' '}
              <Link to="/agents" className="text-violet-600 underline-offset-2 hover:underline">
                Agent 管理
              </Link>{' '}
              页面创建 Agent。
            </CardContent>
          </Card>
        </div>
      )}

      {confirmDialog}
    </div>
  );
}
