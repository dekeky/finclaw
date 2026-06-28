import type { ChatMessage, MessageKind, MessageRole, ProcessSegment } from '@/types';
import { prepareStoredChatMessages } from '@/utils/prepareStoredChatMessages';

const STORAGE_KEY = 'finclaw.chat.v1';
const TASK_STORAGE_KEY = 'finclaw.chat.task.v1';
const SESSION_DRAFT_PREFIX = 'finclaw.chat.session.draft.';
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

function sessionDraftKey(agentId: string): string {
  return `${SESSION_DRAFT_PREFIX}${agentId}`;
}

function readSessionDraftRows(agentId: string): PersistedMessage[] {
  if (typeof sessionStorage === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(sessionDraftKey(agentId));
    if (!raw) return [];
    const rows = JSON.parse(raw) as PersistedMessage[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function writeSessionDraftRows(agentId: string, rows: PersistedMessage[]): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const key = sessionDraftKey(agentId);
    if (rows.length === 0) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(rows));
  } catch {
    // quota / private mode — ignore
  }
}

function rowsFromPrepared(msgs: ChatMessage[]): PersistedMessage[] {
  return prepareStoredChatMessages(msgs).map(msgToPersisted);
}

/** 按 id 合并两份草稿；先折叠再比内容量，避免条数多但未折叠的那份覆盖完整过程。 */
function mergeDraftRows(a: PersistedMessage[], b: PersistedMessage[]): PersistedMessage[] {
  if (a.length === 0) return b;
  if (b.length === 0) return a;

  const rowsA = rowsFromPrepared(persistedToMessages(a));
  const rowsB = rowsFromPrepared(persistedToMessages(b));
  const richer = draftContentLength(rowsA) >= draftContentLength(rowsB) ? rowsA : rowsB;
  const poorer = richer === rowsA ? rowsB : rowsA;

  const byId = new Map<string, PersistedMessage>();
  for (const row of [...poorer, ...richer]) {
    const prev = byId.get(row.id);
    if (!prev || row.content.length >= prev.content.length) {
      byId.set(row.id, row);
    }
  }

  const seen = new Set<string>();
  const merged: PersistedMessage[] = [];
  for (const row of richer) {
    merged.push(byId.get(row.id) ?? row);
    seen.add(row.id);
  }
  for (const row of poorer) {
    if (!seen.has(row.id)) {
      merged.push(byId.get(row.id)!);
      seen.add(row.id);
    }
  }
  return merged;
}

function draftContentLength(rows: PersistedMessage[]): number {
  return rows.reduce((n, row) => n + row.content.length, 0);
}

/**
 * 拒绝明显过期的写回：旧页面 pagehide 与新页面 mount 并发时，
 * 可能用更短的 draft 覆盖刚落盘的完整对话（远程网络慢时更易复现）。
 * 折叠 process 消息会减少条数但内容量不变，因此不能只看 length。
 */
function isStaleDraftWrite(prev: PersistedMessage[], next: PersistedMessage[]): boolean {
  if (next.length === 0) return true;
  if (prev.length === 0) return false;
  const nextIds = new Set(next.map((r) => r.id));
  if (prev.every((r) => nextIds.has(r.id))) return false;
  if (draftContentLength(next) >= draftContentLength(prev)) return false;
  return next.length <= prev.length;
}

export function loadDraft(agentId: string): ChatMessage[] {
  const root = readRoot();
  const fromLocal = root.agents[agentId]?.draft ?? [];
  const fromSession = readSessionDraftRows(agentId);
  const merged = mergeDraftRows(fromLocal, fromSession);
  if (!merged.length) return [];
  return prepareStoredChatMessages(persistedToMessages(merged));
}

export function saveDraft(agentId: string, messages: ChatMessage[]): void {
  if (messages.length === 0) return;
  const rows = prepareStoredChatMessages(messages).map(msgToPersisted);
  writeSessionDraftRows(agentId, rows);

  const root = readRoot();
  const prev = root.agents[agentId] ?? emptyBucket();
  const prevDraft = prev.draft ?? [];
  if (isStaleDraftWrite(prevDraft, rows)) return;

  root.agents[agentId] = {
    ...prev,
    draft: rows,
  };
  writeRoot(root);
}

export function clearDraft(agentId: string): void {
  writeSessionDraftRows(agentId, []);
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
