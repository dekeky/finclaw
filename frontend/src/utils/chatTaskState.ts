import type { ChatMessage } from '../types';
import { findLastUserIndex, isProcessMessage } from './foldProcessMessages';
import { splitAssistantContent } from './splitAssistantContent';

/** 当前轮次内最后一条工作过程消息（折叠后的 process / thought / tool） */
export function findLastProcessIndexInTurn(messages: ChatMessage[]): number {
  const start = findLastUserIndex(messages) + 1;
  let lastIdx = -1;
  for (let i = start; i < messages.length; i++) {
    if (isProcessMessage(messages[i])) lastIdx = i;
  }
  return lastIdx;
}

/** 当前轮次内最后一条带正文的助手回复（含 thought+body 拆分后的 body） */
export function findCompleteReplyIndexInTurn(messages: ChatMessage[]): number {
  const start = findLastUserIndex(messages) + 1;
  let lastIdx = -1;
  for (let i = start; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== 'assistant' || isProcessMessage(m)) continue;
    const { body } = splitAssistantContent(m.content);
    if (body.trim()) lastIdx = i;
  }
  return lastIdx;
}

export function hasCompleteReplyInTurn(messages: ChatMessage[]): boolean {
  return findCompleteReplyIndexInTurn(messages) >= 0;
}

/** 草稿恢复后：最后一条尚未形成完整正文回复，应继续展示进行中思考面板 */
export function isIncompleteChatTask(messages: ChatMessage[]): boolean {
  if (hasCompleteReplyInTurn(messages)) return false;

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
  if (hasCompleteReplyInTurn(messages)) return false;
  if (isTyping) return true;
  // 仅「用户已发送、尚未收到助手消息」时保持进行中面板；避免 reasoning/工具结束后
  // isIncompleteChatTask 仍为 true 导致过程消息被 processOutputActive 永久隐藏。
  const last = messages[messages.length - 1];
  return last?.role === 'user';
}
