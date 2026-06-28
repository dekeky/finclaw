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

/**
 * 刷新后恢复任务计时/typing 状态（与 mount effect 共用，避免分支不一致）。
 */
export function resolveRestoredTaskState(
  messages: ChatMessage[],
  persistedStartMs: number | null,
  persistedElapsedSec: number | null,
): {
  taskStartedAt: number | null;
  completedTaskElapsedSec: number | null;
  isTyping: boolean;
  /** 需要把 restored start 写回 localStorage（仅 waitingForFirstReply 且无 persisted 时） */
  persistStartMs: number | null;
  /** 已完成对话：清除 localStorage 中可能残留的任务起点 */
  clearPersistedStart: boolean;
} {
  const waitingForFirstReply = isChatTaskActive(messages, false);
  const incomplete = isIncompleteChatTask(messages);

  if (!incomplete && !waitingForFirstReply) {
    return {
      taskStartedAt: null,
      completedTaskElapsedSec: persistedElapsedSec,
      isTyping: false,
      persistStartMs: null,
      clearPersistedStart: persistedStartMs != null,
    };
  }

  if (waitingForFirstReply) {
    const start = persistedStartMs ?? Date.now();
    return {
      taskStartedAt: start,
      completedTaskElapsedSec: null,
      isTyping: true,
      persistStartMs: persistedStartMs == null ? start : null,
      clearPersistedStart: false,
    };
  }

  // 有 process 草稿、等待后续助手输出：仅恢复已持久化的起点，禁止 refresh 时伪造新起点
  return {
    taskStartedAt: persistedStartMs,
    completedTaskElapsedSec: null,
    isTyping: false,
    persistStartMs: null,
    clearPersistedStart: false,
  };
}

/**
 * 工作过程计时是否应继续（含刷新后从 localStorage 恢复 taskStartedAt 的场景）。
 * 与 isChatTaskActive 分离：后者控制过程消息的「进行中/已完成」展示，避免 reasoning 间隙误判；
 * 计时则在「本轮未完成且已有起始时间」时延续总耗时。
 */
export function isTaskTimingActive(
  messages: ChatMessage[],
  isTyping: boolean,
  taskStartedAtMs: number | null,
): boolean {
  if (hasCompleteReplyInTurn(messages)) return false;
  if (isChatTaskActive(messages, isTyping)) return true;
  return isIncompleteChatTask(messages) && taskStartedAtMs != null;
}
