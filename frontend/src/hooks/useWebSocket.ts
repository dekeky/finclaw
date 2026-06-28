import { useEffect, useRef, useState, useCallback } from 'react';
import { flushSync } from 'react-dom';
import type { ChatMessage, ConnectionStatus, MessageKind, WSMessage } from '../types';
import { foldConsecutiveProcessMessages, hasMessageId } from '../utils/foldProcessMessages';
import { hasCompleteReplyInTurn, isChatTaskActive, isIncompleteChatTask, resolveRestoredTaskState } from '../utils/chatTaskState';
import { isPicoclawToolFeedbackContent } from '../utils/foldPicoclawToolFeedback';
import { isAssistantThoughtOnlyContent } from '../utils/splitAssistantContent';
import { prepareStoredChatMessages } from '../utils/prepareStoredChatMessages';
import {
  genSessionId,
  loadSessionId,
  loadSessionMap,
  saveSessionId,
} from '@/lib/agentSessions';
import {
  clearDraft,
  loadDraft,
  saveDraft,
  loadTaskStart,
  saveTaskStart,
  loadLastTaskElapsed,
  saveLastTaskElapsed,
} from '@/lib/chatPersistence';
import { getToken, clearToken } from '../api/auth';
import { normalizeSlashInput } from '@/components/ChatSlashHints';

const RECONNECT_DELAY = 2000;
const MAX_RECONNECT = 5;
const PING_INTERVAL = 30000;
/** 长时间无助手回复时收起「正在思考」（避免一直转圈） */
const TYPING_FALLBACK_MS = 120_000;
/** 发送消息后等待服务端确认的超时时间；超时则判定连接已死并重连 */
const SEND_CONFIRM_TIMEOUT = 10_000;

function genId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** 从 connected 帧解析 session_id（前端持有并持久化，服务端仅回显握手时的值）。 */
function extractConnectedSessionId(msg: WSMessage): string | null {
  const rec = msg as WSMessage & { sessionId?: string };
  const payload = msg.payload as Record<string, unknown> | undefined;
  const candidates = [msg.session_id, rec.sessionId, payload?.session_id, payload?.client_id];
  for (const raw of candidates) {
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return null;
}

function inferMessageKind(content: string, messageKind?: string): MessageKind | undefined {
  if (messageKind === 'reasoning') return 'thought';
  if (isPicoclawToolFeedbackContent(content)) return 'tool';
  if (isAssistantThoughtOnlyContent(content)) return 'thought';
  return 'reply';
}

function parseWsChatMessage(msg: WSMessage, content: string, role: 'user' | 'assistant'): ChatMessage {
  const messageKind =
    typeof msg.payload?.message_kind === 'string' ? msg.payload.message_kind : undefined;
  const attachments = Array.isArray(msg.payload?.attachments)
    ? msg.payload!.attachments!.filter((a) => a && typeof a.url === 'string')
    : undefined;
  return {
    id: msg.id || genId(),
    role,
    content,
    timestamp: new Date(),
    kind: role === 'assistant' ? inferMessageKind(content, messageKind) : undefined,
    attachments: attachments && attachments.length > 0 ? attachments : undefined,
  };
}

function foldChatMessages(msgs: ChatMessage[]): ChatMessage[] {
  return foldConsecutiveProcessMessages(msgs);
}

function upsertChatMessage(prev: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
  // 若 id 已在某条折叠 process 消息的 sourceIds 中，视为已显示，跳过避免重复
  if (hasMessageId(prev, incoming.id)) {
    const idx = prev.findIndex((m) => m.id === incoming.id);
    if (idx < 0) {
      // 仅在 sourceIds 中找到 → 已经合并显示，无需任何变化
      return prev;
    }
    const existing = prev[idx];
    // 顶层 id 命中：内容/类型若一致则不变；否则只更新本条而不破坏其它折叠状态
    if (existing.content === incoming.content && existing.kind === incoming.kind) {
      return prev;
    }
    // 走更新分支前，确认这并不是「折叠 process 消息的首条 sourceId 与 incoming id 相同」的情况，
    // 否则会把已折叠的合并内容覆盖成单条
    if (existing.processSegments?.length && existing.processSegments.some((s) => s.sourceIds && s.sourceIds.length > 1)) {
      // 该 process 消息已合并多条，不应被一条 from_cache 覆盖；忽略此次重放
      return prev;
    }
    const next = [...prev];
    next[idx] = {
      ...existing,
      content: incoming.content,
      kind: incoming.kind ?? existing.kind,
      processSegments: incoming.processSegments ?? existing.processSegments,
    };
    return foldChatMessages(next);
  }
  return foldChatMessages([...prev, incoming]);
}

/** 检测 picoclaw steering drain 误将用户输入以 assistant 角色回显的情况 */
function isEchoedUserReply(prev: ChatMessage[], content: string, role: string): boolean {
  if (role === 'user') return false;
  const trimmed = content.trim();
  if (!trimmed) return false;
  for (let i = prev.length - 1; i >= 0; i--) {
    if (prev[i].role === 'user') {
      return prev[i].content.trim() === trimmed;
    }
  }
  return false;
}

function parseHistory(raw: WSMessage): ChatMessage[] {
  if (!raw.payload?.messages) return [];
  return prepareStoredChatMessages(
    raw.payload.messages.map((m) => {
      const role = m.role === 'user' ? 'user' : 'assistant';
      return {
        id: m.id || genId(),
        role,
        content: m.content,
        timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
        kind: role === 'assistant' ? inferMessageKind(m.content) : undefined,
      };
    }),
  );
}

export interface UseWebSocketReturn {
  messages: ChatMessage[];
  status: ConnectionStatus;
  isTyping: boolean;
  sendError: string | null;
  send: (content: string, media?: string[]) => void;
  /** 收起「正在思考」指示（仅本地 UI，不中断服务端生成） */
  stop: () => void;
  clearMessages: (opts?: { startNewSession?: boolean }) => void;
  /**
   * 将归档/历史消息载入当前会话并写入本地草稿。
   * 传入 sessionId 时把活动会话切回该归档自己的 session（缺失则生成全新 session），
   * 并重连让连接重新绑定，避免后端把「最新会话」的缓存补发到历史窗口。
   */
  restoreMessages: (messages: ChatMessage[], sessionId?: string | null) => void;
  /** 读取当前活动会话的 sessionId（归档时记录用）。 */
  getSessionId: () => string | null;
  reconnect: () => void;
  /**
   * 当前思考任务的起始时间（ms）。挂载时若 localStorage 中存有未完成任务，会被恢复，
   * 用于让计时器跨刷新延续显示总耗时；任务结束时置 null 并清除持久化值。
   */
  taskStartedAt: number | null;
  /** 上一轮已完成任务的总耗时（秒），刷新后供工作过程面板展示。 */
  completedTaskElapsedSec: number | null;
}

export interface UseWebSocketOptions {
  /** 传入后将把当前会话草稿存入 localStorage（按 Agent 隔离），刷新后可恢复 */
  persistAgentKey?: string | null;
}

/**
 * useWebSocket：维护一条与 Finclaw 后端的 WS 长连接。
 *
 * 当 `url` 为 `null` 时表示尚未选定 Agent，hook 会保持 idle 状态、不发起连接，
 * 也会在 url 切换时主动断开旧连接并清空历史，避免不同 Agent 的消息串流。
 */
export function useWebSocket(url: string | null, options?: UseWebSocketOptions): UseWebSocketReturn {
  const persistAgentKey = options?.persistAgentKey ?? null;
  const persistAgentKeyRef = useRef(persistAgentKey);
  persistAgentKeyRef.current = persistAgentKey;
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    persistAgentKey ? loadDraft(persistAgentKey) : [],
  );
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [isTyping, setIsTyping] = useState(() => {
    if (!persistAgentKey) return false;
    const restored = loadDraft(persistAgentKey);
    // 仅「已发送、等待首条助手回复」时恢复 typing；有 process 草稿时不强开，避免 refresh 后误判
    return isChatTaskActive(restored, false);
  });
  const [sendError, setSendError] = useState<string | null>(null);
  /** 当前思考任务的起始时间戳（ms）；null 表示无进行中任务 */
  // 初始化时直接从 persistence 读取，确保 ChatContainer 首帧就能拿到正确的时间戳
  const [taskStartedAt, setTaskStartedAt] = useState<number | null>(() => {
    if (!persistAgentKey) return null;
    const restored = loadDraft(persistAgentKey);
    if (hasCompleteReplyInTurn(restored)) return null;
    return loadTaskStart(persistAgentKey);
  });
  const [completedTaskElapsedSec, setCompletedTaskElapsedSec] = useState<number | null>(() => {
    return persistAgentKey ? loadLastTaskElapsed(persistAgentKey) : null;
  });
  /** 与 taskStartedAt 同步，用于在 callback 内避免重复 beginTask */
  const taskStartedAtRef = useRef<number | null>(null);
  taskStartedAtRef.current = taskStartedAt;
  const wsRef = useRef<WebSocket | null>(null);
  /** 多 Agent：agentId -> sessionId（内存 map，与 localStorage sessions map 同步） */
  const sessionByAgentRef = useRef<Map<string, string>>(new Map(Object.entries(loadSessionMap())));
  const reconnectCountRef = useRef(0);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const urlRef = useRef<string | null>(url);
  /** 最近一次收到消息的时间戳，用于 visibility 恢复时检测静默断连（0 = 尚未收到任何消息） */
  const lastActivityRef = useRef(0);
  /** 防止并发 connect() 调用 */
  const connectingRef = useRef(false);
  /** 始终指向最新 messages，供卸载 cleanup / pagehide 同步落盘 */
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;

  /** 流式更新时节流落盘，避免每条 token 都写 storage。 */
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** from_cache 重放批量合并，避免刷新后逐条 setState 导致过程面板闪烁。 */
  const cacheInboxRef = useRef<
    { incoming: ChatMessage; role: string; inProgress: boolean }[]
  >([]);
  const cacheFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleDraftSave = useCallback(() => {
    const agentId = persistAgentKeyRef.current;
    if (!agentId) return;
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = setTimeout(() => {
      draftSaveTimerRef.current = null;
      if (persistAgentKeyRef.current !== agentId) return;
      const msgs = messagesRef.current;
      if (msgs.length > 0) saveDraft(agentId, msgs);
    }, 150);
  }, []);

  /** 在 setState 回调内同步更新 ref，避免 pagehide 早于下一次 render 时落到旧快照。 */
  const commitMessages = useCallback((next: ChatMessage[]): ChatMessage[] => {
    messagesRef.current = next;
    scheduleDraftSave();
    return next;
  }, [scheduleDraftSave]);

  const flushDraftNow = useCallback((agentIdOverride?: string | null) => {
    const agentId = agentIdOverride ?? persistAgentKeyRef.current;
    if (!agentId) return;
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    const msgs = messagesRef.current;
    if (msgs.length > 0) saveDraft(agentId, msgs);
  }, []);

  const flushTaskNow = useCallback((agentIdOverride?: string | null) => {
    const agentId = agentIdOverride ?? persistAgentKeyRef.current;
    if (!agentId) return;
    const start = taskStartedAtRef.current;
    if (start != null) {
      saveTaskStart(agentId, start);
      return;
    }
    const msgs = messagesRef.current;
    if (!isIncompleteChatTask(msgs) && !isChatTaskActive(msgs, false)) {
      saveTaskStart(agentId, null);
    }
  }, []);

  /** 读取指定 agent 的 sessionId（内存 map → localStorage sessions map）。 */
  const getSessionForAgent = useCallback((agentId: string | null | undefined): string | null => {
    if (!agentId) return null;
    const cached = sessionByAgentRef.current.get(agentId);
    if (cached) return cached;
    const stored = loadSessionId(agentId);
    if (stored) sessionByAgentRef.current.set(agentId, stored);
    return stored;
  }, []);

  /** 写入指定 agent 的 sessionId 到内存 map 与 localStorage。 */
  const setSessionForAgent = useCallback((agentId: string | null | undefined, sessionId: string | null) => {
    if (!agentId) return;
    const sid = sessionId?.trim() ?? '';
    if (sid) {
      sessionByAgentRef.current.set(agentId, sid);
      saveSessionId(agentId, sid);
    } else {
      sessionByAgentRef.current.delete(agentId);
      saveSessionId(agentId, null);
    }
  }, []);

  const getCurrentSessionId = useCallback((): string | null => {
    return getSessionForAgent(persistAgentKeyRef.current);
  }, [getSessionForAgent]);

  /**
   * 读取指定 agent 的 sessionId；不存在则现场生成并持久化。
   * 后端已不再生成 sessionId，因此（重）连接前必须保证本地已有一个。
   */
  const ensureSessionForAgent = useCallback(
    (agentId: string | null | undefined): string | null => {
      if (!agentId) return null;
      const existing = getSessionForAgent(agentId);
      if (existing) return existing;
      const sid = genSessionId();
      setSessionForAgent(agentId, sid);
      return sid;
    },
    [getSessionForAgent, setSessionForAgent],
  );

  /** 将 connected 收到的 sessionId 写入当前 agent 的 map 条目。 */
  const applySessionId = useCallback(
    (incoming: string) => {
      const agentId = persistAgentKeyRef.current;
      const sid = incoming.trim();
      if (!sid) return;
      if (!agentId) {
        console.warn('[Finclaw WS] sessionId received but persistAgentKey is null:', sid);
        return;
      }
      setSessionForAgent(agentId, sid);
      console.log('[Finclaw WS] sessionId persisted:', sid, 'agentId=', agentId);
    },
    [setSessionForAgent],
  );

  /** 将指定 agent（默认当前）的 sessionId 刷入 localStorage。 */
  const persistSessionId = useCallback((agentIdOverride?: string | null) => {
    const agentId = agentIdOverride ?? persistAgentKeyRef.current;
    if (!agentId) return;
    const sid = sessionByAgentRef.current.get(agentId);
    if (sid) saveSessionId(agentId, sid);
  }, []);

  /** 开启一次思考任务：写入起始时间戳并持久化，刷新后可恢复。 */
  const beginTask = useCallback((opts?: { forceNew?: boolean }) => {
    const agentId = persistAgentKeyRef.current;
    if (!opts?.forceNew) {
      let resumed = taskStartedAtRef.current;
      if (resumed == null && agentId) resumed = loadTaskStart(agentId);
      if (resumed != null) {
        taskStartedAtRef.current = resumed;
        setTaskStartedAt(resumed);
        return;
      }
    }
    const now = Date.now();
    taskStartedAtRef.current = now;
    setTaskStartedAt(now);
    setCompletedTaskElapsedSec(null);
    if (agentId) {
      saveTaskStart(agentId, now);
      saveLastTaskElapsed(agentId, null);
    }
  }, []);

  /** 关闭当前思考任务并清除持久化值。 */
  const endTask = useCallback(() => {
    const start = taskStartedAtRef.current;
    if (start != null) {
      const elapsed = Math.max(0, Math.floor((Date.now() - start) / 1000));
      setCompletedTaskElapsedSec(elapsed);
      if (persistAgentKeyRef.current) {
        saveLastTaskElapsed(persistAgentKeyRef.current, elapsed);
      }
    }
    taskStartedAtRef.current = null;
    setTaskStartedAt(null);
    if (persistAgentKeyRef.current) {
      saveTaskStart(persistAgentKeyRef.current, null);
    }
  }, []);

  const reset = useCallback(() => {
    if (typingFallbackRef.current) {
      clearTimeout(typingFallbackRef.current);
      typingFallbackRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (sendConfirmTimerRef.current) {
      clearTimeout(sendConfirmTimerRef.current);
      sendConfirmTimerRef.current = null;
    }
    if (pingTimerRef.current) clearInterval(pingTimerRef.current);
    pingTimerRef.current = null;
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    if (cacheFlushTimerRef.current) {
      clearTimeout(cacheFlushTimerRef.current);
      cacheFlushTimerRef.current = null;
    }
    cacheInboxRef.current = [];
    connectingRef.current = false;
    if (wsRef.current) {
      console.log('[Finclaw WS] reset: closing existing ws, readyState=', wsRef.current.readyState);
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const clearSendConfirm = useCallback(() => {
    if (sendConfirmTimerRef.current) {
      clearTimeout(sendConfirmTimerRef.current);
      sendConfirmTimerRef.current = null;
    }
  }, []);

  const startPing = useCallback(() => {
    if (pingTimerRef.current) clearInterval(pingTimerRef.current);
    pingTimerRef.current = setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'ping', id: genId() }));
      // 注意：不在发送 ping 时更新 lastActivityRef，否则活体检测失效。
      // lastActivityRef 仅在收到服务端消息时更新（见 handleIncoming 入口），
      // 确保"发得出但收不到"的幽灵连接能被正确识别。
    }, PING_INTERVAL);
  }, []);

  const handleIncoming = useCallback((msg: WSMessage) => {
    lastActivityRef.current = Date.now();
    // 收到任何服务端消息 → 连接存活，清除发送确认超时
    clearSendConfirm();
    const clearTypingFallback = () => {
      if (typingFallbackRef.current) {
        clearTimeout(typingFallbackRef.current);
        typingFallbackRef.current = null;
      }
    };
    const armTypingFallback = () => {
      clearTypingFallback();
      typingFallbackRef.current = setTimeout(() => {
        typingFallbackRef.current = null;
        setIsTyping(false);
      }, TYPING_FALLBACK_MS);
    };

    console.log('[Finclaw WS] Received:', msg.type, msg.payload);
    switch (msg.type) {
      case 'connected': {
        const incoming = extractConnectedSessionId(msg);
        if (incoming) {
          applySessionId(incoming);
        } else if (!getCurrentSessionId() && persistAgentKeyRef.current) {
          const stored = loadSessionId(persistAgentKeyRef.current);
          if (stored) applySessionId(stored);
        }
        console.log('[Finclaw WS] SessionID set to:', getCurrentSessionId());
        break;
      }

      case 'pong':
        // 服务端 JSON pong：更新活动时间，避免 visibility 探活误判为死连接
        break;

      case 'history': {
        const history = parseHistory(msg);
        if (history.length === 0) break;
        setMessages((prev) => {
          const ids = new Set(prev.map((m) => m.id));
          const deduped = history.filter((m) => !ids.has(m.id));
          return commitMessages(foldChatMessages([...prev, ...deduped]));
        });
        break;
      }

      case 'message.send':
      case 'message_create': {
        const content = typeof msg.payload?.content === 'string' ? msg.payload.content : msg.content ?? '';
        const role = msg.payload?.role || 'assistant';
        const hasAttachments = Array.isArray(msg.payload?.attachments) && msg.payload!.attachments!.length > 0;
        if (!content && !hasAttachments) {
          console.warn('[Finclaw WS] Empty content in message.send:', msg);
          break;
        }
        if (isEchoedUserReply(messagesRef.current, content, role)) {
          console.log('[Finclaw WS] Skipping echoed user message mislabeled as assistant:', content.slice(0, 64));
          break;
        }
        const incoming = parseWsChatMessage(msg, content, role === 'user' ? 'user' : 'assistant');
        const fromCache = (msg as any).from_cache === true;
        const messageKind =
          typeof msg.payload?.message_kind === 'string' ? msg.payload.message_kind : undefined;
        const inProgress =
          messageKind === 'reasoning' ||
          isPicoclawToolFeedbackContent(content) ||
          isAssistantThoughtOnlyContent(content);

        if (fromCache) {
          cacheInboxRef.current.push({ incoming, role, inProgress });
          if (!cacheFlushTimerRef.current) {
            cacheFlushTimerRef.current = setTimeout(() => {
              cacheFlushTimerRef.current = null;
              const batch = cacheInboxRef.current;
              cacheInboxRef.current = [];
              if (batch.length === 0) return;

              setMessages((prev) => {
                let next = prev;
                let changed = false;
                for (const item of batch) {
                  const updated = upsertChatMessage(next, item.incoming);
                  if (updated !== next) changed = true;
                  next = updated;
                }
                if (!changed) {
                  console.log('[Finclaw WS] Skipping already-displayed cached batch');
                  return prev;
                }

                const last = batch[batch.length - 1]!;
                if (last.role !== 'user') {
                  if (hasCompleteReplyInTurn(next)) {
                    clearTypingFallback();
                    setIsTyping(false);
                    endTask();
                  } else if (last.inProgress) {
                    setIsTyping(true);
                    armTypingFallback();
                    if (!taskStartedAtRef.current) beginTask();
                  } else {
                    clearTypingFallback();
                    setIsTyping(false);
                  }
                }

                const agentId = persistAgentKeyRef.current;
                if (agentId) saveDraft(agentId, next);

                console.log('[Finclaw WS] cache batch applied:', {
                  count: batch.length,
                  prevLen: prev.length,
                  nextLen: next.length,
                });

                return commitMessages(next);
              });
            }, 0);
          }
          break;
        }

        // 统一走 upsert：已经被折叠到 process 段中的 sourceId 会被识别并跳过，
        // 避免「from_cache 重放」覆盖刷新前已合并的多段内容。
        setMessages((prev) => {
          const next = upsertChatMessage(prev, incoming);
          const changed = next !== prev;

          if (role !== 'user') {
            if (hasCompleteReplyInTurn(next)) {
              clearTypingFallback();
              setIsTyping(false);
              endTask();
              const agentId = persistAgentKeyRef.current;
              if (agentId && changed) saveDraft(agentId, next);
            } else if (changed) {
              if (inProgress) {
                setIsTyping(true);
                armTypingFallback();
                if (!taskStartedAtRef.current) beginTask();
              } else {
                clearTypingFallback();
                setIsTyping(false);
              }
            }
          }

          console.log('[Finclaw WS] message recv:', {
            id: incoming.id,
            fromCache,
            inProgress,
            messageKind,
            role,
            changed,
            prevLen: prev.length,
            contentPreview: content.slice(0, 64),
          });

          return commitMessages(next);
        });
        break;
      }

      case 'typing_start':
        setIsTyping(true);
        armTypingFallback();
        if (!taskStartedAtRef.current) beginTask();
        break;

      case 'typing_stop':
        clearTypingFallback();
        setIsTyping(false);
        // typing_stop 只表示当前 LLM 调用结束，多步 agent 可能仍在继续；勿 endTask()
        break;

      case 'error': {
        clearTypingFallback();
        setIsTyping(false);
        endTask();
        // @ts-ignore backend sends {type:"error", payload:{message:"..."}} or {error:"..."}
        const errContent = (msg.payload as any)?.message || msg.payload?.content || (msg as any).error;
        console.error('[Finclaw WS] Server error:', errContent, 'Full message:', msg);
        // Detect token expiration - force logout and redirect to login
        const errStr = typeof errContent === 'string' ? errContent : String(errContent || '');
        if (errStr.toLowerCase().includes('invalid or expired token') ||
            errStr.toLowerCase().includes('token')) {
          console.log('[Finclaw WS] Token issue detected, redirecting to login');
          clearToken();
          window.location.href = '/login';
          break;
        }
        // 把服务器错误追加为一条 assistant 消息，让用户看到
        if (errContent) {
          setMessages((prev) =>
            commitMessages(
              foldChatMessages([
                ...prev,
                {
                  id: msg.id || genId(),
                  role: 'assistant',
                  content: `⚠️ Error: ${errContent}`,
                  timestamp: new Date(),
                  kind: 'reply',
                },
              ]),
            ),
          );
        }
        break;
      }
    }
  }, [beginTask, endTask, applySessionId, getCurrentSessionId, clearSendConfirm, commitMessages]);

  const connect = useCallback(() => {
    const target = urlRef.current;
    if (!target) {
      setStatus('idle');
      return;
    }
    // 防止并发 connect()：当 WS 正处于 CONNECTING 状态时跳过
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return;
    if (connectingRef.current) return;
    // 达到最大重试次数后不再自动重试，留给用户手动触发
    if (reconnectCountRef.current > MAX_RECONNECT) {
      setStatus('error');
      return;
    }

    connectingRef.current = true;
    setStatus('connecting');

    try {
      // sessionId 由前端持有：不存在则现场生成。后端不再兜底生成，
      // 因此每次（重）连接都必须带上 sessionId，保证会话连续性。
      let wsUrl = target;
      const agentId = persistAgentKeyRef.current;
      const sid = ensureSessionForAgent(agentId);
      if (sid && agentId) {
        const sep = wsUrl.includes('?') ? '&' : '?';
        wsUrl = `${wsUrl}${sep}sessionId=${encodeURIComponent(sid)}`;
      }
      const token = getToken();
      if (token) {
        const sep = wsUrl.includes('?') ? '&' : '?';
        wsUrl = `${wsUrl}${sep}token=${encodeURIComponent(token)}`;
      }
      // 诊断：dump localStorage 中的 agent bucket 内容
      try { console.log('[Finclaw WS] connect: bucket=', JSON.parse(localStorage.getItem('finclaw.chat.v1') || '{}').agents?.[persistAgentKeyRef.current || '']); } catch {}
      console.log('[Finclaw WS] connect(): creating WebSocket, sid=', sid, 'agentId=', agentId, 'urlHasSid=', wsUrl.includes('sessionId='), 'sessions=', loadSessionMap());
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      // 必须最先注册 onmessage：connected 可能在 onopen 之前到达；sessionId 落盘不依赖 mountedRef
      ws.onmessage = (ev) => {
        try {
          const msg: WSMessage = JSON.parse(ev.data as string);
          if (msg.type === 'connected') {
            const sidFromConnected = extractConnectedSessionId(msg);
            if (sidFromConnected) applySessionId(sidFromConnected);
          }
          if (!mountedRef.current) return;
          handleIncoming(msg);
        } catch {
          // ignore parse errors
        }
      };

      ws.onopen = () => {
        connectingRef.current = false;
        console.log('[Finclaw WS] onopen, mounted=', mountedRef.current);
        if (!mountedRef.current) return;
        reconnectCountRef.current = 0;
        setStatus('connected');
        setSendError(null);
        console.log('[Finclaw WS] Connected');
        startPing();
      };

      ws.onclose = (ev) => {
        connectingRef.current = false;
        console.log('[Finclaw WS] onclose, code=', ev.code, 'mounted=', mountedRef.current);
        if (!mountedRef.current) return;
        if (pingTimerRef.current) {
          clearInterval(pingTimerRef.current);
          pingTimerRef.current = null;
        }
        // Detect token expiration from close reason
        if (ev.reason && ev.reason.toLowerCase().includes('invalid or expired token')) {
          clearToken();
          window.location.href = '/login';
          return;
        }
        // 主动关闭（code 1000）不重试
        if (ev.code === 1000) {
          setStatus('idle');
          return;
        }
        if (reconnectCountRef.current < MAX_RECONNECT) {
          reconnectCountRef.current += 1;
          setStatus('connecting');
          reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY * reconnectCountRef.current);
          console.log('[Finclaw WS] Scheduling reconnect #', reconnectCountRef.current);
        } else {
          reconnectCountRef.current += 1;
          setStatus('error');
        }
      };

      ws.onerror = () => {
        connectingRef.current = false;
        if (!mountedRef.current) return;
        console.error('[Finclaw WS] Connection error');
        // On WebSocket error during connection (e.g. server returned 401 before upgrade),
        // the error is sent as HTTP response, not WebSocket message. Try token refresh.
        const token = getToken();
        if (token) {
          fetch('/api/v1/auth/refresh', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          }).then(res => {
            if (!res.ok) {
              console.log('[Finclaw WS] Token refresh failed, redirecting to login');
              clearToken();
              window.location.href = '/login';
            }
          }).catch(() => {
            // Network error - not token related, keep error status
          });
        }
        setStatus('error');
      };
    } catch {
      connectingRef.current = false;
      // new WebSocket() threw - likely due to connection failure (e.g. HTTP 401 before upgrade)
      // Check if token is still valid
      const token = getToken();
      if (token) {
        fetch('/api/v1/auth/refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }).then(res => {
          if (!res.ok) {
            console.log('[Finclaw WS] Token invalid, redirecting to login');
            clearToken();
            window.location.href = '/login';
          }
        }).catch(() => {
          // Network error - not token related
        });
      }
      setStatus('error');
    }
  }, [startPing, handleIncoming, applySessionId, ensureSessionForAgent]);

  const connectRef = useRef(connect);
  connectRef.current = connect;
  const resetRef = useRef(reset);
  resetRef.current = reset;

  const clearMessages = useCallback((opts?: { startNewSession?: boolean }) => {
    if (typingFallbackRef.current) {
      clearTimeout(typingFallbackRef.current);
      typingFallbackRef.current = null;
    }
    clearSendConfirm();
    setIsTyping(false);
    messagesRef.current = [];
    setMessages([]);
    if (persistAgentKey) {
      if (opts?.startNewSession) {
        // 新对话：立即生成一个新的 sessionId 并重连，让后端绑定到全新会话
        // （后端按连接绑定 session，必须重连新会话才会生效）。
        setSessionForAgent(persistAgentKey, genSessionId());
      } else {
        setSessionForAgent(persistAgentKey, null);
      }
    }
    endTask();
    setCompletedTaskElapsedSec(null);
    if (persistAgentKey) {
      clearDraft(persistAgentKey);
      saveLastTaskElapsed(persistAgentKey, null);
    }
    if (opts?.startNewSession) {
      reconnectCountRef.current = 0;
      reset();
      connect();
    }
  }, [persistAgentKey, endTask, setSessionForAgent, clearSendConfirm, reset, connect]);

  const restoreMessages = useCallback(
    (msgs: ChatMessage[], sessionId?: string | null) => {
      if (typingFallbackRef.current) {
        clearTimeout(typingFallbackRef.current);
        typingFallbackRef.current = null;
      }
      clearSendConfirm();
      setIsTyping(false);
      setSendError(null);
      endTask();
      const folded = prepareStoredChatMessages(msgs);
      messagesRef.current = folded;
      setMessages(folded);
      if (persistAgentKey) {
        saveDraft(persistAgentKey, folded);
        // 切换到该归档自己的 sessionId（旧归档无此字段则生成全新的），
        // 避免继续复用「最新会话」的 session，让后端缓存串台到历史窗口。
        const sid = sessionId?.trim() || genSessionId();
        const prevSid = getSessionForAgent(persistAgentKey);
        setSessionForAgent(persistAgentKey, sid);
        // 仅当 session 真的变化时才重连：重连让后端连接重新绑定到该 session，
        // 否则刷新前的旧连接仍按 prevSid 推送 / from_cache 补发。
        if (sid !== prevSid) {
          reconnectCountRef.current = 0;
          reset();
          connect();
        }
      }
    },
    [persistAgentKey, endTask, clearSendConfirm, getSessionForAgent, setSessionForAgent, reset, connect],
  );

  const reconnect = useCallback(() => {
    reconnectCountRef.current = 0;
    setIsTyping(false);
    // Restore sessionId from localStorage so reconnect can pull cached messages
    if (persistAgentKey) {
      const sid = getSessionForAgent(persistAgentKey);
      if (sid) setSessionForAgent(persistAgentKey, sid);
    }
    reset();
    connect();
  }, [reset, connect, persistAgentKey, getSessionForAgent, setSessionForAgent]);

  // 心跳守护：定期检查连接是否仍有活动。只在 JS 层长时间未收到任何消息
  // 且 ping 也未收到 pong 响应时才触发重连（注意 lastActivityRef 在发送 ping 时
  // 也会更新，因此仅当服务端真正无响应时才会触发）。
  useEffect(() => {
    const timer = setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (lastActivityRef.current === 0) return;
      const silence = Date.now() - lastActivityRef.current;
      // 阈值设为 ping 间隔的 2 倍（~60s）：lastActivityRef 仅在收到消息时更新，
      // 因此超过 60s 无响应即可确认连接已死
      if (silence > PING_INTERVAL * 2) {
        console.warn('[Finclaw WS] No activity for', Math.round(silence / 1000), 's, reconnecting');
        reconnect();
      }
    }, PING_INTERVAL);
    return () => clearInterval(timer);
  }, [reconnect]);

  const send = useCallback(
    (content: string, media?: string[]) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        setSendError('Connection lost. Please reconnect.');
        return;
      }

      setSendError(null);

      const mediaList = (media ?? []).filter((m) => typeof m === 'string' && m.trim());
      const slashCommand = normalizeSlashInput(content).trim();
      const isClearCommand = slashCommand === '/clear';

      if (isClearCommand) {
        clearMessages();
      } else {
        // 即时添加到本地消息列表，保证用户看到自己的消息（含本地图片预览）
        const id = genId();
        const attachments =
          mediaList.length > 0
            ? mediaList.map((dataUrl, i) => ({
                type: 'image' as const,
                url: dataUrl,
                filename: `image-${i + 1}`,
              }))
            : undefined;
        setMessages((prev) =>
          commitMessages(
            foldChatMessages([...prev, { id, role: 'user', content, timestamp: new Date(), attachments }]),
          ),
        );
        flushDraftNow();
      }
      // 元宝式：发出后即显示「正在思考」，不依赖服务端 typing_start
      setIsTyping(true);
      // 用户发送即视为新任务开始，记录起点并持久化（覆盖之前可能残留的值）
      beginTask({ forceNew: true });
      if (typingFallbackRef.current) {
        clearTimeout(typingFallbackRef.current);
      }
      typingFallbackRef.current = setTimeout(() => {
        typingFallbackRef.current = null;
        setIsTyping(false);
      }, TYPING_FALLBACK_MS);

      persistSessionId();

      const msg = {
        type: 'message.send',
        id: genId(),
        session_id: getCurrentSessionId() || undefined,
        payload: mediaList.length > 0 ? { content, media: mediaList } : { content },
      };
      console.log('[Finclaw WS] Sending:', JSON.stringify(msg));
      ws.send(JSON.stringify(msg));

      // 发送确认超时：如果在 SEND_CONFIRM_TIMEOUT 内没收到任何服务端响应，
      // 判定连接已死（幽灵连接），主动重连。
      clearSendConfirm();
      sendConfirmTimerRef.current = setTimeout(() => {
        sendConfirmTimerRef.current = null;
        console.warn('[Finclaw WS] No server response after send within', SEND_CONFIRM_TIMEOUT / 1000, 's, reconnecting');
        reconnect();
      }, SEND_CONFIRM_TIMEOUT);
    },
    [beginTask, applySessionId, getCurrentSessionId, reconnect, clearSendConfirm, clearMessages, flushDraftNow],
  );

  const stop = useCallback(() => {
    if (typingFallbackRef.current) {
      clearTimeout(typingFallbackRef.current);
      typingFallbackRef.current = null;
    }
    clearSendConfirm();
    setIsTyping(false);
    endTask();
  }, [endTask, clearSendConfirm]);

  // url 变更或挂载/卸载时：重置连接；若有 persistAgentKey 则从本地恢复该 Agent 草稿
  useEffect(() => {
    mountedRef.current = true;
    urlRef.current = url;
    const agentId = persistAgentKey;
    if (agentId) {
      const sid = loadSessionId(agentId);
      if (sid) sessionByAgentRef.current.set(agentId, sid);
    }
    const restoredSid = agentId ? getSessionForAgent(agentId) : null;
    reconnectCountRef.current = 0;
    setSendError(null);
    console.log('[Finclaw WS] useEffect mount:', { url, agentId, sessionId: restoredSid, sessions: loadSessionMap() });
    if (persistAgentKey && url) {
      const restored = loadDraft(persistAgentKey);
      const taskState = resolveRestoredTaskState(
        restored,
        loadTaskStart(persistAgentKey),
        loadLastTaskElapsed(persistAgentKey),
      );
      // 必须在 connect() 之前同步落盘到 state，否则本地/快速 WS 重连时
      // from_cache 与实时消息会先写入 []，随后被异步 setMessages(restored) 覆盖而「中断」。
      messagesRef.current = restored;
      flushSync(() => {
        setMessages(restored);
        taskStartedAtRef.current = taskState.taskStartedAt;
        setTaskStartedAt(taskState.taskStartedAt);
        setCompletedTaskElapsedSec(taskState.completedTaskElapsedSec);
        setIsTyping(taskState.isTyping);
      });
      if (taskState.persistStartMs != null) {
        saveTaskStart(persistAgentKey, taskState.persistStartMs);
      }
      if (taskState.clearPersistedStart) {
        saveTaskStart(persistAgentKey, null);
      }
      if (restored.length > 0) flushDraftNow();
      if (taskState.isTyping) {
        if (typingFallbackRef.current) clearTimeout(typingFallbackRef.current);
        typingFallbackRef.current = setTimeout(() => {
          typingFallbackRef.current = null;
          setIsTyping(false);
        }, TYPING_FALLBACK_MS);
      }
    } else {
      messagesRef.current = [];
      flushSync(() => {
        setMessages([]);
        setTaskStartedAt(null);
      });
    }
    resetRef.current();
    if (url) {
      connectRef.current();
    } else {
      setStatus('idle');
    }
    return () => {
      console.log('[Finclaw WS] useEffect cleanup');
      // 路由切换 / Agent 切换 / 组件卸载时立即落盘。
      // 必须用 effect 闭包里的 agentId：cleanup 运行时 persistAgentKeyRef 已指向新 Agent，
      // 否则会误把旧会话草稿写入新 Agent，导致切换后聊天区不变化。
      if (agentId) {
        flushDraftNow(agentId);
        flushTaskNow(agentId);
        persistSessionId(agentId);
      }
      mountedRef.current = false;
      resetRef.current();
    };
  }, [url, persistAgentKey, flushDraftNow, persistSessionId, getSessionForAgent]);

  // visibilitychange: when tab becomes visible again, reconnect if connection is dead.
  // 幽灵连接检测：移动端 OS 切后台时会杀死 TCP 但 WebSocket 对象仍显示 OPEN，
  // 此时 lastActivityRef（仅在收到消息时更新）能正确反映真实连通性。
  // 超过 10 秒没有收到服务端消息即判定为死连接，直接重连。
  // 误判代价极低（一次不必要重连 ≈ 50ms 握手 + 缓存消息去重重放），
  // 但漏判代价极高（用户消息静默丢失，对话续不上）。
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reconnect();
        return;
      }
      const silence = Date.now() - lastActivityRef.current;
      if (lastActivityRef.current > 0 && silence > 10_000) {
        console.log('[Finclaw WS] No server activity for', Math.round(silence / 1000), 's on resume, reconnecting');
        reconnect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [reconnect]);

  // 移动端生命周期事件：补充 visibilitychange 无法覆盖的场景。
  // - resume: iOS Safari 冻结页面后恢复时触发，部分 iOS 版本上 visibilitychange 可能延迟
  // - pageshow(persisted): 从 BFCache 恢复的页面，旧 WebSocket 对象必然已死
  // - online: 网络从断开到恢复（电梯、飞行模式等）
  useEffect(() => {
    const handleResume = () => {
      console.log('[Finclaw WS] Page resumed (lifecycle), reconnecting');
      reconnect();
    };

    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        console.log('[Finclaw WS] Page restored from BFCache, reconnecting');
        reconnect();
      }
    };

    const handleOnline = () => {
      console.log('[Finclaw WS] Network back online, reconnecting');
      reconnect();
    };

    document.addEventListener('resume', handleResume);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('online', handleOnline);
    return () => {
      document.removeEventListener('resume', handleResume);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('online', handleOnline);
    };
  }, [reconnect]);

  // 浏览器刷新/关闭前最后一次落盘：React 的 useEffect cleanup 在 F5 时不一定会跑，
  // 这里通过 pagehide / beforeunload 主动保 sessionId 与最新 draft。
  useEffect(() => {
    if (!persistAgentKey) return;
    const flush = () => {
      try {
        persistSessionId();
        flushDraftNow();
        flushTaskNow();
      } catch {
        // 忽略 quota / privacy 错误
      }
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, [persistAgentKey, persistSessionId, flushDraftNow, flushTaskNow]);

  return {
    messages,
    status,
    isTyping,
    sendError,
    send,
    stop,
    clearMessages,
    restoreMessages,
    getSessionId: getCurrentSessionId,
    reconnect,
    taskStartedAt,
    completedTaskElapsedSec,
  };
}
