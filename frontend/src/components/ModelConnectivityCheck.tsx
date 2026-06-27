import { useState } from 'react';
import { IconPlugConnected } from '@tabler/icons-react';
import { probeModelProvider, type AgentModelProvider } from '../api/agents';
import { probeModelProfile } from '../api/models';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

export interface ModelConnectivityFields {
  model: string;
  apiBase: string;
  apiKey: string;
  /** When api_key is empty, reuse this agent's stored key. */
  agentName?: string;
  /** When api_key is empty, reuse this model profile's stored key. */
  modelProfileName?: string;
}

interface ModelConnectivityCheckProps {
  fields: ModelConnectivityFields;
  disabled?: boolean;
  className?: string;
}

export function ModelConnectivityCheck({ fields, disabled, className }: ModelConnectivityCheckProps) {
  const [probing, setProbing] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; latencyMs?: number } | null>(null);

  const canProbe =
    fields.model.trim() &&
    fields.apiBase.trim() &&
    (fields.apiKey.trim().length > 0 ||
      !!fields.agentName?.trim() ||
      !!fields.modelProfileName?.trim());

  const onProbe = async () => {
    if (!canProbe || probing || disabled) return;
    setProbing(true);
    setResult(null);
    try {
      const mp: AgentModelProvider = {
        model: fields.model.trim(),
        api_base: fields.apiBase.trim(),
        api_key: fields.apiKey.trim(),
      };
      const res = fields.modelProfileName?.trim()
        ? await probeModelProfile(mp, fields.modelProfileName.trim())
        : await probeModelProvider(mp, fields.agentName?.trim() || undefined);
      setResult({
        ok: res.ok,
        message: res.message,
        latencyMs: res.latency_ms,
      });
    } catch (err) {
      setResult({
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setProbing(false);
    }
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-xs"
          disabled={!canProbe || probing || disabled}
          onClick={() => void onProbe()}
        >
          <IconPlugConnected className="mr-1.5 h-3.5 w-3.5" stroke={1.75} />
          {probing ? '检测中…' : '测试连接'}
        </Button>
        {result?.latencyMs != null && result.ok && (
          <span className="text-[11px] text-muted-foreground">{result.latencyMs} ms</span>
        )}
      </div>
      {result && (
        <p
          className={cn(
            'text-xs',
            result.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive',
          )}
        >
          {result.ok ? '✓ ' : '✗ '}
          {result.message}
        </p>
      )}
    </div>
  );
}
