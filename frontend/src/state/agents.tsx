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
  deleteAgentAvatar as apiDeleteAgentAvatar,
  listAgents,
  renameAgent as apiRenameAgent,
  updateAgent as apiUpdateAgent,
  uploadAgentAvatar as apiUploadAgentAvatar,
  type AgentSummary,
  type CreateAgentRequest,
  type UpdateAgentRequest,
} from '../api/agents';

const SELECTED_AGENT_STORAGE_KEY = 'finclaw.selectedAgent';

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface AgentsState {
  agents: AgentSummary[];
  /** 仅名称列表，便于下拉与校验。 */
  agentNames: string[];
  status: LoadStatus;
  error: string | null;
  /** 头像变更后递增，用于刷新 img 缓存。 */
  avatarRevision: number;
  /** 当前对话所选中的 Agent 名称（持久化在 localStorage）。 */
  currentAgent: string | null;
  selectAgent: (name: string | null) => void;
  refresh: () => Promise<void>;
  createAgent: (req: CreateAgentRequest) => Promise<void>;
  updateAgent: (name: string, req: UpdateAgentRequest) => Promise<void>;
  renameAgent: (oldName: string, newName: string) => Promise<void>;
  uploadAgentAvatar: (name: string, dataUrl: string) => Promise<void>;
  deleteAgentAvatar: (name: string) => Promise<void>;
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
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [status, setStatus] = useState<LoadStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [avatarRevision, setAvatarRevision] = useState(0);
  const [currentAgent, setCurrentAgentRaw] = useState<string | null>(() => readPersistedAgent());
  const inflightRef = useRef<Promise<void> | null>(null);

  const agentNames = useMemo(() => agents.map((a) => a.name), [agents]);

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
        setCurrentAgentRaw((prev) => {
          if (prev && list.some((a) => a.name === prev)) return prev;
          const next = list[0]?.name ?? null;
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

  const renameAgent = useCallback(
    async (oldName: string, newName: string) => {
      await apiRenameAgent(oldName, newName);
      await refresh();
      setCurrentAgentRaw((prev) => {
        if (prev !== oldName) return prev;
        persistAgent(newName);
        return newName;
      });
    },
    [refresh],
  );

  const uploadAgentAvatar = useCallback(
    async (name: string, dataUrl: string) => {
      await apiUploadAgentAvatar(name, dataUrl);
      await refresh();
      setAvatarRevision((v) => v + 1);
    },
    [refresh],
  );

  const deleteAgentAvatar = useCallback(
    async (name: string) => {
      await apiDeleteAgentAvatar(name);
      await refresh();
      setAvatarRevision((v) => v + 1);
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
      agentNames,
      status,
      error,
      avatarRevision,
      currentAgent,
      selectAgent,
      refresh,
      createAgent,
      updateAgent,
      renameAgent,
      uploadAgentAvatar,
      deleteAgentAvatar,
      deleteAgent,
    }),
    [
      agents,
      agentNames,
      status,
      error,
      avatarRevision,
      currentAgent,
      selectAgent,
      refresh,
      createAgent,
      updateAgent,
      renameAgent,
      uploadAgentAvatar,
      deleteAgentAvatar,
      deleteAgent,
    ],
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

/** 从 agents 列表查找单个 Agent 摘要。 */
export function findAgentSummary(agents: AgentSummary[], name: string | null | undefined): AgentSummary | undefined {
  if (!name) return undefined;
  return agents.find((a) => a.name === name);
}
