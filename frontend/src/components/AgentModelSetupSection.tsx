import { useEffect } from 'react';
import { IconCopy, IconSettings } from '@tabler/icons-react';
import type { AgentDetailBody } from '@/api/agents';
import { AgentAvatar } from '@/components/AgentAvatar';
import { ModelConnectivityCheck } from '@/components/ModelConnectivityCheck';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useReuseAgentSource } from '@/hooks/useReuseAgentSource';
import { AGENT_MODEL_PRESETS } from '@/lib/agentModelPresets';
import { cn } from '@/lib/cn';

export type AgentModelCredMode = 'reuse' | 'manual';

export type AgentManualModelFields = {
  model: string;
  apiBase: string;
  apiKey: string;
};

export type ReuseAgentSourceMeta = {
  source: AgentDetailBody | null;
  loading: boolean;
  error: string | null;
};

export function isAgentModelSetupValid(
  credMode: AgentModelCredMode,
  manual: AgentManualModelFields,
  reuse: ReuseAgentSourceMeta,
  reuseAgent: string,
): boolean {
  if (credMode === 'reuse') {
    return (
      !!reuseAgent
      && !reuse.loading
      && !reuse.error
      && !!reuse.source?.model_provider.model
      && reuse.source.model_provider.has_api_key
    );
  }
  return !!(manual.model.trim() && manual.apiBase.trim() && manual.apiKey.trim());
}

export interface AgentModelSetupSectionProps {
  existingAgents: string[];
  credMode: AgentModelCredMode;
  onCredModeChange: (mode: AgentModelCredMode) => void;
  reuseAgent: string;
  onReuseAgentChange: (name: string) => void;
  manual: AgentManualModelFields;
  onManualChange: (patch: Partial<AgentManualModelFields>) => void;
  disabled?: boolean;
  /** 为 false 时不拉取来源 Agent 配置（如弹窗关闭）。 */
  active?: boolean;
  showStepBadge?: boolean;
  className?: string;
  onReuseMetaChange?: (meta: ReuseAgentSourceMeta) => void;
}

export function AgentModelSetupSection({
  existingAgents,
  credMode,
  onCredModeChange,
  reuseAgent,
  onReuseAgentChange,
  manual,
  onManualChange,
  disabled = false,
  active = true,
  showStepBadge = true,
  className,
  onReuseMetaChange,
}: AgentModelSetupSectionProps) {
  const reuseEnabled = active && credMode === 'reuse' && !!reuseAgent;
  const { source, loading, error } = useReuseAgentSource(reuseAgent, reuseEnabled);

  useEffect(() => {
    onReuseMetaChange?.({ source, loading, error });
  }, [source, loading, error, onReuseMetaChange]);

  return (
    <section className={cn('rounded-xl border border-border/70 bg-muted/20 p-4 shadow-sm', className)}>
      <div className="mb-3 flex items-center gap-2.5">
        {showStepBadge && (
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
            2
          </span>
        )}
        <h3 className="text-sm font-semibold text-foreground">设置模型</h3>
      </div>

      {existingAgents.length > 0 && (
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onCredModeChange('reuse')}
            disabled={disabled}
            className={cn(
              'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all',
              credMode === 'reuse'
                ? 'border-violet-500/40 bg-violet-500/10 shadow-[0_0_0_1px_rgba(139,92,246,0.15)]'
                : 'border-border/60 bg-background hover:border-violet-500/25 hover:bg-violet-500/5',
            )}
          >
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-lg',
                credMode === 'reuse' ? 'bg-violet-500/20 text-violet-600' : 'bg-muted text-muted-foreground',
              )}
            >
              <IconCopy className="size-4" stroke={1.75} />
            </span>
            <span className="text-sm font-medium text-foreground">复用已有</span>
          </button>
          <button
            type="button"
            onClick={() => onCredModeChange('manual')}
            disabled={disabled}
            className={cn(
              'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all',
              credMode === 'manual'
                ? 'border-violet-500/40 bg-violet-500/10 shadow-[0_0_0_1px_rgba(139,92,246,0.15)]'
                : 'border-border/60 bg-background hover:border-violet-500/25 hover:bg-violet-500/5',
            )}
          >
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-lg',
                credMode === 'manual' ? 'bg-violet-500/20 text-violet-600' : 'bg-muted text-muted-foreground',
              )}
            >
              <IconSettings className="size-4" stroke={1.75} />
            </span>
            <span className="text-sm font-medium text-foreground">填写新模型</span>
          </button>
        </div>
      )}

      {credMode === 'reuse' ? (
        <div className="rounded-lg border border-border/60 bg-background/80 p-3">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">来源 Agent</label>
          <Select
            value={reuseAgent || undefined}
            onValueChange={onReuseAgentChange}
            disabled={disabled}
          >
            <SelectTrigger
              size="default"
              aria-label="选择来源 Agent"
              className="h-10 w-full rounded-lg border-border/80 bg-background shadow-xs transition-colors hover:bg-muted/40 data-[state=open]:bg-muted/50 focus-visible:ring-primary/30"
            >
              <SelectValue
                placeholder="选择 Agent"
                className="flex min-w-0 flex-1 items-center gap-2.5 truncate font-medium [&>span]:flex [&>span]:min-w-0 [&>span]:items-center [&>span]:gap-2.5"
              />
            </SelectTrigger>
            <SelectContent
              position="popper"
              align="start"
              className="max-h-60 min-w-[var(--radix-select-trigger-width)] rounded-xl border-border/60 shadow-lg"
            >
              {existingAgents.map((name) => (
                <SelectItem key={name} value={name} className="rounded-lg py-2">
                  <span className="flex items-center gap-2.5">
                    <AgentAvatar name={name} size="sm" className="!h-7 !w-7 !text-[11px]" />
                    <span className="truncate">{name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {loading ? (
            <p className="mt-2 text-[11px] text-muted-foreground">加载模型配置…</p>
          ) : error ? (
            <p className="mt-2 text-[11px] text-destructive">{error}</p>
          ) : source ? (
            <dl className="mt-2.5 grid gap-1.5 border-t border-border/50 pt-2.5 text-xs">
              <div className="grid grid-cols-[4.25rem_1fr] items-baseline gap-2">
                <dt className="text-muted-foreground">模型</dt>
                <dd className="break-all font-mono text-foreground">{source.model_provider.model || '—'}</dd>
              </div>
              {source.model_provider.api_base && (
                <div className="grid grid-cols-[4.25rem_1fr] items-baseline gap-2">
                  <dt className="text-muted-foreground">api_base</dt>
                  <dd className="break-all font-mono text-foreground">{source.model_provider.api_base}</dd>
                </div>
              )}
              <div className="grid grid-cols-[4.25rem_1fr] items-baseline gap-2">
                <dt className="text-muted-foreground">API Key</dt>
                <dd className={source.model_provider.has_api_key ? 'text-foreground' : 'text-destructive'}>
                  {source.model_provider.has_api_key ? '已配置' : '未配置'}
                </dd>
              </div>
            </dl>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3 rounded-lg border border-border/60 bg-background/80 p-3">
          <div className="flex flex-wrap gap-1.5">
            {AGENT_MODEL_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => onManualChange({ model: p.model, apiBase: p.apiBase })}
                disabled={disabled}
                className="rounded-full border border-violet-500/20 bg-violet-500/5 px-2.5 py-0.5 text-[11px] text-violet-600 transition-colors hover:bg-violet-500/10"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">模型</label>
            <Input
              value={manual.model}
              onChange={(e) => onManualChange({ model: e.target.value })}
              placeholder="deepseek/deepseek-chat"
              className="font-mono text-sm"
              disabled={disabled}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">api_base</label>
            <Input
              value={manual.apiBase}
              onChange={(e) => onManualChange({ apiBase: e.target.value })}
              placeholder="https://api.deepseek.com/v1"
              disabled={disabled}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">api_key</label>
            <Input
              type="password"
              value={manual.apiKey}
              onChange={(e) => onManualChange({ apiKey: e.target.value })}
              placeholder="sk-..."
              disabled={disabled}
            />
          </div>
          <ModelConnectivityCheck
            fields={{
              model: manual.model,
              apiBase: manual.apiBase,
              apiKey: manual.apiKey,
            }}
            disabled={disabled}
          />
        </div>
      )}
    </section>
  );
}
