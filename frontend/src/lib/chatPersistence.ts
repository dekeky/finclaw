import type { ChatMessage, MessageKind, MessageRole, ProcessSegment } from '@/types';

const STORAGE_KEY = 'finclaw.chat.v1';
const TASK_STORAGE_KEY = 'finclaw.chat.task.v1';
const STORAGE_VERSION = 1 as const;
const MAX_ARCHIVED_PER_AGENT = 48;

interface AgentTaskState {
  taskStartMs?: number;
  lastTaskElapsedSec?: number;
}

type TaskRoot = Record<string, AgentTaskState>;

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
  /**
   * 归档时所属的会话 sessionId。恢复历史对话时据此把活动会话切回该 session，
   * 避免复用「最新会话」的 sessionId 导致后端缓存（from_cache）串台到历史窗口。
   * 旧归档可能没有此字段（恢复时回退为生成全新 sessionId）。
   */
  sessionId?: string;
  messages: PersistedMessage[];
}

interface AgentBucket {
  draft: PersistedMessage[];
  archived: ArchivedChat[];
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

function readTaskRoot(): TaskRoot {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(TASK_STORAGE_KEY);
    if (!raw) return migrateLegacyTaskFields();
    const data = JSON.parse(raw) as TaskRoot;
    if (!data || typeof data !== 'object') return migrateLegacyTaskFields();
    return data;
  } catch {
    return migrateLegacyTaskFields();
  }
}

function writeTaskRoot(root: TaskRoot): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(root));
  } catch {
    // quota / private mode — ignore
  }
}

/** 从 finclaw.chat.v1 bucket 迁移 task 字段到独立 key（一次性）。 */
function migrateLegacyTaskFields(): TaskRoot {
  const migrated: TaskRoot = {};
  const root = readRoot();
  for (const [agentId, bucket] of Object.entries(root.agents)) {
    const legacy = bucket as AgentBucket & Partial<AgentTaskState>;
    if (legacy.taskStartMs != null || legacy.lastTaskElapsedSec != null) {
      migrated[agentId] = {
        taskStartMs: legacy.taskStartMs,
        lastTaskElapsedSec: legacy.lastTaskElapsedSec,
      };
    }
  }
  if (Object.keys(migrated).length > 0) {
    writeTaskRoot(migrated);
  } else {
    writeTaskRoot({});
  }
  return migrated;
}

function patchTaskState(agentId: string, patch: Partial<AgentTaskState>): void {
  const root = readTaskRoot();
  const prev = root[agentId] ?? {};
  const next: AgentTaskState = { ...prev, ...patch };
  if (next.taskStartMs == null) delete next.taskStartMs;
  if (next.lastTaskElapsedSec == null) delete next.lastTaskElapsedSec;
  if (Object.keys(next).length === 0) {
    delete root[agentId];
  } else {
    root[agentId] = next;
  }
  writeTaskRoot(root);
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

export function archiveConversation(
  agentId: string,
  messages: ChatMessage[],
  sessionId?: string | null,
): void {
  if (messages.length === 0) return;
  const root = readRoot();
  const prev = root.agents[agentId] ?? emptyBucket();
  const entry: ArchivedChat = {
    id: `arch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    title: inferTitle(messages),
    updatedAt: new Date().toISOString(),
    messages: messages.map(msgToPersisted),
  };
  const sid = sessionId?.trim();
  if (sid) entry.sessionId = sid;
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
  const v = readTaskRoot()[agentId]?.taskStartMs;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** 记录或清除当前思考任务的起始时间；传 null 表示任务结束。 */
export function saveTaskStart(agentId: string, startedAtMs: number | null): void {
  patchTaskState(agentId, {
    taskStartMs: startedAtMs == null ? undefined : startedAtMs,
  });
}

/** 读取上一轮已完成任务的总耗时（秒）。 */
export function loadLastTaskElapsed(agentId: string): number | null {
  const v = readTaskRoot()[agentId]?.lastTaskElapsedSec;
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

/** 记录或清除上一轮已完成任务的总耗时（秒）。 */
export function saveLastTaskElapsed(agentId: string, seconds: number | null): void {
  patchTaskState(agentId, {
    lastTaskElapsedSec: seconds == null ? undefined : Math.max(0, Math.floor(seconds)),
  });
}
