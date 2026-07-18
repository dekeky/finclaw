import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  getAgent,
  patchAgentLLMSettings,
  type AgentLLMSettings,
} from '@/api/agents';
import { HintTooltip } from '@/components/HintTooltip';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TemperatureSlider, temperatureAccentColor } from '@/components/TemperatureSlider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/cn';
import { DEFAULT_AGENT_TEMPERATURE } from '@/lib/agentLLMSettings';
import { PRIMARY_BUTTON_CLASS } from '@/lib/primaryButton';
import { toast } from 'sonner';

const TEMP_MIN = 0;
const TEMP_MAX = 2;
const TEMP_STEP = 0.1;

const THINKING_LEVELS = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' },
  { value: 'xhigh', label: '极高' },
  { value: 'adaptive', label: '自适应' },
] as const;

type FormState = {
  temperature: number;
  thinkingEnabled: boolean;
  thinkingLevel: string;
};

function roundTemperature(value: number): number {
  return Math.round(value * 10) / 10;
}

function settingsToForm(settings: AgentLLMSettings | undefined): FormState {
  return {
    temperature: roundTemperature(settings?.temperature ?? DEFAULT_AGENT_TEMPERATURE),
    thinkingEnabled: settings?.thinking_enabled ?? false,
    thinkingLevel: settings?.thinking_level?.trim() || 'medium',
  };
}

function formStatesEqual(a: FormState, b: FormState): boolean {
  return (
    roundTemperature(a.temperature) === roundTemperature(b.temperature)
    && a.thinkingEnabled === b.thinkingEnabled
    && a.thinkingLevel === b.thinkingLevel
  );
}

type SettingDepth = 0 | 1;

const DEPTH_INDENT: Record<SettingDepth, string> = {
  0: '',
  1: 'ml-5 pl-1',
};

function SettingItem({
  label,
  hint,
  trailing,
  children,
  depth = 0,
}: {
  label: string;
  hint: string;
  trailing?: ReactNode;
  children?: ReactNode;
  /** 0：与温度同级；1：从属于上一项（如思考强度之于深度思考）。 */
  depth?: SettingDepth;
}) {
  return (
    <div
      className={cn(
        'border-b border-border/60 py-4 first:pt-0 last:border-b-0 last:pb-0',
        DEPTH_INDENT[depth],
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className={cn(
              'text-sm font-medium text-foreground',
              depth === 1 && 'text-muted-foreground',
            )}
          >
            {label}
          </span>
          <HintTooltip text={hint} side="top" />
        </div>
        {trailing}
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

export interface AgentLLMSettingsSectionProps {
  agentName: string;
  active?: boolean;
  reloadToken?: number;
  embedded?: boolean;
  className?: string;
  onSaved?: (settings: AgentLLMSettings) => void;
}

export function AgentLLMSettingsSection({
  agentName,
  active = true,
  reloadToken = 0,
  embedded = false,
  className,
  onSaved,
}: AgentLLMSettingsSectionProps) {
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saved, setSaved] = useState<FormState | null>(null);
  const [form, setForm] = useState<FormState>(() => settingsToForm(undefined));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    if (!agentName || !active) return;
    setLoading(true);
    setLoadError(null);
    try {
      const detail = await getAgent(agentName);
      const next = settingsToForm(detail.llm_settings);
      setForm(next);
      setSaved(next);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
      setSaved(null);
    } finally {
      setLoading(false);
    }
  }, [active, agentName]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings, reloadToken]);

  const dirty = useMemo(() => {
    if (!saved) return false;
    return !formStatesEqual(form, saved);
  }, [form, saved]);

  const formValid = !form.thinkingEnabled || !!form.thinkingLevel;

  const onSave = useCallback(async () => {
    if (!formValid || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const temperature = roundTemperature(form.temperature);
      const result = await patchAgentLLMSettings(agentName, {
        temperature,
        thinking_enabled: form.thinkingEnabled,
        thinking_level: form.thinkingEnabled ? form.thinkingLevel : undefined,
      });
      const next = settingsToForm(result);
      setForm(next);
      setSaved(next);
      onSaved?.(result);
      toast.success('对话参数已保存');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }, [agentName, form, formValid, onSaved, submitting]);

  const settingsBlock = loading ? (
    <p className="text-xs text-muted-foreground">加载配置…</p>
  ) : loadError ? (
    <div className="space-y-2">
      <p className="text-xs text-destructive">{loadError}</p>
      <Button type="button" variant="outline" size="sm" onClick={() => void loadSettings()}>
        重试
      </Button>
    </div>
  ) : (
    <>
      <SettingItem
        label="温度"
        hint={`控制回复随机性：越低越严谨，越高越发散。范围 ${TEMP_MIN}–${TEMP_MAX}，推理类模型通常只允许 1；默认 ${DEFAULT_AGENT_TEMPERATURE}。`}
        trailing={
          <span
            className="shrink-0 font-mono text-sm tabular-nums"
            style={{ color: temperatureAccentColor(form.temperature, TEMP_MIN, TEMP_MAX) }}
          >
            {roundTemperature(form.temperature).toFixed(1)}
          </span>
        }
      >
        <TemperatureSlider
          id="agent-temperature"
          min={TEMP_MIN}
          max={TEMP_MAX}
          step={TEMP_STEP}
          value={form.temperature}
          onValueChange={(value) => setForm((s) => ({ ...s, temperature: value }))}
          disabled={submitting}
          aria-label="温度"
        />
      </SettingItem>

      <SettingItem
        label="深度思考"
        hint="开启后模型会先推理再回答；需模型与服务商支持。"
        trailing={
          <Switch
            checked={form.thinkingEnabled}
            onCheckedChange={(checked) => setForm((s) => ({ ...s, thinkingEnabled: checked }))}
            disabled={submitting}
            aria-label="开启深度思考"
          />
        }
      />

      {form.thinkingEnabled && (
        <SettingItem
          label="思考强度"
          hint="越高通常推理越充分，耗时与成本也可能增加；具体效果取决于模型与服务商。"
          depth={1}
          trailing={
            <Select
              value={form.thinkingLevel}
              onValueChange={(value) => setForm((s) => ({ ...s, thinkingLevel: value }))}
              disabled={submitting}
            >
              <SelectTrigger
                size="default"
                aria-label="思考强度"
                className="h-9 w-[7.5rem] rounded-lg border-border/80 bg-background shadow-xs"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="end" className="min-w-[7.5rem]">
                {THINKING_LEVELS.map(({ value, label }) => (
                  <SelectItem key={value} value={value} className="rounded-lg py-2">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />
      )}
    </>
  );

  const saveBar = !loading && !loadError ? (
    <div className="flex flex-wrap items-center gap-2 pt-4">
      <Button
        type="button"
        variant="default"
        size="sm"
        className={PRIMARY_BUTTON_CLASS}
        disabled={!dirty || !formValid || submitting}
        onClick={() => void onSave()}
      >
        {submitting ? '保存中…' : '保存'}
      </Button>
      {submitError && <p className="text-xs text-destructive">{submitError}</p>}
    </div>
  ) : null;

  const content = embedded ? (
    <>
      <div className="pl-5">{settingsBlock}</div>
      {saveBar}
    </>
  ) : (
    <>
      {settingsBlock}
      {saveBar}
    </>
  );

  if (embedded) {
    return <div className={className}>{content}</div>;
  }

  return (
    <section className={cn('rounded-xl border border-border/70 bg-muted/20 p-4 shadow-sm', className)}>
      {content}
    </section>
  );
}
