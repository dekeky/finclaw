import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { buildAgentWsUrl } from '@/lib/agentWsUrl';
import { useWebSocket, type UseWebSocketReturn } from '@/hooks/useWebSocket';
import { useAgents } from './agents';

const ChatSessionContext = createContext<UseWebSocketReturn | null>(null);

/**
 * 全局聊天会话：WebSocket 与消息状态随 App 生命周期保持，路由切换不断连。
 */
export function ChatSessionProvider({ children }: { children: ReactNode }) {
  const { currentAgent } = useAgents();
  const wsUrl = useMemo(() => buildAgentWsUrl(currentAgent), [currentAgent]);
  const session = useWebSocket(wsUrl, { persistAgentKey: currentAgent });

  return <ChatSessionContext.Provider value={session}>{children}</ChatSessionContext.Provider>;
}

export function useChatSession(): UseWebSocketReturn {
  const ctx = useContext(ChatSessionContext);
  if (!ctx) {
    throw new Error('useChatSession must be used within ChatSessionProvider');
  }
  return ctx;
}
