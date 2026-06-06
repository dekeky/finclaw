import { useEffect, useRef, useState } from 'react';
import { getAgent, type AgentDetailBody } from '@/api/agents';

export function useReuseAgentSource(agentName: string, enabled: boolean) {
  const [source, setSource] = useState<AgentDetailBody | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadGenRef = useRef(0);

  useEffect(() => {
    if (!enabled || !agentName) {
      setSource(null);
      setLoading(false);
      setError(null);
      return;
    }
    const gen = ++loadGenRef.current;
    setLoading(true);
    setError(null);
    setSource(null);
    getAgent(agentName)
      .then((d) => {
        if (gen !== loadGenRef.current) return;
        setSource(d);
      })
      .catch((err) => {
        if (gen !== loadGenRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (gen === loadGenRef.current) setLoading(false);
      });
  }, [agentName, enabled]);

  return { source, loading, error };
}
