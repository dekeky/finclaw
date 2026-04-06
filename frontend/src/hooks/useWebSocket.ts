import { useEffect, useRef, useState, useCallback } from 'react';
import type { ChatMessage, ConnectionStatus, WSMessage } from '../types';

const RECONNECT_DELAY = 2000;
const MAX_RECONNECT = 5;
const PING_INTERVAL = 30000;

function genId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function parseHistory(raw: WSMessage): ChatMessage[] {
  if (!raw.payload?.messages) return [];
  return raw.payload.messages.map((m) => ({
    id: m.id || genId(),
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content,
    timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
  }));
}

export interface UseWebSocketReturn {
  messages: ChatMessage[];
  status: ConnectionStatus;
  send: (content: string) => void;
}

export function useWebSocket(url: string): UseWebSocketReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const reconnectCountRef = useRef(0);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const reset = useCallback(() => {
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

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (reconnectCountRef.current >= MAX_RECONNECT) {
      setStatus('error');
      return;
    }

    setStatus('connecting');

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        reconnectCountRef.current = 0;
        setStatus('connected');
        console.log('[Finclaw WS] Connected');
        startPing();
      };

      ws.onclose = (ev) => {
        console.log('[Finclaw WS] Closed:', ev.code, ev.reason);
        if (!mountedRef.current) return;
        setStatus('idle');
        if (pingTimerRef.current) {
          clearInterval(pingTimerRef.current);
          pingTimerRef.current = null;
        }
        // 不重试主动关闭
        if (ev.code === 1000) return;
        if (reconnectCountRef.current < MAX_RECONNECT) {
          reconnectCountRef.current += 1;
          setTimeout(connect, RECONNECT_DELAY * reconnectCountRef.current);
        } else {
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
  }, [url, startPing]);

  const handleIncoming = useCallback((msg: WSMessage) => {
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
          return [...prev, ...deduped];
        });
        break;
      }

      case 'message.send':
      case 'message_create': {
        const content = msg.payload?.content || msg.content || '';
        const role = msg.payload?.role || 'assistant';
        if (!content) {
          console.warn('[Finclaw WS] Empty content in message.send:', msg);
          break;
        }
        setMessages((prev) => [
          ...prev,
          { id: msg.id || genId(), role, content, timestamp: new Date() },
        ]);
        break;
      }

      case 'typing_start':
        // handled by parent if needed
        break;

      case 'error':
        console.error('[Finclaw WS]', msg.payload?.content);
        break;
    }
  }, []);

  const send = useCallback((content: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('[Finclaw WS] Send failed: not connected, readyState:', ws?.readyState);
      return;
    }

    // 即时添加到本地消息列表，保证用户看到自己的消息
    const id = genId();
    setMessages((prev) => [
      ...prev,
      { id, role: 'user', content, timestamp: new Date() },
    ]);

    const msg = {
      type: 'message.send',
      id,
      session_id: sessionIdRef.current || undefined,
      payload: { content },
    };
    console.log('[Finclaw WS] Sending:', JSON.stringify(msg));
    ws.send(JSON.stringify(msg));
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      reset();
    };
  }, [connect, reset]);

  return { messages, status, send };
}
