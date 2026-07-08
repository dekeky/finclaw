import type { ChatMessage, MessageKind, MessageRole, ProcessSegment } from '@/types';
import { prepareStoredChatMessages } from '@/utils/prepareStoredChatMessages';
import { genSessionId, loadSessionId, saveSessionId } from '@/lib/agentSessions';

/**
 * 对话持久化 v2：所有对话（包括当前进行中的）统一按 conversationId 存储。
 *
 * conversationId 就是该对话的 sessionId；「当前对话」由 agentSessions 中的
 * agentId -> sessionId 指针决定。切换/恢复历史对话 = 移动指针，不复制消息数组，
 * 因此结构上不存在「当前对话与历史对话合并」的可能。
 */

const STORAGE_KEY = 'finclaw.chat.v2';
const LEGACY_STORAGE_KEY = 'finclaw.chat.v1';
const LEGACY_SESSION_DRAFT_PREFIX = 'finclaw.chat.session.draft.';
const TASK_STORAGE_KEY = 'finclaw.chat.task.v1';
const STORAGE_VERSION = 2 as const;
const MAX_CONVERSATIONS_PER_AGENT = 48;

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

export interface ConversationRecord {
  /** conversationId == 该对话的 sessionId */
  id: string;
  agentId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: PersistedMessage[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

interface PersistRoot {
  v: typeof STORAGE_VERSION;
  conversations: Record<string, ConversationRecord>;
}

function emptyRoot(): PersistRoot {
  return { v: STORAGE_VERSION, conversations: {} };
}

function safeParse(raw: string | null): PersistRoot | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as PersistRoot;
    if (data?.v !== STORAGE_VERSION || typeof data.conversations !== 'object' || !data.conversations) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function readRoot(): PersistRoot {
  if (typeof localStorage === 'undefined') return emptyRoot();
  const parsed = safeParse(localStorage.getItem(STORAGE_KEY));
  if (parsed) return parsed;
  const migrated = migrateFromV1();
  return migrated ?? emptyRoot();
}

function writeRoot(root: PersistRoot): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(root));
  } catch {
    // quota / private mode — ignore
  }
}

// ── v1 迁移 ──

interface LegacyArchivedChat {
  id: string;
  title?: string;
  updatedAt?: string;
  sessionId?: string;
  messages?: PersistedMessage[];
}

interface LegacyAgentBucket {
  draft?: PersistedMessage[];
  archived?: LegacyArchivedChat[];
}

function readLegacySessionDraft(agentId: string): PersistedMessage[] {
  if (typeof sessionStorage === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(`${LEGACY_SESSION_DRAFT_PREFIX}${agentId}`);
    if (!raw) return [];
    const rows = JSON.parse(raw) as PersistedMessage[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function cleanupLegacySessionDrafts(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const stale: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(LEGACY_SESSION_DRAFT_PREFIX)) stale.push(key);
    }
    for (const key of stale) sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function rowsContentLength(rows: PersistedMessage[]): number {
  return rows.reduce((n, row) => n + row.content.length, 0);
}

/** 一次性迁移 finclaw.chat.v1（draft/archived 结构）到 v2（统一对话表）。 */
function migrateFromV1(): PersistRoot | null {
  if (typeof localStorage === 'undefined') return null;
  let rawLegacy: string | null = null;
  try {
    rawLegacy = localStorage.getItem(LEGACY_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!rawLegacy) return null;

  try {
    const legacy = JSON.parse(rawLegacy) as { v?: number; agents?: Record<string, LegacyAgentBucket> };
    if (!legacy?.agents || typeof legacy.agents !== 'object') return null;

    // task 字段的旧版迁移依赖 v1 root，先确保它已完成
    readTaskRoot();

    const conversations: Record<string, ConversationRecord> = {};
    const now = new Date().toISOString();

    for (const [agentId, bucket] of Object.entries(legacy.agents)) {
      const archived = Array.isArray(bucket?.archived) ? bucket.archived : [];
      // v1 archived 列表 newest-first；从旧到新写入，id 冲突时保留较新的
      for (const entry of [...archived].reverse()) {
        if (!Array.isArray(entry?.messages) || entry.messages.length === 0) continue;
        const convId = entry.sessionId?.trim() || entry.id;
        conversations[convId] = {
          id: convId,
          agentId,
          title: entry.title || inferTitleFromRows(entry.messages),
          createdAt: entry.updatedAt || now,
          updatedAt: entry.updatedAt || now,
          messages: entry.messages,
        };
      }

      // v1 的 draft（localStorage）与 session draft（sessionStorage）可能因历史 bug
      // 分别属于两个不同对话：id 完全不重叠时拆成两条独立对话记录。
      const localDraft = Array.isArray(bucket?.draft) ? bucket.draft : [];
      const sessionDraft = readLegacySessionDraft(agentId);
      const localIds = new Set(localDraft.map((r) => r.id));
      const disjoint =
        localDraft.length > 0 &&
        sessionDraft.length > 0 &&
        sessionDraft.every((r) => !localIds.has(r.id));

      let activeRows: PersistedMessage[];
      if (disjoint) {
        // sessionStorage 那份是本 tab 最后展示的对话 → 作为当前对话；
        // localStorage 那份是被覆盖失败的另一个对话 → 存成独立历史记录。
        activeRows = sessionDraft;
        const orphanId = genSessionId();
        conversations[orphanId] = {
          id: orphanId,
          agentId,
          title: inferTitleFromRows(localDraft),
          createdAt: now,
          updatedAt: now,
          messages: localDraft,
        };
      } else {
        activeRows =
          rowsContentLength(localDraft) >= rowsContentLength(sessionDraft) ? localDraft : sessionDraft;
      }

      if (activeRows.length > 0) {
        let convId = loadSessionId(agentId);
        if (!convId) {
          convId = genSessionId();
          saveSessionId(agentId, convId);
        }
        conversations[convId] = {
          id: convId,
          agentId,
          title: inferTitleFromRows(activeRows),
          createdAt: conversations[convId]?.createdAt ?? now,
          updatedAt: now,
          messages: activeRows,
        };
      }
    }

    const root: PersistRoot = { v: STORAGE_VERSION, conversations };
    writeRoot(root);
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // ignore
    }
    cleanupLegacySessionDrafts();
    return root;
  } catch {
    return null;
  }
}

// ── task 状态存储（独立 key，按 agent） ──

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

/** 从 v1 bucket 迁移 task 字段到独立 key（一次性；直接读 legacy key，不依赖 v1 root 结构）。 */
function migrateLegacyTaskFields(): TaskRoot {
  const migrated: TaskRoot = {};
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LEGACY_STORAGE_KEY) : null;
    if (raw) {
      const root = JSON.parse(raw) as { agents?: Record<string, Partial<AgentTaskState>> };
      for (const [agentId, bucket] of Object.entries(root?.agents ?? {})) {
        if (bucket?.taskStartMs != null || bucket?.lastTaskElapsedSec != null) {
          migrated[agentId] = {
            taskStartMs: bucket.taskStartMs,
            lastTaskElapsedSec: bucket.lastTaskElapsedSec,
          };
        }
      }
    }
  } catch {
    // ignore corrupt legacy root
  }
  writeTaskRoot(migrated);
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

// ── 消息序列化 ──

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

function persistedToMessages(rows: PersistedMessage[]): ChatMessage[] {
  return rows.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    timestamp: new Date(m.timestamp),
    kind: m.kind,
    processSegments: m.processSegments,
  }));
}

function inferTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  return titleFromContent(firstUser?.content);
}

function inferTitleFromRows(rows: PersistedMessage[]): string {
  const firstUser = rows.find((m) => m.role === 'user');
  return titleFromContent(firstUser?.content);
}

function titleFromContent(raw: string | undefined): string {
  const oneLine = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (!oneLine) {
    return `对话 · ${new Date().toLocaleString()}`;
  }
  const max = 56;
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max).trimEnd()}…`;
}

/** 超过上限时淘汰该 agent 最旧的对话（按 updatedAt）。 */
function pruneAgentConversations(root: PersistRoot, agentId: string): void {
  const mine = Object.values(root.conversations)
    .filter((c) => c.agentId === agentId)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  for (const stale of mine.slice(MAX_CONVERSATIONS_PER_AGENT)) {
    delete root.conversations[stale.id];
  }
}

// ── 对话读写（唯一入口） ──

/** 读取指定对话的消息。 */
export function loadConversation(convId: string | null | undefined): ChatMessage[] {
  if (!convId) return [];
  const rec = readRoot().conversations[convId];
  if (!rec?.messages?.length) return [];
  return prepareStoredChatMessages(persistedToMessages(rec.messages));
}

/** 读取指定 agent 当前活动对话（由 agentSessions 指针决定）的消息。 */
export function loadActiveConversation(agentId: string): ChatMessage[] {
  return loadConversation(loadSessionId(agentId));
}

/** 清空指定对话的消息内容，但保留该条历史记录本身（不删除 conversation 条目）。 */
export function clearConversationContent(agentId: string, convId: string | null | undefined): void {
  if (!convId) return;
  const root = readRoot();
  const prev = root.conversations[convId];
  const now = new Date().toISOString();
  root.conversations[convId] = {
    id: convId,
    agentId,
    title: prev?.title ?? `对话 · ${new Date().toLocaleString()}`,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
    messages: [],
  };
  writeRoot(root);
}

/** 写入指定对话的消息（对话不存在则创建；每次全量覆盖该对话自己的记录）。 */
export function saveConversation(
  agentId: string,
  convId: string | null | undefined,
  messages: ChatMessage[],
): void {
  if (!convId || messages.length === 0) return;
  const rows = prepareStoredChatMessages(messages).map(msgToPersisted);
  const root = readRoot();
  const prev = root.conversations[convId];
  const now = new Date().toISOString();
  root.conversations[convId] = {
    id: convId,
    agentId,
    title: inferTitle(messages),
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
    messages: rows,
  };
  pruneAgentConversations(root, agentId);
  writeRoot(root);
}

/** 写入指定 agent 当前活动对话的消息。 */
export function saveActiveConversation(agentId: string, messages: ChatMessage[]): void {
  saveConversation(agentId, loadSessionId(agentId), messages);
}

/** 删除指定对话。 */
export function deleteConversation(convId: string): boolean {
  const root = readRoot();
  if (!root.conversations[convId]) return false;
  delete root.conversations[convId];
  writeRoot(root);
  return true;
}

/** 列出指定 agent 的全部对话（含当前对话），按最近更新排序。 */
export function listConversations(agentId: string): ConversationSummary[] {
  const root = readRoot();
  return Object.values(root.conversations)
    .filter((c) => c.agentId === agentId)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt,
      messageCount: c.messages.length,
    }));
}

// ── 任务计时状态 ──

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
