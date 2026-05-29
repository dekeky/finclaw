import type { ChatMessage, MessageRole } from '@/types';

const STORAGE_KEY = 'finclaw.chat.v1';
const STORAGE_VERSION = 1 as const;
const MAX_ARCHIVED_PER_AGENT = 48;

export interface PersistedMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
}

export interface ArchivedChat {
  id: string;
  title: string;
  updatedAt: string;
  messages: PersistedMessage[];
}

interface AgentBucket {
  draft: PersistedMessage[];
  archived: ArchivedChat[];
  sessionId?: string;
}

interface PersistRoot {
  v: typeof STORAGE_VERSION;
  agents: Record<string, AgentBucket>;
}

function emptyBucket(): AgentBucket {
  return { draft: [], archived: [] };
}

function safeParse(raw: string | null): PersistRoot | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as PersistRoot;
    if (data?.v !== STORAGE_VERSION || typeof data.agents !== 'object' || !data.agents) return null;
    return data;
  } catch {
    return null;
  }
}

function readRoot(): PersistRoot {
  if (typeof localStorage === 'undefined') {
    return { v: STORAGE_VERSION, agents: {} };
  }
  const parsed = safeParse(localStorage.getItem(STORAGE_KEY));
  return parsed ?? { v: STORAGE_VERSION, agents: {} };
}

function writeRoot(root: PersistRoot): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
  } catch {
    // quota / private mode — ignore
  }
}

function msgToPersisted(m: ChatMessage): PersistedMessage {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: (m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp)).toISOString(),
  };
}

export function persistedToMessages(rows: PersistedMessage[]): ChatMessage[] {
  return rows.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: new Date(m.timestamp),
  }));
}

export function loadDraft(agentName: string): ChatMessage[] {
  const root = readRoot();
  const bucket = root.agents[agentName];
  if (!bucket?.draft?.length) return [];
  return persistedToMessages(bucket.draft);
}

export function saveDraft(agentName: string, messages: ChatMessage[]): void {
  const root = readRoot();
  const prev = root.agents[agentName] ?? emptyBucket();
  root.agents[agentName] = {
    ...prev,
    draft: messages.map(msgToPersisted),
  };
  writeRoot(root);
}

export function clearDraft(agentName: string): void {
  const root = readRoot();
  const prev = root.agents[agentName];
  if (!prev) return;
  root.agents[agentName] = { ...prev, draft: [] };
  writeRoot(root);
}

function inferTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  const raw = firstUser?.content?.trim() ?? '';
  const oneLine = raw.replace(/\s+/g, ' ');
  if (!oneLine) {
    return `对话 · ${new Date().toLocaleString()}`;
  }
  const max = 56;
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max).trimEnd()}…`;
}

export function archiveConversation(agentName: string, messages: ChatMessage[]): void {
  if (messages.length === 0) return;
  const root = readRoot();
  const prev = root.agents[agentName] ?? emptyBucket();
  const entry: ArchivedChat = {
    id: `arch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    title: inferTitle(messages),
    updatedAt: new Date().toISOString(),
    messages: messages.map(msgToPersisted),
  };
  const archived = [entry, ...prev.archived].slice(0, MAX_ARCHIVED_PER_AGENT);
  root.agents[agentName] = {
    ...prev,
    archived,
  };
  writeRoot(root);
}

export function listArchived(agentName: string): ArchivedChat[] {
  const root = readRoot();
  return [...(root.agents[agentName]?.archived ?? [])];
}

export function deleteArchived(agentName: string, archiveId: string): boolean {
  const root = readRoot();
  const prev = root.agents[agentName];
  if (!prev?.archived?.length) return false;
  const next = prev.archived.filter((a) => a.id !== archiveId);
  if (next.length === prev.archived.length) return false;
  root.agents[agentName] = { ...prev, archived: next };
  writeRoot(root);
  return true;
}

export function loadSessionId(agentName: string): string | null {
  const root = readRoot();
  return root.agents[agentName]?.sessionId ?? null;
}

export function saveSessionId(agentName: string, sessionId: string | null): void {
  const root = readRoot();
  const prev = root.agents[agentName] ?? emptyBucket();
  root.agents[agentName] = { ...prev, sessionId: sessionId ?? undefined };
  writeRoot(root);
}
