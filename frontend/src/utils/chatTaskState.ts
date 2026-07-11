import type { ChatMessage } from '../types';
import { findLastUserIndex, isProcessMessage } from './foldProcessMessages';
import { splitAssistantContent } from './splitAssistantContent';

/** 指定用户消息之后、下一条用户消息之前（或列表末尾）的轮次区间。 */
export function getTurnRange(
  messages: ChatMessage[],
  afterUserIndex: number,
): { start: number; end: number } {
  const start = afterUserIndex + 1;
  let end = messages.length;
  for (let i = start; i < messages.length; i++) {
    if (messages[i].role === 'user') {
      end = i;
      break;
    }
  }
  return { start, end };
}

/** 某条消息所属轮次的用户消息下标（向前找最近一条 user）。 */
export function findOwningUserIndex(messages: ChatMessage[], messageIndex: number): number {
  for (let i = messageIndex; i >= 0; i--) {
    if (messages[i].role === 'user') return i;
  }
  return -1;
}

/** 指定用户轮次内最后一条工作过程消息（折叠后的 process / thought / tool） */
export function findLastProcessIndexAfterUser(
  messages: ChatMessage[],
  afterUserIndex: number,
): number {
  const { start, end } = getTurnRange(messages, afterUserIndex);
  let lastIdx = -1;
  for (let i = start; i < end; i++) {
    if (isProcessMessage(messages[i])) lastIdx = i;
  }
  return lastIdx;
}

/** 指定用户轮次内最后一条带正文的助手回复（含 thought+body 拆分后的 body） */
export function findCompleteReplyIndexAfterUser(
  messages: ChatMessage[],
  afterUserIndex: number,
): number {
  const { start, end } = getTurnRange(messages, afterUserIndex);
  let lastIdx = -1;
  for (let i = start; i < end; i++) {
    const m = messages[i];
    if (m.role !== 'assistant' || isProcessMessage(m)) continue;
    const { body } = splitAssistantContent(m.content);
    if (body.trim()) lastIdx = i;
  }
  return lastIdx;
}

export function hasCompleteReplyAfterUser(messages: ChatMessage[], afterUserIndex: number): boolean {
  return findCompleteReplyIndexAfterUser(messages, afterUserIndex) >= 0;
}

/** 当前轮次内最后一条工作过程消息（折叠后的 process / thought / tool） */
export function findLastProcessIndexInTurn(messages: ChatMessage[]): number {
  const userIdx = findLastUserIndex(messages);
  if (userIdx < 0) return -1;
  return findLastProcessIndexAfterUser(messages, userIdx);
}

/** 当前轮次内最后一条带正文的助手回复（含 thought+body 拆分后的 body） */
export function findCompleteReplyIndexInTurn(messages: ChatMessage[]): number {
  const userIdx = findLastUserIndex(messages);
  if (userIdx < 0) return -1;
  return findCompleteReplyIndexAfterUser(messages, userIdx);
}

/** 轮次是否已有可展示内容且尚未写入 taskElapsedSec。 */
export function turnNeedsElapsedStamp(messages: ChatMessage[], afterUserIndex: number): boolean {
  const processIdx = findLastProcessIndexAfterUser(messages, afterUserIndex);
  const replyIdx = findCompleteReplyIndexAfterUser(messages, afterUserIndex);
  const targetIdx = processIdx >= 0 ? processIdx : replyIdx;
  if (targetIdx < 0) return false;
  return messages[targetIdx].taskElapsedSec == null;
}

/** 用消息时间戳估算某轮耗时（迟到的回复无法使用当前计时器时的兜底）。 */
export function estimateTurnElapsedSec(messages: ChatMessage[], afterUserIndex: number): number | null {
  const user = messages[afterUserIndex];
  if (!user?.timestamp) return null;
  const userMs =
    user.timestamp instanceof Date ? user.timestamp.getTime() : new Date(user.timestamp).getTime();
  const replyIdx = findCompleteReplyIndexAfterUser(messages, afterUserIndex);
  const processIdx = findLastProcessIndexAfterUser(messages, afterUserIndex);
  const anchorIdx = replyIdx >= 0 ? replyIdx : processIdx;
  if (anchorIdx < 0) return null;
  const anchor = messages[anchorIdx];
  if (!anchor?.timestamp) return null;
  const anchorMs =
    anchor.timestamp instanceof Date ? anchor.timestamp.getTime() : new Date(anchor.timestamp).getTime();
  return Math.max(0, Math.floor((anchorMs - userMs) / 1000));
}

/**
 * 把总耗时写在指定轮的「工作过程」消息上（无独立过程消息时落到该轮正文回复）。
 */
export function stampTaskElapsedForTurn(
  msgs: ChatMessage[],
  elapsedSec: number,
  afterUserIndex: number,
): ChatMessage[] {
  const processIdx = findLastProcessIndexAfterUser(msgs, afterUserIndex);
  const targetIdx = processIdx >= 0 ? processIdx : findCompleteReplyIndexAfterUser(msgs, afterUserIndex);
  if (targetIdx < 0) return msgs;
  if (msgs[targetIdx].taskElapsedSec === elapsedSec) return msgs;
  const next = [...msgs];
  next[targetIdx] = { ...next[targetIdx], taskElapsedSec: elapsedSec };
  return next;
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
): {
  taskStartedAt: number | null;
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
      isTyping: false,
      persistStartMs: null,
      clearPersistedStart: persistedStartMs != null,
    };
  }

  if (waitingForFirstReply) {
    const start = persistedStartMs ?? Date.now();
    return {
      taskStartedAt: start,
      isTyping: true,
      persistStartMs: persistedStartMs == null ? start : null,
      clearPersistedStart: false,
    };
  }

  // 有 process 草稿、等待后续助手输出：仅恢复已持久化的起点，禁止 refresh 时伪造新起点
  return {
    taskStartedAt: persistedStartMs,
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
