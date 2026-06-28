/**
 * 多 Agent 会话 ID 管理：agentId -> sessionId
 * 独立存储，与 chat draft 解耦，避免 saveDraft 等操作误覆盖 session。
 */

const SESSIONS_KEY = 'finclaw.chat.sessions.v1';
const SESSION_BACKUP_PREFIX = 'finclaw.chat.session.sid.';
const LEGACY_CHAT_KEY = 'finclaw.chat.v1';
const legacySidKey = (agentId: string) => `finclaw.chat.sid.${agentId}`;

export type AgentSessionMap = Record<string, string>;

/**
 * 生成新的会话 ID。会话 ID 由前端创建并持有，后端不再自动生成，
 * 这样每次（重）连接都能稳定带上同一个 sessionId。
 */
export function genSessionId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // fall through to manual generation
  }
  return `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

function readSessionMapRaw(): AgentSessionMap {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as AgentSessionMap;
    if (!data || typeof data !== 'object') return {};
    const map: AgentSessionMap = {};
    for (const [agentId, sid] of Object.entries(data)) {
      if (typeof sid === 'string' && sid.trim()) map[agentId] = sid.trim();
    }
    return map;
  } catch {
    return {};
  }
}

function writeSessionMap(map: AgentSessionMap): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(map));
  } catch {
    // quota / private mode
  }
}

function sessionBackupKey(agentId: string): string {
  return `${SESSION_BACKUP_PREFIX}${agentId}`;
}

function readSessionBackup(agentId: string): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const sid = sessionStorage.getItem(sessionBackupKey(agentId))?.trim();
    return sid || null;
  } catch {
    return null;
  }
}

function writeSessionBackup(agentId: string, sessionId: string | null): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const key = sessionBackupKey(agentId);
    const sid = sessionId?.trim() ?? '';
    if (sid) sessionStorage.setItem(key, sid);
    else sessionStorage.removeItem(key);
  } catch {
    // quota / private mode
  }
}

/** 从旧版 bucket.sessionId / finclaw.chat.sid.* 迁移到 sessions map（一次性）。 */
function migrateLegacySessions(into: AgentSessionMap): AgentSessionMap {
  const next = { ...into };
  let changed = false;

  try {
    const legacyChat = localStorage.getItem(LEGACY_CHAT_KEY);
    if (legacyChat) {
      const root = JSON.parse(legacyChat) as { agents?: Record<string, { sessionId?: string }> };
      const agents = root?.agents;
      if (agents && typeof agents === 'object') {
        for (const [agentId, bucket] of Object.entries(agents)) {
          const sid = bucket?.sessionId;
          if (typeof sid === 'string' && sid.trim() && !next[agentId]) {
            next[agentId] = sid.trim();
            changed = true;
          }
        }
      }
    }
  } catch {
    // ignore corrupt legacy root
  }

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith('finclaw.chat.sid.')) continue;
      const agentId = key.slice('finclaw.chat.sid.'.length);
      if (!agentId || next[agentId]) continue;
      const sid = localStorage.getItem(key);
      if (sid?.trim()) {
        next[agentId] = sid.trim();
        changed = true;
      }
    }
  } catch {
    // ignore
  }

  if (changed) writeSessionMap(next);
  return next;
}

let migrated = false;

function ensureSessionMap(): AgentSessionMap {
  if (!migrated) {
    migrated = true;
    const current = readSessionMapRaw();
    return migrateLegacySessions(current);
  }
  return readSessionMapRaw();
}

/** 读取全部 agent 的 sessionId map。 */
export function loadSessionMap(): AgentSessionMap {
  return { ...ensureSessionMap() };
}

/** 读取指定 agent 的 sessionId。 */
export function loadSessionId(agentId: string): string | null {
  if (!agentId) return null;
  const fromLocal = ensureSessionMap()[agentId] ?? null;
  if (fromLocal) return fromLocal;
  const fromSession = readSessionBackup(agentId);
  if (fromSession) {
    // 回填 localStorage，避免 F5 后 localStorage 尚未写入时误生成新 sessionId
    const map = ensureSessionMap();
    map[agentId] = fromSession;
    writeSessionMap(map);
  }
  return fromSession;
}

/** 写入或清除指定 agent 的 sessionId。 */
export function saveSessionId(agentId: string, sessionId: string | null): void {
  if (!agentId) return;
  const sid = sessionId?.trim() ?? '';
  writeSessionBackup(agentId, sid || null);
  const map = ensureSessionMap();
  if (sid) {
    map[agentId] = sid;
  } else {
    delete map[agentId];
  }
  writeSessionMap(map);
  try {
    localStorage.removeItem(legacySidKey(agentId));
  } catch {
    // ignore
  }
}

/** Agent 重命名时迁移 sessionId。 */
export function migrateSessionId(oldAgentId: string, newAgentId: string): void {
  if (!oldAgentId || !newAgentId || oldAgentId === newAgentId) return;
  const map = ensureSessionMap();
  const sid = map[oldAgentId];
  if (!sid) return;
  map[newAgentId] = sid;
  delete map[oldAgentId];
  writeSessionMap(map);
  writeSessionBackup(newAgentId, sid);
  writeSessionBackup(oldAgentId, null);
  try {
    localStorage.removeItem(legacySidKey(oldAgentId));
  } catch {
    // ignore
  }
}
