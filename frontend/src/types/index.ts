export type MessageRole = 'user' | 'assistant';

/** 助手消息子类型：思考过程 / 工具输出 / 正文回复 */
export type MessageKind = 'reply' | 'thought' | 'tool';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  kind?: MessageKind;
}

export interface WSMessage {
  type: string;
  id?: string;
  session_id?: string;
  content?: string;
  payload?: {
    content?: string;
    role?: MessageRole;
    message_kind?: string;
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
