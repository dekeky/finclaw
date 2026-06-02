import { useEffect, useRef, useState, useCallback } from 'react';
import type { ChatMessage, ConnectionStatus, MessageKind, WSMessage } from '../types';
import { foldConsecutiveThoughtMessages } from '../utils/foldThoughtMessages';
import {
  foldConsecutivePicoclawToolFeedback,
  isPicoclawToolFeedbackContent,
} from '../utils/foldPicoclawToolFeedback';
import { isAssistantThoughtOnlyContent } from '../utils/splitAssistantContent';
import { clearDraft, loadDraft, saveDraft, loadSessionId, saveSessionId } from '@/lib/chatPersistence';
import { getToken, clearToken } from '../api/auth';

const RECONNECT_DELAY = 2000;
const MAX_RECONNECT = 5;
const PING_INTERVAL = 30000;
/** 长时间无助手回复时收起「正在思考」（避免一直转圈） */
const TYPING_FALLBACK_MS = 120_000;

function genId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function inferMessageKind(content: string, messageKind?: string): MessageKind | undefined {
  if (messageKind === 'reasoning') return 'thought';
  if (isPicoclawToolFeedbackContent(content)) return 'tool';
  return 'reply';
}

function parseWsChatMessage(msg: WSMessage, content: string, role: 'user' | 'assistant'): ChatMessage {
  const messageKind =
    typeof msg.payload?.message_kind === 'string' ? msg.payload.message_kind : undefined;
  return {
    id: msg.id || genId(),
    role,
    content,
    timestamp: new Date(),
    kind: role === 'assistant' ? inferMessageKind(content, messageKind) : undefined,
  };
}

function foldChatMessages(msgs: ChatMessage[]): ChatMessage[] {
  return foldConsecutiveThoughtMessages(foldConsecutivePicoclawToolFeedback(msgs));
}

function parseHistory(raw: WSMessage): ChatMessage[] {
  if (!raw.payload?.messages) return [];
  return raw.payload.messages.map((m) => {
    const role = m.role === 'user' ? 'user' : 'assistant';
    return {
      id: m.id || genId(),
      role,
      content: m.content,
      timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
      kind: role === 'assistant' ? inferMessageKind(m.content) : undefined,
    };
  });
}

export interface UseWebSocketReturn {
  messages: ChatMessage[];
  status: ConnectionStatus;
  isTyping: boolean;
  sendError: string | null;
  send: (content: string) => void;
  /** 终止当前进行中的 Agent 回复 */
  stop: () => void;
  clearMessages: () => void;
  /** 将归档/历史消息载入当前会话并写入本地草稿 */
  restoreMessages: (messages: ChatMessage[]) => void;
  reconnect: () => void;
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [isTyping, setIsTyping] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const reconnectCountRef = useRef(0);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const urlRef = useRef<string | null>(url);
  /** 切换 Agent 后跳过首轮持久化，避免把上一 Agent 的消息写入新 Agent */
  const skipPersistRef = useRef(false);
  /** 最近一次收到消息的时间戳，用于 visibility 恢复时检测静默断连（0 = 尚未收到任何消息） */
  const lastActivityRef = useRef(0);
  /** 防止并发 connect() 调用 */
  const connectingRef = useRef(false);
  /** 始终指向最新 messages，供卸载 cleanup 同步落盘 */
  const messagesRef = useRef<ChatMessage[]>(messages);
  messagesRef.current = messages;

  const reset = useCallback(() => {
    if (typingFallbackRef.current) {
      clearTimeout(typingFallbackRef.current);
      typingFallbackRef.current = null;
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (pingTimerRef.current) clearInterval(pingTimerRef.current);
    pingTimerRef.current = null;
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

  const startPing = useCallback(() => {
    if (pingTimerRef.current) clearInterval(pingTimerRef.current);
    pingTimerRef.current = setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'ping', id: genId() }));
      lastActivityRef.current = Date.now();
    }, PING_INTERVAL);
  }, []);

  const handleIncoming = useCallback((msg: WSMessage) => {
    lastActivityRef.current = Date.now();
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
      case 'connected':
        sessionIdRef.current = msg.session_id || msg.payload?.client_id || null;
        if (sessionIdRef.current && persistAgentKeyRef.current) {
          saveSessionId(persistAgentKeyRef.current, sessionIdRef.current);
        }
        console.log('[Finclaw WS] SessionID set to:', sessionIdRef.current);
        break;

      case 'history': {
        const history = parseHistory(msg);
        if (history.length === 0) break;
        setMessages((prev) => {
          const ids = new Set(prev.map((m) => m.id));
          const deduped = history.filter((m) => !ids.has(m.id));
          return foldChatMessages([...prev, ...deduped]);
        });
        break;
      }

      case 'message.send':
      case 'message_create': {
        const content = typeof msg.payload?.content === 'string' ? msg.payload.content : msg.content ?? '';
        const role = msg.payload?.role || 'assistant';
        if (!content) {
          console.warn('[Finclaw WS] Empty content in message.send:', msg);
          break;
        }
        // Deduplicate cached messages that may have already been displayed
        const fromCache = (msg as any).from_cache === true;
        if (fromCache) {
          const msgId = msg.id || '';
          let isDuplicate = false;
          setMessages(prev => {
            if (prev.some(m => m.id === msgId)) {
              isDuplicate = true;
              return prev;
            }
            return foldChatMessages([
              ...prev,
              parseWsChatMessage(msg, content, role === 'user' ? 'user' : 'assistant'),
            ]);
          });
          if (isDuplicate) {
            console.log('[Finclaw WS] Skipping duplicate cached message:', msgId);
            break;
          }
          // Message was added inside setMessages, skip the common path below
          const messageKind2 =
            typeof msg.payload?.message_kind === 'string' ? msg.payload.message_kind : undefined;
          if (role !== 'user') {
            const inProgress2 =
              messageKind2 === 'reasoning' ||
              isPicoclawToolFeedbackContent(content) ||
              isAssistantThoughtOnlyContent(content);
            if (!inProgress2) {
              clearTypingFallback();
              setIsTyping(false);
            } else {
              setIsTyping(true);
              armTypingFallback();
            }
          }
          break;
        }
        const messageKind =
          typeof msg.payload?.message_kind === 'string' ? msg.payload.message_kind : undefined;
        if (role !== 'user') {
          // 工具进度 / 思考流 / 仅思考块：仍算进行中，直到出现正文回复
          const inProgress =
            messageKind === 'reasoning' ||
            isPicoclawToolFeedbackContent(content) ||
            isAssistantThoughtOnlyContent(content);
          if (!inProgress) {
            clearTypingFallback();
            setIsTyping(false);
          } else {
            setIsTyping(true);
            armTypingFallback();
          }
        }
        setMessages((prev) =>
          foldChatMessages([
            ...prev,
            parseWsChatMessage(msg, content, role === 'user' ? 'user' : 'assistant'),
          ]),
        );
        break;
      }

      case 'typing_start':
        setIsTyping(true);
        armTypingFallback();
        break;

      case 'typing_stop':
        clearTypingFallback();
        setIsTyping(false);
        break;

      case 'error': {
        clearTypingFallback();
        setIsTyping(false);
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
          );
        }
        break;
      }
    }
  }, []);

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
      // Carry sessionId on reconnect so the server can resume the existing session
      let wsUrl = target;
      let sid = sessionIdRef.current;
      if (!sid && persistAgentKeyRef.current) {
        sid = loadSessionId(persistAgentKeyRef.current);
        if (sid) sessionIdRef.current = sid;
      }
      if (sid) {
        const sep = wsUrl.includes('?') ? '&' : '?';
        wsUrl = `${wsUrl}${sep}sessionId=${encodeURIComponent(sid)}`;
      }
      const token = getToken();
      if (token) {
        const sep = wsUrl.includes('?') ? '&' : '?';
        wsUrl = `${wsUrl}${sep}token=${encodeURIComponent(token)}`;
      }
      console.log('[Finclaw WS] connect(): creating WebSocket, sid=', sid);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

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

      ws.onmessage = (ev) => {
        if (!mountedRef.current) return;
        try {
          const msg: WSMessage = JSON.parse(ev.data);
          handleIncoming(msg);
        } catch {
          // ignore parse errors
        }
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

  const clearMessages = useCallback(() => {
    if (typingFallbackRef.current) {
      clearTimeout(typingFallbackRef.current);
      typingFallbackRef.current = null;
    }
    setIsTyping(false);
    setMessages([]);
    sessionIdRef.current = null;
    if (persistAgentKey) {
      clearDraft(persistAgentKey);
      saveSessionId(persistAgentKey, null);
    }
  }, [persistAgentKey]);

  const restoreMessages = useCallback(
    (msgs: ChatMessage[]) => {
      if (typingFallbackRef.current) {
        clearTimeout(typingFallbackRef.current);
        typingFallbackRef.current = null;
      }
      setIsTyping(false);
      setSendError(null);
      const folded = foldChatMessages(msgs);
      setMessages(folded);
      if (persistAgentKey) {
        saveDraft(persistAgentKey, folded);
        skipPersistRef.current = true;
      }
    },
    [persistAgentKey],
  );

  const reconnect = useCallback(() => {
    reconnectCountRef.current = 0;
    setIsTyping(false);
    // Restore sessionId from localStorage so reconnect can pull cached messages
    if (persistAgentKey) {
      const sid = loadSessionId(persistAgentKey);
      if (sid) {
        sessionIdRef.current = sid;
      }
    }
    reset();
    connect();
  }, [reset, connect, persistAgentKey]);

  // 心跳守护：定期检查连接是否仍有活动。只在 JS 层长时间未收到任何消息
  // 且 ping 也未收到 pong 响应时才触发重连（注意 lastActivityRef 在发送 ping 时
  // 也会更新，因此仅当服务端真正无响应时才会触发）。
  useEffect(() => {
    const timer = setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (lastActivityRef.current === 0) return;
      const silence = Date.now() - lastActivityRef.current;
      // 阈值设为 ping 间隔的 4 倍（~120s），给 pong 响应足够余量
      if (silence > PING_INTERVAL * 4) {
        console.warn('[Finclaw WS] No activity for', Math.round(silence / 1000), 's, reconnecting');
        reconnect();
      }
    }, PING_INTERVAL);
    return () => clearInterval(timer);
  }, [reconnect]);

  const send = useCallback(
    (content: string) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        setSendError('Connection lost. Please reconnect.');
        return;
      }

      setSendError(null);

      // 即时添加到本地消息列表，保证用户看到自己的消息
      const id = genId();
      setMessages((prev) =>
        foldChatMessages([...prev, { id, role: 'user', content, timestamp: new Date() }]),
      );
      // 元宝式：发出后即显示「正在思考」，不依赖服务端 typing_start
      setIsTyping(true);
      if (typingFallbackRef.current) {
        clearTimeout(typingFallbackRef.current);
      }
      typingFallbackRef.current = setTimeout(() => {
        typingFallbackRef.current = null;
        setIsTyping(false);
      }, TYPING_FALLBACK_MS);

      const msg = {
        type: 'message.send',
        id,
        session_id: sessionIdRef.current || undefined,
        payload: { content },
      };
      console.log('[Finclaw WS] Sending:', JSON.stringify(msg));
      ws.send(JSON.stringify(msg));
    },
    []
  );

  const stop = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    if (typingFallbackRef.current) {
      clearTimeout(typingFallbackRef.current);
      typingFallbackRef.current = null;
    }
    setIsTyping(false);

    const msg = {
      type: 'message.cancel',
      id: genId(),
      session_id: sessionIdRef.current || undefined,
    };
    console.log('[Finclaw WS] Sending cancel:', JSON.stringify(msg));
    ws.send(JSON.stringify(msg));
  }, []);

  // url 变更或挂载/卸载时：重置连接；若有 persistAgentKey 则从本地恢复该 Agent 草稿
  useEffect(() => {
    mountedRef.current = true;
    urlRef.current = url;
    sessionIdRef.current = persistAgentKey ? loadSessionId(persistAgentKey) : null;
    reconnectCountRef.current = 0;
    setSendError(null);
    setIsTyping(false);
    skipPersistRef.current = true;
    console.log('[Finclaw WS] useEffect mount:', { url, persistAgentKey, sessionId: sessionIdRef.current });
    if (persistAgentKey && url) {
      setMessages(loadDraft(persistAgentKey));
    } else {
      setMessages([]);
    }
    reset();
    if (url) {
      connect();
    } else {
      setStatus('idle');
    }
    return () => {
      console.log('[Finclaw WS] useEffect cleanup');
      // 路由切换 / Agent 切换 / 组件卸载时立即落盘
      if (persistAgentKey) {
        if (messagesRef.current.length > 0) {
          saveDraft(persistAgentKey, messagesRef.current);
        }
        if (sessionIdRef.current) {
          saveSessionId(persistAgentKey, sessionIdRef.current);
        }
      }
      mountedRef.current = false;
      reset();
    };
  }, [url, persistAgentKey, reset, connect]);

  useEffect(() => {
    if (!persistAgentKey) return;
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }
    const t = setTimeout(() => saveDraft(persistAgentKey, messages), 400);
    return () => clearTimeout(t);
  }, [messages, persistAgentKey]);

  // visibilitychange: when tab becomes visible again, reconnect if connection is dead.
  // For phantom connections (WS appears OPEN but TCP is half-open), send a probe
  // ping first and only reconnect if no pong arrives within a short timeout.
  useEffect(() => {
    let probeTimer: ReturnType<typeof setTimeout> | null = null;

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reconnect();
        return;
      }
      // WS appears OPEN but may be a phantom connection after network change.
      // Send a JSON-level ping to verify liveness — if no activity within 5s, reconnect.
      const silence = Date.now() - lastActivityRef.current;
      if (lastActivityRef.current > 0 && silence > PING_INTERVAL + 10_000) {
        console.log('[Finclaw WS] Possible phantom connection (silent for', Math.round(silence / 1000), 's), probing...');
        ws.send(JSON.stringify({ type: 'ping', id: genId() }));
        probeTimer = setTimeout(() => {
          // If lastActivityRef was not updated (no pong received), the connection is dead
          if (Date.now() - lastActivityRef.current > PING_INTERVAL) {
            console.log('[Finclaw WS] Probe failed, reconnecting');
            reconnect();
          }
        }, 5000);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (probeTimer) clearTimeout(probeTimer);
    };
  }, [reconnect]);

  return { messages, status, isTyping, sendError, send, stop, clearMessages, restoreMessages, reconnect };
}
