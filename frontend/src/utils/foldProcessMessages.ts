import type { ChatMessage, ProcessSegment } from '../types';
import { AGGREGATED_THOUGHT_JOIN } from './foldThoughtMessages';
import { AGGREGATED_TOOL_FEEDBACK_JOIN, isPicoclawToolFeedbackContent } from './foldPicoclawToolFeedback';
import { splitAssistantContent } from './splitAssistantContent';

export function isThoughtMessage(m: ChatMessage): boolean {
  return m.role === 'assistant' && m.kind === 'thought';
}

export function isToolMessage(m: ChatMessage): boolean {
  return m.role === 'assistant' && (m.kind === 'tool' || isPicoclawToolFeedbackContent(m.content));
}

export function isProcessMessage(m: ChatMessage): boolean {
  if (m.role !== 'assistant' || m.kind === 'reply') return false;
  return m.kind === 'process' || isThoughtMessage(m) || isToolMessage(m);
}

function segmentType(m: ChatMessage): 'thought' | 'tool' {
  if (m.kind === 'tool' || isPicoclawToolFeedbackContent(m.content)) return 'tool';
  return 'thought';
}

export function getProcessSegments(m: ChatMessage): ProcessSegment[] {
  if (m.processSegments?.length) return m.processSegments;
  if (!isProcessMessage(m)) return [];
  return [{ type: segmentType(m), content: m.content, sourceIds: [m.id] }];
}

function mergeSegment(list: ProcessSegment[], seg: ProcessSegment): ProcessSegment[] {
  const last = list[list.length - 1];
  const incomingIds = seg.sourceIds && seg.sourceIds.length > 0 ? seg.sourceIds : [];
  if (last && last.type === seg.type) {
    const join = seg.type === 'tool' ? AGGREGATED_TOOL_FEEDBACK_JOIN : AGGREGATED_THOUGHT_JOIN;
    const mergedIds = [...(last.sourceIds ?? []), ...incomingIds];
    return [
      ...list.slice(0, -1),
      {
        type: seg.type,
        content: `${last.content}${join}${seg.content}`,
        sourceIds: mergedIds.length > 0 ? mergedIds : undefined,
      },
    ];
  }
  return [...list, seg];
}

function buildProcessMessage(base: ChatMessage, segments: ProcessSegment[]): ChatMessage {
  return {
    ...base,
    kind: 'process',
    processSegments: segments,
    content: segments.map((s) => s.content).join('\n\n---\n\n'),
  };
}

export function findLastUserIndex(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return i;
  }
  return -1;
}

/** 指定用户轮次内（下一条 user 之前）的全部思考/工具片段，供已完成面板聚合展示。 */
export function collectProcessSegmentsForTurn(
  messages: ChatMessage[],
  afterUserIndex: number,
): ProcessSegment[] {
  if (afterUserIndex < 0) return [];

  const turnMessages = messages.slice(afterUserIndex + 1);
  const nextUserOffset = turnMessages.findIndex((m) => m.role === 'user');
  const slice = nextUserOffset < 0 ? turnMessages : turnMessages.slice(0, nextUserOffset);

  let segments: ProcessSegment[] = [];
  for (const m of slice) {
    if (isProcessMessage(m)) {
      for (const seg of getProcessSegments(m)) {
        segments = mergeSegment(segments, seg);
      }
      continue;
    }
    if (m.role === 'assistant') {
      const { thought } = splitAssistantContent(m.content);
      if (thought) {
        segments = mergeSegment(segments, { type: 'thought', content: thought });
      }
    }
  }

  return segments;
}

/** 当前轮次（最后一条用户消息之后）的思考/工具片段，供进行中面板展示 */
export function collectActiveTaskSegments(messages: ChatMessage[]): ProcessSegment[] {
  const last = messages[messages.length - 1];
  if (!last || last.role === 'user') return [];
  return collectProcessSegmentsForTurn(messages, findLastUserIndex(messages));
}

/** 判断给定 msgId 是否已经存在于 messages 中（包括被折叠到 process 段里的 sourceIds）。 */
export function hasMessageId(messages: ChatMessage[], id: string): boolean {
  for (const m of messages) {
    if (m.id === id) return true;
    if (m.processSegments) {
      for (const seg of m.processSegments) {
        if (seg.sourceIds?.includes(id)) return true;
      }
    }
  }
  return false;
}

/** 合并连续的思考与工具消息，统一在一个面板里滚动更新 */
export function foldConsecutiveProcessMessages(msgs: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of msgs) {
    if (!isProcessMessage(m)) {
      out.push({ ...m });
      continue;
    }
    const last = out[out.length - 1];
    if (last && isProcessMessage(last)) {
      // 走入合并分支时，把当前消息的 segment 中标注上 sourceId，以便日后去重
      const incomingSegments = getProcessSegments(m).map((s) => ({
        ...s,
        sourceIds: s.sourceIds && s.sourceIds.length > 0 ? s.sourceIds : [m.id],
      }));
      let segments = getProcessSegments(last);
      for (const seg of incomingSegments) {
        segments = mergeSegment(segments, seg);
      }
      out[out.length - 1] = buildProcessMessage(last, segments);
    } else {
      // 起始 process 消息也带上 sourceId
      const segments = getProcessSegments(m).map((s) => ({
        ...s,
        sourceIds: s.sourceIds && s.sourceIds.length > 0 ? s.sourceIds : [m.id],
      }));
      out.push(buildProcessMessage(m, segments));
    }
  }
  return out;
}
