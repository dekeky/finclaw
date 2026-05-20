import { useEffect, useRef, useState, useCallback } from 'react';
import type { ChatMessage, ConnectionStatus, MessageKind, WSMessage } from '../types';
import { foldConsecutiveThoughtMessages } from '../utils/foldThoughtMessages';
import {
  foldConsecutivePicoclawToolFeedback,
  isPicoclawToolFeedbackContent,
} from '../utils/foldPicoclawToolFeedback';
import { isAssistantThoughtOnlyContent } from '../utils/splitAssistantContent';
import { clearDraft, loadDraft, saveDraft } from '@/lib/chatPersistence';

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [isTyping, setIsTyping] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const reconnectCountRef = useRef(0);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const urlRef = useRef<string | null>(url);
  /** 切换 Agent 后跳过首轮持久化，避免把上一 Agent 的消息写入新 Agent */
  const skipPersistRef = useRef(false);

  const reset = useCallback(() => {
    if (typingFallbackRef.current) {
      clearTimeout(typingFallbackRef.current);
      typingFallbackRef.current = null;
    }
    if (pingTimerRef.current) clearInterval(pingTimerRef.current);
    pingTimerRef.current = null;
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const startPing = useCallback(() => {
    pingTimerRef.current = setInterval(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping', id: genId() }));
      }
    }, PING_INTERVAL);
  }, []);

  const handleIncoming = useCallback((msg: WSMessage) => {
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
        // @ts-ignore backend sends {type:"error", payload:{message:"..."}}
        const errContent = (msg.payload as any)?.message || msg.payload?.content;
        if (errContent) {
          console.error('[Finclaw WS] Server error:', errContent);
          // 把服务器错误追加为一条 assistant 消息，让用户看到
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
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    // 达到最大重试次数后不再自动重试，留给用户手动触发
    if (reconnectCountRef.current > MAX_RECONNECT) {
      setStatus('error');
      return;
    }

    setStatus('connecting');

    try {
      const ws = new WebSocket(target);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        reconnectCountRef.current = 0;
        setStatus('connected');
        setSendError(null);
        console.log('[Finclaw WS] Connected');
        startPing();
      };

      ws.onclose = (ev) => {
        console.log('[Finclaw WS] Closed:', ev.code, ev.reason);
        if (!mountedRef.current) return;
        if (pingTimerRef.current) {
          clearInterval(pingTimerRef.current);
          pingTimerRef.current = null;
        }
        // 主动关闭（code 1000）不重试
        if (ev.code === 1000) {
          setStatus('idle');
          return;
        }
        if (reconnectCountRef.current < MAX_RECONNECT) {
          reconnectCountRef.current += 1;
          setStatus('connecting');
          setTimeout(connect, RECONNECT_DELAY * reconnectCountRef.current);
        } else {
          reconnectCountRef.current += 1;
          setStatus('error');
        }
      };

      ws.onerror = () => {
        if (!mountedRef.current) return;
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
    if (persistAgentKey) clearDraft(persistAgentKey);
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
    reset();
    connect();
  }, [reset, connect]);

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

  // url 变更或挂载/卸载时：重置连接；若有 persistAgentKey 则从本地恢复该 Agent 草稿
  useEffect(() => {
    mountedRef.current = true;
    urlRef.current = url;
    sessionIdRef.current = null;
    reconnectCountRef.current = 0;
    setSendError(null);
    setIsTyping(false);
    skipPersistRef.current = true;
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

  return { messages, status, isTyping, sendError, send, clearMessages, restoreMessages, reconnect };
}
