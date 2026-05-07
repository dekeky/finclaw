import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  createAgent as apiCreateAgent,
  deleteAgent as apiDeleteAgent,
  listAgents,
  updateAgent as apiUpdateAgent,
  type CreateAgentRequest,
  type UpdateAgentRequest,
} from '../api/agents';

const SELECTED_AGENT_STORAGE_KEY = 'finclaw.selectedAgent';

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface AgentsState {
  agents: string[];
  status: LoadStatus;
  error: string | null;
  /** 当前对话所选中的 Agent 名称（持久化在 localStorage）。 */
  currentAgent: string | null;
  selectAgent: (name: string | null) => void;
  refresh: () => Promise<void>;
  createAgent: (req: CreateAgentRequest) => Promise<void>;
  updateAgent: (name: string, req: UpdateAgentRequest) => Promise<void>;
  deleteAgent: (name: string) => Promise<void>;
}

const AgentsContext = createContext<AgentsState | null>(null);

function readPersistedAgent(): string | null {
  try {
    return window.localStorage.getItem(SELECTED_AGENT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistAgent(name: string | null) {
  try {
    if (name) window.localStorage.setItem(SELECTED_AGENT_STORAGE_KEY, name);
    else window.localStorage.removeItem(SELECTED_AGENT_STORAGE_KEY);
  } catch {
    // ignore quota / privacy mode
  }
}

export function AgentsProvider({ children }: { children: React.ReactNode }) {
  const [agents, setAgents] = useState<string[]>([]);
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [currentAgent, setCurrentAgentRaw] = useState<string | null>(() => readPersistedAgent());
  const inflightRef = useRef<Promise<void> | null>(null);

  const selectAgent = useCallback((name: string | null) => {
    setCurrentAgentRaw(name);
    persistAgent(name);
  }, []);

  const refresh = useCallback(async () => {
    if (inflightRef.current) return inflightRef.current;
    setStatus((prev) => (prev === 'ready' ? 'ready' : 'loading'));
    const p = (async () => {
      try {
        const list = await listAgents();
        setAgents(list);
        setStatus('ready');
        setError(null);
        // 校正 currentAgent
        setCurrentAgentRaw((prev) => {
          if (prev && list.includes(prev)) return prev;
          // 没有选中或已失效，则尝试自动选第一个
          const next = list[0] ?? null;
          persistAgent(next);
          return next;
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setStatus('error');
      } finally {
        inflightRef.current = null;
      }
    })();
    inflightRef.current = p;
    return p;
  }, []);

  const createAgent = useCallback(
    async (req: CreateAgentRequest) => {
      await apiCreateAgent(req);
      await refresh();
      // 自动切换到刚创建的 Agent
      selectAgent(req.name);
    },
    [refresh, selectAgent],
  );

  const updateAgent = useCallback(
    async (name: string, req: UpdateAgentRequest) => {
      await apiUpdateAgent(name, req);
      await refresh();
    },
    [refresh],
  );

  const deleteAgent = useCallback(
    async (name: string) => {
      await apiDeleteAgent(name);
      await refresh();
      setCurrentAgentRaw((prev) => {
        if (prev !== name) return prev;
        return null;
      });
      // refresh 已经处理了 fallback；再确保移除持久化
      if (currentAgent === name) persistAgent(null);
    },
    [refresh, currentAgent],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AgentsState>(
    () => ({
      agents,
      status,
      error,
      currentAgent,
      selectAgent,
      refresh,
      createAgent,
      updateAgent,
      deleteAgent,
    }),
    [agents, status, error, currentAgent, selectAgent, refresh, createAgent, updateAgent, deleteAgent],
  );

  return <AgentsContext.Provider value={value}>{children}</AgentsContext.Provider>;
}

export function useAgents(): AgentsState {
  const ctx = useContext(AgentsContext);
  if (!ctx) {
    throw new Error('useAgents must be used within AgentsProvider');
  }
  return ctx;
}
