export type MessageRole = 'user' | 'assistant';

/** 助手消息子类型：思考 / 工具输出 / 合并过程 / 正文回复 */
export type MessageKind = 'reply' | 'thought' | 'tool' | 'process';

export interface ProcessSegment {
  type: 'thought' | 'tool';
  content: string;
  /** 该段对应的原始服务端消息 id 列表（合并段可能包含多个）。用于去重 from_cache 重放。 */
  sourceIds?: string[];
}

/** 媒体附件类型 */
export type AttachmentType = 'image' | 'audio' | 'video' | 'file';

export interface Attachment {
  type: AttachmentType;
  /** 同源下载路径 /fin/media/<id>（需附带 token），或本地上传时的 data: URL */
  url: string;
  filename?: string;
  content_type?: string;
  caption?: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  kind?: MessageKind;
  /** 合并后的思考 + 工具步骤（kind === 'process'） */
  processSegments?: ProcessSegment[];
  /** 媒体附件（图片 / 音频 / 视频 / 文件） */
  attachments?: Attachment[];
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
    attachments?: Attachment[];
    messages?: Array<{
      id: string;
      role: MessageRole;
      content: string;
      timestamp?: string;
    }>;
  };
}

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';
