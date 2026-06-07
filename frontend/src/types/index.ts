export type MessageRole = 'user' | 'assistant';

/** 助手消息子类型：思考 / 工具输出 / 合并过程 / 正文回复 */
export type MessageKind = 'reply' | 'thought' | 'tool' | 'process';

export interface ProcessSegment {
  type: 'thought' | 'tool';
  content: string;
  /** 该段对应的原始服务端消息 id 列表（合并段可能包含多个）。用于去重 from_cache 重放。 */
  sourceIds?: string[];
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  kind?: MessageKind;
  /** 合并后的思考 + 工具步骤（kind === 'process'） */
  processSegments?: ProcessSegment[];
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
