import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { IconArrowLeft, IconRefresh, IconDownload, IconPackage, IconFileDescription } from '@tabler/icons-react';
import {
  listMarketTemplates,
  getMarketTemplate,
  getMarketTemplateFile,
  installMarketTemplate,
  type InstallTemplateRequest,
  type MarketTemplate,
  type MarketTemplateDetail,
} from '../api/agentMarket';
import { AgentCreateDialog } from './AgentCreateDialog';
import {
  isAgentModelSetupValid,
  type AgentModelsMeta,
} from './AgentModelSetupSection';
import { MarketFileTree } from './MarketFileTree';
import { DocReadingPanel } from './DocReadingPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/cn';
import { PRIMARY_BUTTON_CLASS } from '@/lib/primaryButton';

const LAST_MODEL_KEY = 'finclaw.market.lastModelProfile';
const MARKET_CATEGORY = 'picoclaw';

type InstallForm = { name: string };
const EMPTY_INSTALL: InstallForm = { name: '' };

function loadLastModelProfile(): string {
  try {
    return localStorage.getItem(LAST_MODEL_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveLastModelProfile(name: string) {
  try {
    if (name) localStorage.setItem(LAST_MODEL_KEY, name);
    else localStorage.removeItem(LAST_MODEL_KEY);
  } catch {
    /* private mode */
  }
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/** Whether a template package can be applied by FinClaw (matches backend install rules). */
function isInstallableTemplate(files: { path: string }[]): boolean {
  const paths = files.map((f) => normalizePath(f.path));
  if (paths.some((p) => p === 'AGENT.md' || p.endsWith('/AGENT.md'))) return true;
  if (paths.some((p) => p === 'SKILL.md' || p.endsWith('/SKILL.md'))) return true;
  if (paths.some((p) => p === 'workspace' || p.startsWith('workspace/'))) return true;
  return paths.some((p) => p.includes('/workspace/'));
}

function suggestAgentName(templateName: string, existingAgents: string[]): string {
  const base = `${templateName}-agent`;
  if (!existingAgents.includes(base)) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${base}-${i}`;
    if (!existingAgents.includes(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

interface BlockedReasonArgs {
  form: InstallForm;
  existingAgents: string[];
  installable: boolean;
  selectedModel: string;
  modelsMeta: AgentModelsMeta;
}

function installBlockedReason({
  form,
  existingAgents,
  installable,
  selectedModel,
  modelsMeta,
}: BlockedReasonArgs): string | null {
  if (!installable) {
    return '该模板包不可安装：需包含 AGENT.md、SKILL.md 或 workspace/ 目录。';
  }
  const name = form.name.trim();
  if (!name) return '请为 Agent 命名。';
  if (existingAgents.includes(name)) return '已存在同名 Agent，请换一个名称。';
  if (!isAgentModelSetupValid(selectedModel, modelsMeta)) {
    if (modelsMeta.loading) return '正在加载模型列表…';
    if (modelsMeta.error) return modelsMeta.error;
    if (modelsMeta.models.length === 0) return '请先在「模型」页面添加模型配置。';
    return '请选择一个有效的模型。';
  }
  return null;
}

interface AgentMarketPanelProps {
  /** 已存在的 Agent 名称，用于重名校验。 */
  existingAgents: string[];
  onClose: () => void;
  onInstalled: (name: string) => void;
  /** 外层页面已有标题时隐藏面板内标题。 */
  hideTitle?: boolean;
  /** 搜索词（由页面顶栏传入时，面板内不再重复渲染搜索框）。 */
  search?: string;
  onSearchChange?: (value: string) => void;
}

export function AgentMarketPanel({
  existingAgents,
  onClose,
  onInstalled,
  hideTitle = false,
  search: searchProp,
  onSearchChange,
}: AgentMarketPanelProps) {
  const [templates, setTemplates] = useState<MarketTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [internalSearch, setInternalSearch] = useState('');
  const search = searchProp ?? internalSearch;
  const setSearch = onSearchChange ?? setInternalSearch;
  const searchInHeader = searchProp !== undefined;

  const [selected, setSelected] = useState<MarketTemplate | null>(null);
  const [detail, setDetail] = useState<MarketTemplateDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [openFilePath, setOpenFilePath] = useState<string | null>(null);

  const [version, setVersion] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [modelsMeta, setModelsMeta] = useState<AgentModelsMeta>({
    models: [],
    loading: false,
    error: null,
  });
  const [form, setForm] = useState<InstallForm>(EMPTY_INSTALL);
  const [installDialogOpen, setInstallDialogOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listMarketTemplates(MARKET_CATEGORY);
      setTemplates(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      (t) =>
        t.agentName.toLowerCase().includes(q) ||
        (t.displayName ?? '').toLowerCase().includes(q) ||
        (t.summary ?? '').toLowerCase().includes(q),
    );
  }, [templates, search]);

  const openTemplate = useCallback(
    async (tpl: MarketTemplate) => {
      setSelected(tpl);
      setDetail(null);
      setOpenFilePath(null);
      setInstallDialogOpen(false);
      setInstallError(null);
      setVersion(tpl.latestVersion || '');
      setForm({
        ...EMPTY_INSTALL,
        name: suggestAgentName(tpl.agentName, existingAgents),
      });
      setSelectedModel(loadLastModelProfile());
      setDetailLoading(true);
      try {
        const d = await getMarketTemplate(tpl.agentName);
        setDetail(d);
      } catch (err) {
        setInstallError(err instanceof Error ? err.message : String(err));
      } finally {
        setDetailLoading(false);
      }
    },
    [existingAgents],
  );

  const templateInstallable = useMemo(
    () => (detail?.files?.length ? isInstallableTemplate(detail.files) : true),
    [detail],
  );

  const handleModelsMetaChange = useCallback((meta: AgentModelsMeta) => {
    setModelsMeta(meta);
  }, []);

  const blockedReason = useMemo(
    () =>
      installBlockedReason({
        form,
        existingAgents,
        installable: templateInstallable,
        selectedModel,
        modelsMeta,
      }),
    [form, existingAgents, templateInstallable, selectedModel, modelsMeta],
  );

  const formValid = blockedReason === null;

  const nameConflict = useMemo(
    () => form.name.trim().length > 0 && existingAgents.includes(form.name.trim()),
    [form.name, existingAgents],
  );

  const versions = useMemo(
    () => detail?.versions ?? selected?.versions ?? [],
    [detail, selected],
  );

  const loadFileContent = useCallback(
    (_agent: string, path: string): Promise<string> => {
      if (!selected) return Promise.reject(new Error('未选择模板'));
      return getMarketTemplateFile(selected.agentName, path, version || undefined);
    },
    [selected, version],
  );

  const onInstall = async (e: FormEvent) => {
    e.preventDefault();
    if (!selected || !formValid || installing) return;
    setInstalling(true);
    setInstallError(null);
    try {
      const req: InstallTemplateRequest = {
        template: selected.agentName,
        version: version || detail?.latestVersion || selected.latestVersion || undefined,
        name: form.name.trim(),
        model: selectedModel,
      };
      await installMarketTemplate(req);
      saveLastModelProfile(selectedModel);
      setInstallDialogOpen(false);
      onInstalled(form.name.trim());
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : String(err));
    } finally {
      setInstalling(false);
    }
  };

  const openInstallDialog = () => {
    if (!templateInstallable) return;
    setInstallError(null);
    setInstallDialogOpen(true);
  };

  const marketHeader = (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        {!hideTitle ? (
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <IconPackage className="h-5 w-5 text-violet-500" />
              Agent 市场
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">从 AgentHub 选择模板，一键创建 Agent。</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">从 AgentHub 选择模板，一键创建 Agent。</p>
        )}
      </div>
      <div className="flex gap-2">
        {!hideTitle && (
          <Button variant="ghost" size="sm" className="text-xs" onClick={onClose}>
            关闭
          </Button>
        )}
      </div>
    </div>
  );

  const searchQuery = search.trim();

  return (
    <>
    {!selected ? (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {!hideTitle && <div className="shrink-0 px-6 pt-6">{marketHeader}</div>}

      <div className="shrink-0 border-b border-border/40 bg-card/90 px-4 py-3 backdrop-blur-sm sm:px-6">
        {!searchInHeader && (
          <div className="relative mb-3">
            <Input
              placeholder="搜索模板名称或描述…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full text-sm"
            />
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          {!loading && !error && (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {searchQuery ? `找到 ${filtered.length} 个` : `共 ${filtered.length} 个`}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            onClick={() => void loadTemplates()}
            aria-label="刷新模板列表"
          >
            <IconRefresh className="size-4" stroke={1.75} />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 sm:p-6">
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-xs text-destructive">
              ⚠️ 无法连接 AgentHub 服务：{error}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground">加载模板中…</p>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-6 py-14 text-center">
              {searchQuery ? (
                <>
                  <p className="text-sm text-foreground">
                    没有找到与「<span className="font-medium text-violet-600 dark:text-violet-300">{searchQuery}</span>」相关的模板
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">试试更短的关键词</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={() => setSearch('')}
                  >
                    清除搜索
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {error ? '暂时无法获取模板。' : '市场中暂无模板。'}
                </p>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((tpl) => (
                <button
                  key={tpl.agentName}
                  type="button"
                  onClick={() => void openTemplate(tpl)}
                  className="flex flex-col rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 hover:shadow-sm"
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <span className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
                      {tpl.displayName || tpl.agentName}
                    </span>
                  </div>
                  <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                    {tpl.summary || '暂无描述'}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
    ) : (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-border/50 px-4 py-2.5 sm:px-5">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              onClick={() => setSelected(null)}
              aria-label="返回模板列表"
            >
              <IconArrowLeft className="size-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="truncate text-sm font-semibold text-foreground">
                  {selected.displayName || selected.agentName}
                </span>
                {versions.length > 1 ? (
                  <select
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    aria-label="选择版本"
                    className="h-5 shrink-0 rounded-md border border-border bg-background px-1.5 text-[10px] text-foreground"
                  >
                    {versions.map((v) => (
                      <option key={v} value={v}>
                        v{v}
                        {v === (detail?.latestVersion || selected.latestVersion) ? '（最新）' : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  (version || selected.latestVersion) && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      v{version || selected.latestVersion}
                    </span>
                  )
                )}
              </div>
              {selected.summary && (
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {selected.summary}
                </p>
              )}
            </div>
            <Button
              type="button"
              size="sm"
              className={cn('h-8 shrink-0 text-xs', PRIMARY_BUTTON_CLASS)}
              disabled={!templateInstallable || detailLoading}
              onClick={openInstallDialog}
            >
              <IconDownload className="mr-1 size-3.5" />
              <span className="hidden sm:inline">使用此模板创建</span>
              <span className="sm:hidden">创建</span>
            </Button>
          </div>
          {!templateInstallable && (
            <p className="mt-2 pl-10 text-[11px] text-amber-700 dark:text-amber-300">
              模板格式不完整，无法安装
            </p>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center gap-1.5 border-b border-border/40 px-4 py-2 sm:px-5">
            <IconFileDescription className="size-3.5 text-muted-foreground/70" />
            <span className="text-xs font-medium text-muted-foreground">模板内容</span>
          </div>
          {detailLoading ? (
            <p className="px-4 py-4 text-center text-xs text-muted-foreground sm:px-5">加载中…</p>
          ) : detail && detail.files.length > 0 ? (
            <ScrollArea className="min-h-0 flex-1">
              <MarketFileTree
                key={selected.agentName}
                files={detail.files}
                selectedPath={openFilePath}
                onSelect={setOpenFilePath}
              />
            </ScrollArea>
          ) : (
            <p className="px-4 py-4 text-center text-xs text-muted-foreground sm:px-5">该模板暂无文件</p>
          )}
        </div>
      </div>
    )}
    {selected && openFilePath && (
      <DocReadingPanel
        key={openFilePath}
        agentName={selected.agentName}
        filePath={openFilePath}
        loadContent={loadFileContent}
        onClose={() => setOpenFilePath(null)}
      />
    )}

    <AgentCreateDialog
      open={installDialogOpen}
      onOpenChange={setInstallDialogOpen}
      title="从模板创建 Agent"
      description={`模板：${selected?.displayName || selected?.agentName || ''}`}
      name={form.name}
      onNameChange={(name) => setForm((s) => ({ ...s, name }))}
      nameConflict={nameConflict}
      selectedModel={selectedModel}
      onSelectedModelChange={setSelectedModel}
      onModelsMetaChange={handleModelsMetaChange}
      busy={installing}
      submitDisabled={!formValid}
      error={installError}
      hint={blockedReason}
      onSubmit={onInstall}
      onCancel={() => setInstallError(null)}
    />
  </>
  );
}
