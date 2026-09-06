import { useCallback, useEffect, useState } from 'react';
import { IconBrain, IconLoader2 } from '@tabler/icons-react';
import { getAgent, patchAgentLLMSettings } from '@/api/agents';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  isThinkingEnabled,
  resolvedAgentTemperature,
  resolvedThinkingLevel,
} from '@/lib/agentLLMSettings';
import { cn } from '@/lib/cn';
import { TOOLBAR_ICON_BUTTON_CLASS } from '@/lib/toolbarButton';
import { toast } from 'sonner';

const ACTIVE_CLASS =
  'bg-violet-500/12 text-violet-600 shadow-[0_0_0_1px_rgba(139,92,246,0.35)] dark:text-violet-300';

interface ChatThinkingToggleProps {
  agentName: string;
  variant?: 'toolbar' | 'composer';
}

/** 切换当前 Agent 的深度思考开关。 */
export function ChatThinkingToggle({ agentName, variant = 'toolbar' }: ChatThinkingToggleProps) {
  const isComposer = variant === 'composer';
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const detail = await getAgent(agentName);
      setEnabled(isThinkingEnabled(detail.llm_settings));
    } catch {
      setEnabled(false);
    } finally {
      setLoading(false);
    }
  }, [agentName]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const onToggle = useCallback(async () => {
    if (busy || loading) return;
    setBusy(true);
    const next = !enabled;
    try {
      const detail = await getAgent(agentName);
      const settings = detail.llm_settings;
      const result = await patchAgentLLMSettings(agentName, {
        temperature: resolvedAgentTemperature(settings),
        thinking_enabled: next,
        thinking_level: next ? resolvedThinkingLevel(settings) : undefined,
      });
      setEnabled(isThinkingEnabled(result));
      toast.success(next ? '已开启深度思考' : '已关闭深度思考');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新思考设置失败');
    } finally {
      setBusy(false);
    }
  }, [agentName, busy, enabled, loading]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={isComposer ? 'icon-xs' : 'icon-sm'}
          disabled={loading || busy}
          aria-label={enabled ? '关闭深度思考' : '开启深度思考'}
          aria-pressed={enabled}
          className={cn(
            isComposer
              ? 'size-7 text-muted-foreground hover:bg-muted hover:text-foreground'
              : TOOLBAR_ICON_BUTTON_CLASS,
            enabled && ACTIVE_CLASS,
          )}
          onClick={() => void onToggle()}
        >
          {busy || loading ? (
            <IconLoader2 className={cn(isComposer ? 'size-3.5' : 'size-[18px]', 'animate-spin')} stroke={1.75} />
          ) : (
            <IconBrain className={isComposer ? 'size-3.5' : 'size-[18px]'} stroke={enabled ? 2 : 1.75} />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={isComposer ? 'top' : 'bottom'}>
        {enabled ? '深度思考已开启（点击关闭）' : '深度思考已关闭（点击开启）'}
      </TooltipContent>
    </Tooltip>
  );
}
