import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  generateAgentWorkspaceFile,
  getAgentWorkspaceFiles,
  initAgentWorkspaceFiles,
  putAgentWorkspaceFile,
  PERSONA_FILE_LABELS,
  type AgentPersonaFile,
  type PersonaFileName,
} from '../api/agents';
import { MarkdownContent } from './MarkdownContent';
import {
  initialGenerateSteps,
  PersonaGenerateDialog,
  setGenerateStepStatus,
  type GenerateStep,
} from './PersonaGenerateDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';

const PERSONA_TABS: PersonaFileName[] = ['AGENT.md', 'SOUL.md', 'USER.md'];

type ViewMode = 'edit' | 'preview';

function fileMap(files: AgentPersonaFile[]): Record<PersonaFileName, AgentPersonaFile> {
  const map = {} as Record<PersonaFileName, AgentPersonaFile>;
  for (const name of PERSONA_TABS) {
    map[name] = files.find((f) => f.name === name) ?? { name, content: '', exists: false };
  }
  return map;
}

interface AgentPersonaEditorProps {
  agentName: string;
  className?: string;
}

export function AgentPersonaEditor({ agentName, className }: AgentPersonaEditorProps) {
  const [activeTab, setActiveTab] = useState<PersonaFileName>('AGENT.md');
  const [viewMode, setViewMode] = useState<ViewMode>('edit');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState('');
  const [files, setFiles] = useState<Record<PersonaFileName, AgentPersonaFile> | null>(null);
  const [drafts, setDrafts] = useState<Record<PersonaFileName, string>>({
    'AGENT.md': '',
    'SOUL.md': '',
    'USER.md': '',
  });
  const [savedDrafts, setSavedDrafts] = useState<Record<PersonaFileName, string>>({
    'AGENT.md': '',
    'SOUL.md': '',
    'USER.md': '',
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [initBusy, setInitBusy] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [generatePhase, setGeneratePhase] = useState<'running' | 'success' | 'error'>('running');
  const [generateSteps, setGenerateSteps] = useState<GenerateStep[]>(() => initialGenerateSteps());
  const [generateModalPrompt, setGenerateModalPrompt] = useState('');
  const [generateModalFile, setGenerateModalFile] = useState<PersonaFileName>('AGENT.md');
  const loadGenRef = useRef(0);

  const load = useCallback(async () => {
    const gen = ++loadGenRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const body = await getAgentWorkspaceFiles(agentName);
      if (gen !== loadGenRef.current) return;
      const mapped = fileMap(body.files);
      setWorkspace(body.workspace);
      setFiles(mapped);
      const nextDrafts = {
        'AGENT.md': mapped['AGENT.md'].content,
        'SOUL.md': mapped['SOUL.md'].content,
        'USER.md': mapped['USER.md'].content,
      };
      setDrafts(nextDrafts);
      setSavedDrafts(nextDrafts);
    } catch (err) {
      if (gen !== loadGenRef.current) return;
      setLoadError(err instanceof Error ? err.message : String(err));
      setFiles(null);
    } finally {
      if (gen === loadGenRef.current) setLoading(false);
    }
  }, [agentName]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setAiPrompt('');
    setGenerateError(null);
  }, [activeTab]);

  const missingCount = useMemo(() => {
    if (!files) return 0;
    return PERSONA_TABS.filter((name) => !files[name].exists).length;
  }, [files]);

  const activeDraft = drafts[activeTab];
  const dirty = activeDraft !== savedDrafts[activeTab];
  const showEdit = viewMode === 'edit';
  const showPreview = viewMode === 'edit' || viewMode === 'preview';
  const tabMeta = PERSONA_FILE_LABELS[activeTab];

  const onSave = async () => {
    if (saving || !dirty) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await putAgentWorkspaceFile(agentName, activeTab, activeDraft);
      setFiles((prev) => (prev ? { ...prev, [activeTab]: updated } : prev));
      setSavedDrafts((prev) => ({ ...prev, [activeTab]: activeDraft }));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const onInitMissing = async () => {
    if (initBusy) return;
    setInitBusy(true);
    setSaveError(null);
    try {
      const body = await initAgentWorkspaceFiles(agentName);
      const mapped = fileMap(body.files);
      setWorkspace(body.workspace);
      setFiles(mapped);
      const nextDrafts = {
        'AGENT.md': mapped['AGENT.md'].content,
        'SOUL.md': mapped['SOUL.md'].content,
        'USER.md': mapped['USER.md'].content,
      };
      setDrafts(nextDrafts);
      setSavedDrafts(nextDrafts);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setInitBusy(false);
    }
  };

  const onGenerate = async () => {
    const prompt = aiPrompt.trim();
    if (!prompt || generating) return;

    setGenerating(true);
    setGenerateError(null);
    setGenerateModalOpen(true);
    setGeneratePhase('running');
    setGenerateModalPrompt(prompt);
    setGenerateModalFile(activeTab);
    setGenerateSteps(setGenerateStepStatus(initialGenerateSteps(), 'validate', []));

    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    try {
      await sleep(200);
      setGenerateSteps(setGenerateStepStatus(initialGenerateSteps(), 'call', ['validate']));

      const { content } = await generateAgentWorkspaceFile(agentName, activeTab, {
        prompt,
        current_content: activeDraft,
      });

      setGenerateSteps(setGenerateStepStatus(initialGenerateSteps(), 'finalize', ['validate', 'call']));
      await sleep(150);
      setDrafts((prev) => ({ ...prev, [activeTab]: content }));
      setGenerateSteps(setGenerateStepStatus(initialGenerateSteps(), null, ['validate', 'call', 'finalize']));
      setGeneratePhase('success');
      await sleep(700);
      setGenerateModalOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setGenerateError(message);
      setGenerateSteps(setGenerateStepStatus(initialGenerateSteps(), null, ['validate'], 'call'));
      setGeneratePhase('error');
      await sleep(2200);
      setGenerateModalOpen(false);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className={cn('flex min-h-0 flex-col overflow-hidden', className)}>
      <PersonaGenerateDialog
        open={generateModalOpen}
        fileName={generateModalFile}
        prompt={generateModalPrompt}
        steps={generateSteps}
        error={generateError}
        phase={generatePhase}
      />
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/40 px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground">
            <span className="font-mono text-foreground/80">{activeTab}</span>
            {' — '}
            {tabMeta.hint}
          </p>
          {workspace && (
            <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground/80" title={workspace}>
              {workspace}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {missingCount > 0 && (
            <Button type="button" variant="outline" size="sm" disabled={initBusy || loading} onClick={() => void onInitMissing()}>
              {initBusy ? '初始化中…' : `初始化缺失 (${missingCount})`}
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" disabled={loading} onClick={() => void load()}>
            刷新
          </Button>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/30 px-4 py-2">
        <div className="flex flex-wrap gap-1">
          {PERSONA_TABS.map((name) => {
            const label = PERSONA_FILE_LABELS[name].title;
            const isMissing = files && !files[name].exists;
            const isDirty = drafts[name] !== savedDrafts[name];
            return (
              <button
                key={name}
                type="button"
                onClick={() => setActiveTab(name)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs transition-colors',
                  activeTab === name
                    ? 'bg-violet-500/15 font-medium text-violet-700 dark:text-violet-300'
                    : 'text-muted-foreground hover:bg-muted/60',
                )}
              >
                {label}
                {isMissing && <span className="ml-1 text-[10px] text-amber-600">未创建</span>}
                {isDirty && <span className="ml-1 text-[10px] text-violet-600">•</span>}
              </button>
            );
          })}
        </div>
        <div className="flex rounded-lg border border-border/60 p-0.5">
          {(['edit', 'preview'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={cn(
                'rounded-md px-2.5 py-1 text-[11px] transition-colors',
                viewMode === mode ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {mode === 'edit' ? '编辑' : '预览'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3">
        {loading ? (
          <p className="text-xs text-muted-foreground">加载人设文件…</p>
        ) : loadError ? (
          <div className="text-xs text-destructive">⚠️ {loadError}</div>
        ) : (
          <>
            <div className="mb-3 shrink-0 rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
              <p className="mb-2 text-xs font-medium text-foreground">AI 生成</p>
              <div className="flex flex-col gap-2 lg:flex-row">
                <Input
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder={
                    activeTab === 'SOUL.md'
                      ? '例如：沉稳专业的价值投资顾问，说话简洁，少用 emoji'
                      : activeTab === 'USER.md'
                        ? '例如：中文用户，东八区，偏好简洁直接的回答'
                        : '例如：专注 A 股量化选股的助手，擅长财务分析与风险提示'
                  }
                  disabled={generating || saving}
                  className="min-w-0 flex-1 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void onGenerate();
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0 lg:min-w-[6.5rem]"
                  disabled={!aiPrompt.trim() || generating || saving}
                  onClick={() => void onGenerate()}
                >
                  {generating ? '生成中…' : 'AI 生成'}
                </Button>
              </div>
              {generateError && <p className="mt-2 text-xs text-destructive">{generateError}</p>}
            </div>

            <div
              className={cn(
                'grid min-h-0 flex-1 gap-4',
                viewMode === 'edit' ? 'grid-cols-1 2xl:grid-cols-2' : 'grid-cols-1',
              )}
            >
              {showEdit && (
                <div className="flex min-h-[min(50vh,28rem)] min-w-0 flex-col 2xl:min-h-0">
                  <p className="mb-1.5 shrink-0 text-[11px] font-medium text-muted-foreground">源码</p>
                  <textarea
                    value={activeDraft}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [activeTab]: e.target.value }))}
                    spellCheck={false}
                    className="min-h-0 w-full flex-1 resize-none rounded-lg border border-border bg-background px-4 py-3 font-mono text-[13px] leading-relaxed text-foreground outline-none focus-visible:ring-2 focus-visible:ring-violet-500/30"
                    placeholder={`在此编辑 ${activeTab}，或使用上方 AI 生成…`}
                    disabled={saving || generating}
                  />
                </div>
              )}

              {showPreview && (
                <div className="flex min-h-[min(50vh,28rem)] min-w-0 flex-col 2xl:min-h-0">
                  {viewMode === 'edit' && (
                    <p className="mb-1.5 shrink-0 text-[11px] font-medium text-muted-foreground">预览</p>
                  )}
                  <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border/60 bg-background px-5 py-4">
                    {activeDraft.trim() ? (
                      <MarkdownContent idPrefix={`persona-${activeTab}`} size="md" className="max-w-none">
                        {activeDraft}
                      </MarkdownContent>
                    ) : (
                      <p className="text-sm text-muted-foreground">暂无内容。编辑或 AI 生成后将在此渲染 Markdown。</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {saveError && <p className="mt-2 shrink-0 text-xs text-destructive">{saveError}</p>}
            <div className="mt-3 flex shrink-0 justify-end gap-2 border-t border-border/30 pt-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!dirty || saving || generating}
                onClick={() => setDrafts((prev) => ({ ...prev, [activeTab]: savedDrafts[activeTab] }))}
              >
                撤销
              </Button>
              <Button type="button" size="sm" disabled={!dirty || saving || generating} onClick={() => void onSave()}>
                {saving ? '保存中…' : '保存'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
