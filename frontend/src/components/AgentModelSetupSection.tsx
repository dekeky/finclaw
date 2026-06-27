import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { IconCpu } from '@tabler/icons-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { listModels, modelDisplayName, type ModelProfileSummary } from '@/api/models';
import { cn } from '@/lib/cn';
import { PRIMARY_LIST_ITEM_SELECTED_CLASS, PRIMARY_TAB_INACTIVE_HOVER_CLASS } from '@/lib/primaryButton';

export interface AgentModelSetupSectionProps {
  selectedModel: string;
  onSelectedModelChange: (name: string) => void;
  disabled?: boolean;
  /** 为 false 时不拉取模型列表（如弹窗关闭）。 */
  active?: boolean;
  showStepBadge?: boolean;
  className?: string;
  onModelsMetaChange?: (meta: AgentModelsMeta) => void;
  /** pick：创建时选择；switch：已创建 Agent 切换模型。 */
  variant?: 'pick' | 'switch';
  /** switch 模式下当前使用中的模型显示名。 */
  activeModel?: string;
  onSwitchModel?: (displayName: string) => void;
  switching?: boolean;
}

export type AgentModelsMeta = {
  models: ModelProfileSummary[];
  loading: boolean;
  error: string | null;
};

export function isAgentModelSetupValid(selectedModel: string, meta: AgentModelsMeta): boolean {
  return (
    !!selectedModel
    && !meta.loading
    && !meta.error
    && meta.models.some((m) => m.display_name === selectedModel)
  );
}

export function AgentModelSetupSection({
  selectedModel,
  onSelectedModelChange,
  disabled = false,
  active = true,
  showStepBadge = true,
  className,
  onModelsMetaChange,
  variant = 'pick',
  activeModel = '',
  onSwitchModel,
  switching = false,
}: AgentModelSetupSectionProps) {
  const [models, setModels] = useState<ModelProfileSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSwitch = variant === 'switch';
  const inUseModel = activeModel.trim() || selectedModel.trim();

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listModels()
      .then((list) => {
        if (cancelled) return;
        setModels(list);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setModels([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => {
    if (!isSwitch && !selectedModel && models.length > 0) {
      onSelectedModelChange(models[0].display_name);
    }
  }, [isSwitch, models, selectedModel, onSelectedModelChange]);

  useEffect(() => {
    onModelsMetaChange?.({ models, loading, error });
  }, [models, loading, error, onModelsMetaChange]);

  const title = isSwitch ? '切换模型' : '选择模型';

  return (
    <section className={cn('rounded-xl border border-border/70 bg-muted/20 p-4 shadow-sm', className)}>
      <div className="mb-3 flex items-center gap-2.5">
        {showStepBadge && (
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
            2
          </span>
        )}
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">加载模型列表…</p>
      ) : error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : models.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/70 bg-background/80 p-4 text-center">
          <IconCpu className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" stroke={1.25} />
          <p className="text-xs text-muted-foreground">尚未配置模型，请先添加。</p>
          <Link
            to="/models"
            className="mt-2 inline-block text-xs font-medium text-violet-600 underline-offset-2 hover:underline"
          >
            前往模型配置
          </Link>
        </div>
      ) : isSwitch ? (
        <div className="space-y-1 rounded-lg border border-border/60 bg-background/80 p-2">
          {models.map((m) => {
            const name = modelDisplayName(m);
            const inUse = inUseModel === m.display_name;
            return (
              <button
                key={m.display_name}
                type="button"
                disabled={disabled || switching || inUse}
                onClick={() => onSwitchModel?.(m.display_name)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                  inUse
                    ? PRIMARY_LIST_ITEM_SELECTED_CLASS
                    : cn('text-foreground', PRIMARY_TAB_INACTIVE_HOVER_CLASS),
                  (disabled || switching) && !inUse && 'opacity-60',
                )}
              >
                <span className="truncate font-medium">{name}</span>
                {inUse && (
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    使用中
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-border/60 bg-background/80 p-3">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">模型</label>
          <Select value={selectedModel || undefined} onValueChange={onSelectedModelChange} disabled={disabled}>
            <SelectTrigger
              size="default"
              aria-label="选择模型"
              className="h-10 w-full rounded-lg border-border/80 bg-background shadow-xs"
            >
              <SelectValue placeholder="选择模型" />
            </SelectTrigger>
            <SelectContent position="popper" align="start" className="max-h-60 min-w-[var(--radix-select-trigger-width)]">
              {models.map((m) => (
                <SelectItem key={m.display_name} value={m.display_name} className="rounded-lg py-2">
                  <span className="truncate">{modelDisplayName(m)}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </section>
  );
}
