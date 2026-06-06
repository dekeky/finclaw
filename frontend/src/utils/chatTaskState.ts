import type { ChatMessage } from '../types';
import { isProcessMessage } from './foldProcessMessages';
import { splitAssistantContent } from './splitAssistantContent';

/** 草稿恢复后：最后一条尚未形成完整正文回复，应继续展示进行中思考面板 */
export function isIncompleteChatTask(messages: ChatMessage[]): boolean {
  const last = messages[messages.length - 1];
  if (!last) return false;
  if (last.role === 'user') return true;
  if (last.role !== 'assistant') return false;
  if (isProcessMessage(last)) return true;
  if (last.kind === 'thought' || last.kind === 'tool') return true;
  const { thought, body } = splitAssistantContent(last.content);
  if (thought && !body.trim()) return true;
  return false;
}

export function isChatTaskActive(messages: ChatMessage[], isTyping: boolean): boolean {
  return isTyping || isIncompleteChatTask(messages);
}
