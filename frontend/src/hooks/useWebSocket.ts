import { useEffect, useRef, useState, useCallback } from 'react';
import { flushSync } from 'react-dom';
import type { ChatMessage, ConnectionStatus, MessageKind, WSMessage } from '../types';
import { foldConsecutiveProcessMessages, hasMessageId, isProcessMessage } from '../utils/foldProcessMessages';
import { findCompleteReplyIndexInTurn } from '../utils/chatTaskState';
import { reorderMisplacedProcessInTurn } from '../utils/reorderTurnMessages';
import { hasCompleteReplyInTurn, isChatTaskActive, isIncompleteChatTask, resolveRestoredTaskState } from '../utils/chatTaskState';
import { isPicoclawToolFeedbackContent } from '../utils/foldPicoclawToolFeedback';
import { isAssistantThoughtOnlyContent } from '../utils/splitAssistantContent';
import { prepareStoredChatMessages } from '../utils/prepareStoredChatMessages';
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
import { isPicoclawSlashCommandNoise } from '@/utils/picoclawSlashCommandAck';
import { shouldDropAssistantInbound } from '@/utils/filterAssistantNoise';
import { isMobileClient } from '@/lib/isMobileClient';

const RECONNECT_DELAY = 2000;
const MAX_RECONNECT = 5;
const PING_INTERVAL = 30000;
/** 移动端回前台时发 ping 探活；超时无服务端帧则判定幽灵 OPEN */
const MOBILE_PROBE_TIMEOUT_MS = 1000;
/** 长时间无助手回复时收起「正在思考」（避免一直转圈） */
const TYPING_FALLBACK_MS = 120_000;
/** 发送消息后等待服务端确认的超时时间；超时则判定连接已死并重连 */
const SEND_CONFIRM_TIMEOUT = 10_000;
/** 无用户消息/后端回复（ping、pong、connected 除外）时回收 WS */
const IDLE_RECYCLE_MS = 10 * 60 * 1000;
const IDLE_RECYCLE_CHECK_MS = 60_000;

function isBusinessIncoming(msg: WSMessage): boolean {
  switch (msg.type) {
    case 'message.send':
    case 'message_create':
    case 'typing_start':
    case 'typing_stop':
    case 'error':
      return true;
    case 'history':
      return Array.isArray(msg.payload?.messages) && msg.payload!.messages!.length > 0;
    default:
      return false;
  }
}

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
  let next = [...prev, incoming];
  if (
    incoming.role === 'assistant' &&
    isProcessMessage(incoming) &&
    findCompleteReplyIndexInTurn(prev) >= 0
  ) {
    next = reorderMisplacedProcessInTurn(next);
  }
  return foldChatMessages(next);
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
  clearMessages: () => void;
  /** 将消息载入本 session 的本地草稿（本 hook 绑定固定 sessionId，不切换连接）。 */
  restoreMessages: (messages: ChatMessage[]) => void;
  /** 本 WS 连接绑定的 sessionId（固定不变）。 */
  getSessionId: () => string;
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
  /** Agent 标识，与 sessionId 一起用于按会话落盘草稿/任务状态 */
  agentId: string | null;
  /** 本连接固定绑定的 sessionId，每条 WS 对应一个 sessionId */
  sessionId: string;
  /** 状态变化时通知上层（多 session 池用于刷新当前视图） */
  onStateChange?: () => void;
  /** 业务空闲超时后 WS 已关闭，通知上层从活跃 session 列表移除 */
  onIdleRecycle?: () => void;
}

/**
 * useWebSocket：维护一条与 Finclaw 后端的 WS 长连接，固定绑定一个 sessionId。
 *
 * 当 `url` 为 `null` 时表示尚未选定 Agent，hook 会保持 idle 状态、不发起连接。
 * 多 session 由 ChatSessionProvider 为每个 sessionId 挂载独立实例。
 */
export function useWebSocket(url: string | null, options: UseWebSocketOptions): UseWebSocketReturn {
  const agentId = options.agentId;
  const sessionId = options.sessionId;
  const onStateChange = options.onStateChange;
  const onIdleRecycle = options.onIdleRecycle;
  const agentIdRef = useRef(agentId);
  agentIdRef.current = agentId;
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;
  const onIdleRecycleRef = useRef(onIdleRecycle);
  onIdleRecycleRef.current = onIdleRecycle;
  const persistReady = Boolean(agentId && sessionId.trim());
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    persistReady ? loadDraft(agentId!, sessionId) : [],
  );
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [isTyping, setIsTyping] = useState(() => {
    if (!persistReady) return false;
    const restored = loadDraft(agentId!, sessionId);
    return isChatTaskActive(restored, false);
  });
  const [sendError, setSendError] = useState<string | null>(null);
  /** 当前思考任务的起始时间戳（ms）；null 表示无进行中任务 */
  // 初始化时直接从 persistence 读取，确保 ChatContainer 首帧就能拿到正确的时间戳
  const [taskStartedAt, setTaskStartedAt] = useState<number | null>(() => {
    if (!persistReady) return null;
    const restored = loadDraft(agentId!, sessionId);
    if (hasCompleteReplyInTurn(restored)) return null;
    return loadTaskStart(agentId!, sessionId);
  });
  const [completedTaskElapsedSec, setCompletedTaskElapsedSec] = useState<number | null>(() => {
    return persistReady ? loadLastTaskElapsed(agentId!, sessionId) : null;
  });
  /** 与 taskStartedAt 同步，用于在 callback 内避免重复 beginTask */
  const taskStartedAtRef = useRef<number | null>(null);
  taskStartedAtRef.current = taskStartedAt;
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mobileProbeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const urlRef = useRef<string | null>(url);
  /** 最近一次收到服务端帧的时间戳（含 pong，用于连接存活检测） */
  const lastActivityRef = useRef(0);
  /** 最近一次业务消息时间戳（用户发送或服务端回复，不含 ping/pong/connected） */
  const lastBusinessActivityRef = useRef(0);
  const idleRecycledRef = useRef(false);
  /** 防止并发 connect() 调用 */
  const connectingRef = useRef(false);
  /** 当前 url/agent 下是否至少成功 onopen 过一次（区分「首连中」与「曾连上过」） */
  const wsEverOpenedRef = useRef(false);
  /** 页面是否曾进入 hidden（区分「刷新/首载」与「切后台再回前台」） */
  const pageWasHiddenRef = useRef(false);
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
    const aid = agentIdRef.current;
    const sid = sessionIdRef.current;
    if (!aid || !sid.trim()) return;
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = setTimeout(() => {
      draftSaveTimerRef.current = null;
      if (agentIdRef.current !== aid || sessionIdRef.current !== sid) return;
      const msgs = messagesRef.current;
      if (msgs.length > 0) saveDraft(aid, sid, msgs);
    }, 150);
  }, []);

  /** 在 setState 回调内同步更新 ref，避免 pagehide 早于下一次 render 时落到旧快照。 */
  const commitMessages = useCallback((next: ChatMessage[]): ChatMessage[] => {
    messagesRef.current = next;
    scheduleDraftSave();
    return next;
  }, [scheduleDraftSave]);

  const flushDraftNow = useCallback((aidOverride?: string | null, sidOverride?: string | null) => {
    const aid = aidOverride ?? agentIdRef.current;
    const sid = sidOverride ?? sessionIdRef.current;
    if (!aid || !sid?.trim()) return;
    if (draftSaveTimerRef.current) {
      clearTimeout(draftSaveTimerRef.current);
      draftSaveTimerRef.current = null;
    }
    const msgs = messagesRef.current;
    if (msgs.length > 0) saveDraft(aid, sid, msgs);
  }, []);

  const flushTaskNow = useCallback((aidOverride?: string | null, sidOverride?: string | null) => {
    const aid = aidOverride ?? agentIdRef.current;
    const sid = sidOverride ?? sessionIdRef.current;
    if (!aid || !sid?.trim()) return;
    const start = taskStartedAtRef.current;
    if (start != null) {
      saveTaskStart(aid, sid, start);
      return;
    }
    const msgs = messagesRef.current;
    if (!isIncompleteChatTask(msgs) && !isChatTaskActive(msgs, false)) {
      saveTaskStart(aid, sid, null);
    }
  }, []);

  const getCurrentSessionId = useCallback((): string => sessionIdRef.current, []);

  const notifyStateChange = useCallback(() => {
    onStateChangeRef.current?.();
  }, []);

  /** 开启一次思考任务：写入起始时间戳并持久化，刷新后可恢复。 */
  const beginTask = useCallback((opts?: { forceNew?: boolean }) => {
    const aid = agentIdRef.current;
    const sid = sessionIdRef.current;
    if (!opts?.forceNew) {
      let resumed = taskStartedAtRef.current;
      if (resumed == null && aid && sid) resumed = loadTaskStart(aid, sid);
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
    if (aid && sid) {
      saveTaskStart(aid, sid, now);
      saveLastTaskElapsed(aid, sid, null);
    }
  }, []);

  /** 关闭当前思考任务并清除持久化值。 */
  const endTask = useCallback(() => {
    const aid = agentIdRef.current;
    const sid = sessionIdRef.current;
    const start = taskStartedAtRef.current;
    if (start != null && aid && sid) {
      const elapsed = Math.max(0, Math.floor((Date.now() - start) / 1000));
      setCompletedTaskElapsedSec(elapsed);
      saveLastTaskElapsed(aid, sid, elapsed);
    }
    taskStartedAtRef.current = null;
    setTaskStartedAt(null);
    if (aid && sid) {
      saveTaskStart(aid, sid, null);
    }
  }, []);

  const clearMobileProbe = useCallback(() => {
    if (mobileProbeTimerRef.current) {
      clearTimeout(mobileProbeTimerRef.current);
      mobileProbeTimerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearMobileProbe();
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
  }, [clearMobileProbe]);

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
    if (msg.type !== 'ping') {
      lastActivityRef.current = Date.now();
    }
    if (isBusinessIncoming(msg)) {
      lastBusinessActivityRef.current = Date.now();
    }
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
        console.log('[Finclaw WS] Connected, sessionId=', incoming ?? sessionIdRef.current);
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
        if (isPicoclawSlashCommandNoise(content, role === 'user' ? 'user' : 'assistant')) {
          console.log('[Finclaw WS] Skipping picoclaw slash command noise:', content.slice(0, 64));
          break;
        }
        const messageKind =
          typeof msg.payload?.message_kind === 'string' ? msg.payload.message_kind : undefined;
        const inProgress =
          messageKind === 'reasoning' ||
          isPicoclawToolFeedbackContent(content) ||
          isAssistantThoughtOnlyContent(content);
        if (
          role !== 'user' &&
          shouldDropAssistantInbound(messagesRef.current, content, role, inProgress)
        ) {
          console.log('[Finclaw WS] Dropping assistant noise after reply:', content.slice(0, 64));
          break;
        }
        const incoming = parseWsChatMessage(msg, content, role === 'user' ? 'user' : 'assistant');
        const fromCache = (msg as any).from_cache === true;

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
                  if (
                    item.role !== 'user' &&
                    shouldDropAssistantInbound(
                      next,
                      item.incoming.content,
                      item.role,
                      item.inProgress,
                    )
                  ) {
                    continue;
                  }
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

                const aid = agentIdRef.current;
                const sid = sessionIdRef.current;
                if (aid && sid) saveDraft(aid, sid, next);

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
              const aid = agentIdRef.current;
              const sid = sessionIdRef.current;
              if (aid && sid && changed) saveDraft(aid, sid, next);
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
  }, [beginTask, endTask, clearSendConfirm, commitMessages, notifyStateChange]);

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
      const aid = agentIdRef.current;
      const sid = sessionIdRef.current.trim();
      if (sid && aid) {
        const sep = wsUrl.includes('?') ? '&' : '?';
        wsUrl = `${wsUrl}${sep}sessionId=${encodeURIComponent(sid)}`;
      }
      const token = getToken();
      if (token) {
        const sep = wsUrl.includes('?') ? '&' : '?';
        wsUrl = `${wsUrl}${sep}token=${encodeURIComponent(token)}`;
      }
      console.log('[Finclaw WS] connect(): creating WebSocket, sid=', sid, 'agentId=', aid);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (ev) => {
        try {
          const msg: WSMessage = JSON.parse(ev.data as string);
          if (!mountedRef.current) return;
          handleIncoming(msg);
        } catch {
          // ignore parse errors
        }
      };

      ws.onopen = () => {
        connectingRef.current = false;
        wsEverOpenedRef.current = true;
        idleRecycledRef.current = false;
        const now = Date.now();
        lastActivityRef.current = now;
        lastBusinessActivityRef.current = now;
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
        console.log('[Finclaw WS] onclose, code=', ev.code, 'reason=', ev.reason, 'mounted=', mountedRef.current);
        if (!mountedRef.current) return;
        if (pingTimerRef.current) {
          clearInterval(pingTimerRef.current);
          pingTimerRef.current = null;
        }
        if (ev.reason?.includes('idle_recycle') || idleRecycledRef.current) {
          idleRecycledRef.current = true;
          setStatus('idle');
          onIdleRecycleRef.current?.();
          return;
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
  }, [startPing, handleIncoming]);

  const connectRef = useRef(connect);
  connectRef.current = connect;
  const resetRef = useRef(reset);
  resetRef.current = reset;

  const clearMessages = useCallback(() => {
    if (typingFallbackRef.current) {
      clearTimeout(typingFallbackRef.current);
      typingFallbackRef.current = null;
    }
    clearSendConfirm();
    setIsTyping(false);
    messagesRef.current = [];
    setMessages([]);
    endTask();
    setCompletedTaskElapsedSec(null);
    const aid = agentIdRef.current;
    const sid = sessionIdRef.current;
    if (aid && sid) {
      clearDraft(aid, sid);
      saveLastTaskElapsed(aid, sid, null);
    }
  }, [endTask, clearSendConfirm]);

  const restoreMessages = useCallback(
    (msgs: ChatMessage[]) => {
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
      const aid = agentIdRef.current;
      const sid = sessionIdRef.current;
      if (aid && sid) {
        saveDraft(aid, sid, folded);
      }
    },
    [endTask, clearSendConfirm],
  );

  const reconnect = useCallback(() => {
    clearMobileProbe();
    reconnectCountRef.current = 0;
    idleRecycledRef.current = false;
    reset();
    connect();
  }, [clearMobileProbe, reset, connect]);

  const recycleIdleConnection = useCallback(() => {
    if (idleRecycledRef.current) return;
    idleRecycledRef.current = true;
    console.log(
      '[Finclaw WS] Recycling idle connection (no business traffic for',
      IDLE_RECYCLE_MS / 60_000,
      'min), session=',
      sessionIdRef.current,
    );
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
    const ws = wsRef.current;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      try {
        ws.close(1000, 'idle_recycle');
      } catch {
        reset();
        setStatus('idle');
        onIdleRecycleRef.current?.();
      }
    } else {
      reset();
      setStatus('idle');
      onIdleRecycleRef.current?.();
    }
  }, [reset]);

  /**
   * 移动端：不信任 readyState===OPEN，发 ping 后若在窗口内收不到任何服务端帧则重连。
   * 覆盖「切后台很短但 TCP 已被杀」的幽灵连接（静默时长 <10s 的旧逻辑会漏判）。
   * 首连 / 刷新期间不探活，避免云上高延迟时 pageshow/online 打断 CONNECTING。
   */
  const probeConnectionAlive = useCallback(() => {
    if (!wsEverOpenedRef.current) return;
    clearMobileProbe();
    const ws = wsRef.current;
    if (!ws) {
      reconnect();
      return;
    }
    if (ws.readyState === WebSocket.CONNECTING) return;
    if (ws.readyState !== WebSocket.OPEN) {
      reconnect();
      return;
    }
    const activityBefore = lastActivityRef.current;
    const probeSentAt = Date.now();
    try {
      ws.send(JSON.stringify({ type: 'ping', id: genId() }));
    } catch {
      console.warn('[Finclaw WS] Mobile probe ping failed, reconnecting');
      reconnect();
      return;
    }
    mobileProbeTimerRef.current = setTimeout(() => {
      mobileProbeTimerRef.current = null;
      const wsNow = wsRef.current;
      if (!wsNow || wsNow.readyState !== WebSocket.OPEN) {
        reconnect();
        return;
      }
      if (lastActivityRef.current <= activityBefore || lastActivityRef.current < probeSentAt) {
        console.warn('[Finclaw WS] Mobile probe timed out (ghost OPEN?), reconnecting');
        reconnect();
      }
    }, MOBILE_PROBE_TIMEOUT_MS);
  }, [clearMobileProbe, reconnect]);

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

  // 业务空闲回收：10 分钟内无用户消息/后端回复（ping、pong 不计）则关闭 WS，不重连
  useEffect(() => {
    const timer = setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (lastBusinessActivityRef.current === 0) return;
      const idle = Date.now() - lastBusinessActivityRef.current;
      if (idle >= IDLE_RECYCLE_MS) {
        recycleIdleConnection();
      }
    }, IDLE_RECYCLE_CHECK_MS);
    return () => clearInterval(timer);
  }, [recycleIdleConnection]);

  const send = useCallback(
    (content: string, media?: string[]) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        setSendError('Connection lost. Please reconnect.');
        return;
      }

      setSendError(null);
      lastBusinessActivityRef.current = Date.now();

      const mediaList = (media ?? []).filter((m) => typeof m === 'string' && m.trim());
      const slashCommand = normalizeSlashInput(content).trim();
      const isClearCommand = slashCommand === '/clear';

      if (isClearCommand) {
        clearMessages();
        ws.send(
          JSON.stringify({
            type: 'message.send',
            id: genId(),
            session_id: getCurrentSessionId(),
            payload: { content: '/clear' },
          }),
        );
        return;
      }

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
      setIsTyping(true);
      beginTask({ forceNew: true });
      if (typingFallbackRef.current) {
        clearTimeout(typingFallbackRef.current);
      }
      typingFallbackRef.current = setTimeout(() => {
        typingFallbackRef.current = null;
        setIsTyping(false);
      }, TYPING_FALLBACK_MS);

      const msg = {
        type: 'message.send',
        id: genId(),
        session_id: getCurrentSessionId(),
        payload: mediaList.length > 0 ? { content, media: mediaList } : { content },
      };
      console.log('[Finclaw WS] Sending:', JSON.stringify(msg));
      ws.send(JSON.stringify(msg));

      clearSendConfirm();
      sendConfirmTimerRef.current = setTimeout(() => {
        sendConfirmTimerRef.current = null;
        console.warn('[Finclaw WS] No server response after send within', SEND_CONFIRM_TIMEOUT / 1000, 's, reconnecting');
        reconnect();
      }, SEND_CONFIRM_TIMEOUT);
    },
    [beginTask, getCurrentSessionId, reconnect, clearSendConfirm, clearMessages, flushDraftNow],
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

  // url / agent / session 变更或挂载/卸载时：重置连接并从该 session 的草稿恢复
  useEffect(() => {
    mountedRef.current = true;
    urlRef.current = url;
    const aid = agentId;
    const sid = sessionId;
    const restored = aid && sid && url ? loadDraft(aid, sid) : [];
    reconnectCountRef.current = 0;
    wsEverOpenedRef.current = false;
    pageWasHiddenRef.current = false;
    lastActivityRef.current = 0;
    lastBusinessActivityRef.current = 0;
    idleRecycledRef.current = false;
    setSendError(null);
    console.log('[Finclaw WS] useEffect mount:', { url, agentId: aid, sessionId: sid });
    if (aid && sid && url) {
      const taskState = resolveRestoredTaskState(
        restored,
        loadTaskStart(aid, sid),
        loadLastTaskElapsed(aid, sid),
      );
      messagesRef.current = restored;
      flushSync(() => {
        setMessages(restored);
        taskStartedAtRef.current = taskState.taskStartedAt;
        setTaskStartedAt(taskState.taskStartedAt);
        setCompletedTaskElapsedSec(taskState.completedTaskElapsedSec);
        setIsTyping(taskState.isTyping);
      });
      if (taskState.persistStartMs != null) {
        saveTaskStart(aid, sid, taskState.persistStartMs);
      }
      if (taskState.clearPersistedStart) {
        saveTaskStart(aid, sid, null);
      }
      if (restored.length > 0) flushDraftNow(aid, sid);
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
    if (url && aid && sid) {
      connectRef.current();
    } else {
      setStatus('idle');
    }
    return () => {
      console.log('[Finclaw WS] useEffect cleanup', sid);
      if (aid && sid) {
        flushDraftNow(aid, sid);
        flushTaskNow(aid, sid);
      }
      mountedRef.current = false;
      resetRef.current();
    };
  }, [url, agentId, sessionId, flushDraftNow, flushTaskNow]);

  // visibilitychange: when tab becomes visible again, reconnect if connection is dead.
  // 幽灵连接检测：移动端 OS 切后台时会杀死 TCP 但 WebSocket 对象仍显示 OPEN。
  // 移动端回前台时发 ping 探活（不信任 OPEN / 静默时长）；桌面端仍用静默阈值。
  // 必须曾进入 hidden 才处理 visible，避免刷新/首载时误触发（云上延迟下易打断首连）。
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        pageWasHiddenRef.current = true;
        return;
      }
      if (!wsEverOpenedRef.current) return;
      const wasHidden = pageWasHiddenRef.current;
      pageWasHiddenRef.current = false;
      // 桌面端仅在确实切过后台时处理；移动端允许 visible 先于 hidden 的 WebView 行为
      if (!wasHidden && !isMobileClient()) return;

      if (isMobileClient()) {
        probeConnectionAlive();
        return;
      }
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
  }, [reconnect, probeConnectionAlive]);

  // 移动端生命周期事件：补充 visibilitychange 无法覆盖的场景。
  // - pageshow(persisted): 从 BFCache 恢复的页面，旧 WebSocket 对象必然已死
  // - pageshow(mobile): 部分 WebView visibility 不可靠，回前台时探活（非刷新/首载）
  // - online: 网络恢复后探活（mobile）或重连（desktop）；跳过首连前的 online 事件
  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        wsEverOpenedRef.current = false;
        console.log('[Finclaw WS] Page restored from BFCache, reconnecting');
        reconnect();
        return;
      }
      // 刷新/首载由 useEffect connect() 负责，不在 pageshow 打断 CONNECTING
      if (!wsEverOpenedRef.current) return;
      if (!pageWasHiddenRef.current && !isMobileClient()) return;
      pageWasHiddenRef.current = false;
      if (isMobileClient()) {
        probeConnectionAlive();
      }
    };

    const handleOnline = () => {
      if (!wsEverOpenedRef.current) return;
      if (isMobileClient()) {
        console.log('[Finclaw WS] Network back online, probing connection');
        probeConnectionAlive();
        return;
      }
      console.log('[Finclaw WS] Network back online, reconnecting');
      reconnect();
    };

    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('online', handleOnline);
    };
  }, [reconnect, probeConnectionAlive]);

  // 浏览器刷新/关闭前最后一次落盘：React 的 useEffect cleanup 在 F5 时不一定会跑，
  // 这里通过 pagehide / beforeunload 主动保 sessionId 与最新 draft。
  useEffect(() => {
    const aid = agentId;
    const sid = sessionId;
    if (!aid || !sid) return;
    const flush = () => {
      try {
        flushDraftNow(aid, sid);
        flushTaskNow(aid, sid);
      } catch {
        // ignore
      }
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, [agentId, sessionId, flushDraftNow, flushTaskNow]);

  useEffect(() => {
    notifyStateChange();
  }, [messages, status, isTyping, sendError, taskStartedAt, completedTaskElapsedSec, notifyStateChange]);

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
