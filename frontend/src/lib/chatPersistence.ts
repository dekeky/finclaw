import type { ChatMessage, MessageKind, MessageRole, ProcessSegment } from '@/types';

const STORAGE_KEY = 'finclaw.chat.v1';
const STORAGE_VERSION = 1 as const;
const MAX_ARCHIVED_PER_AGENT = 48;

export interface PersistedMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  kind?: MessageKind;
  processSegments?: ProcessSegment[];
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
  /** 当前进行中思考任务的起始时间戳（ms）。任务结束后清空。 */
  taskStartMs?: number;
  /** 上一轮已完成任务的总耗时（秒），供刷新后在工作过程面板展示。 */
  lastTaskElapsedSec?: number;
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
  const row: PersistedMessage = {
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: (m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp)).toISOString(),
  };
  if (m.kind) row.kind = m.kind;
  if (m.processSegments?.length) row.processSegments = m.processSegments;
  return row;
}

export function persistedToMessages(rows: PersistedMessage[]): ChatMessage[] {
  return rows.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: new Date(m.timestamp),
    kind: m.kind,
    processSegments: m.processSegments,
  }));
}

export function loadDraft(agentId: string): ChatMessage[] {
  const root = readRoot();
  const bucket = root.agents[agentId];
  if (!bucket?.draft?.length) return [];
  return persistedToMessages(bucket.draft);
}

export function saveDraft(agentId: string, messages: ChatMessage[]): void {
  const root = readRoot();
  const prev = root.agents[agentId] ?? emptyBucket();
  root.agents[agentId] = {
    ...prev,
    draft: messages.map(msgToPersisted),
  };
  writeRoot(root);
}

export function clearDraft(agentId: string): void {
  const root = readRoot();
  const prev = root.agents[agentId];
  if (!prev) return;
  root.agents[agentId] = { ...prev, draft: [] };
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

export function archiveConversation(agentId: string, messages: ChatMessage[]): void {
  if (messages.length === 0) return;
  const root = readRoot();
  const prev = root.agents[agentId] ?? emptyBucket();
  const entry: ArchivedChat = {
    id: `arch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    title: inferTitle(messages),
    updatedAt: new Date().toISOString(),
    messages: messages.map(msgToPersisted),
  };
  const archived = [entry, ...prev.archived].slice(0, MAX_ARCHIVED_PER_AGENT);
  root.agents[agentId] = {
    ...prev,
    archived,
  };
  writeRoot(root);
}

export function listArchived(agentId: string): ArchivedChat[] {
  const root = readRoot();
  return [...(root.agents[agentId]?.archived ?? [])];
}

export function deleteArchived(agentId: string, archiveId: string): boolean {
  const root = readRoot();
  const prev = root.agents[agentId];
  if (!prev?.archived?.length) return false;
  const next = prev.archived.filter((a) => a.id !== archiveId);
  if (next.length === prev.archived.length) return false;
  root.agents[agentId] = { ...prev, archived: next };
  writeRoot(root);
  return true;
}

/** 读取当前正在进行的思考任务起始时间（ms）；无任务时返回 null。 */
export function loadTaskStart(agentId: string): number | null {
  const root = readRoot();
  const v = root.agents[agentId]?.taskStartMs;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** 记录或清除当前思考任务的起始时间；传 null 表示任务结束。 */
export function saveTaskStart(agentId: string, startedAtMs: number | null): void {
  const root = readRoot();
  const prev = root.agents[agentId] ?? emptyBucket();
  root.agents[agentId] = {
    ...prev,
    taskStartMs: startedAtMs == null ? undefined : startedAtMs,
  };
  writeRoot(root);
}

/** 读取上一轮已完成任务的总耗时（秒）。 */
export function loadLastTaskElapsed(agentId: string): number | null {
  const root = readRoot();
  const v = root.agents[agentId]?.lastTaskElapsedSec;
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

/** 记录或清除上一轮已完成任务的总耗时（秒）。 */
export function saveLastTaskElapsed(agentId: string, seconds: number | null): void {
  const root = readRoot();
  const prev = root.agents[agentId] ?? emptyBucket();
  root.agents[agentId] = {
    ...prev,
    lastTaskElapsedSec: seconds == null ? undefined : Math.max(0, Math.floor(seconds)),
  };
  writeRoot(root);
}
