export type MessageRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
}

export interface WSMessage {
  type: string;
  id?: string;
  session_id?: string;
  content?: string;
  payload?: {
    content?: string;
    role?: MessageRole;
    client_id?: string;
    messages?: Array<{
      id: string;
      role: MessageRole;
      content: string;
      timestamp?: string;
    }>;
  };
}

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';
