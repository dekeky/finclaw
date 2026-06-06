import type { ChatMessage, MessageKind, ProcessSegment } from '../types';
import { isPicoclawToolFeedbackContent } from './foldPicoclawToolFeedback';
import { isAssistantThoughtOnlyContent, splitAssistantContent } from './splitAssistantContent';

const PROCESS_JOIN = '\n\n---\n\n';

function isProcessLikePart(content: string): boolean {
  if (isPicoclawToolFeedbackContent(content)) return true;
  if (isAssistantThoughtOnlyContent(content)) return true;
  const head = content.trimStart().slice(0, 96).toLowerCase();
  return (
    head.startsWith('<thinking') ||
    head.startsWith('<redacted_reasoning') ||
    head.startsWith('<redacted_thinking') ||
    head.startsWith('<think') ||
    head.startsWith('```think') ||
    head.startsWith('```thinking')
  );
}

function inferKindFromContent(content: string): MessageKind {
  if (isPicoclawToolFeedbackContent(content)) return 'tool';
  if (isAssistantThoughtOnlyContent(content)) return 'thought';
  return 'reply';
}

/** 从旧版草稿的合并 content 还原 process 分段（需像思考/工具，避免误伤含 --- 的正文） */
function tryReconstructProcess(m: ChatMessage): ChatMessage | null {
  if (m.role !== 'assistant' || m.kind === 'reply') return null;
  if (m.kind === 'process' && m.processSegments?.length) return m;
  if (!m.content.includes(PROCESS_JOIN)) return null;

  const parts = m.content.split(PROCESS_JOIN).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  if (!parts.every(isProcessLikePart)) return null;

  const segments: ProcessSegment[] = parts.map((p) => ({
    type: isPicoclawToolFeedbackContent(p) ? 'tool' : 'thought',
    content: p,
  }));

  return { ...m, kind: 'process', processSegments: segments };
}

/** 补全刷新/归档恢复时丢失的 kind 与 processSegments */
export function rehydrateChatMessage(m: ChatMessage): ChatMessage {
  if (m.role !== 'assistant') return m;

  if (m.kind === 'process' && m.processSegments?.length) {
    // 兼容旧版草稿：若 processSegments 中没有 sourceIds，则把本条消息 id 附加进去，
    // 至少保证后续 from_cache 重放可以基于 id 跳过整段合并消息（避免重复堆叠内容）。
    const hasAnySourceId = m.processSegments.some((s) => s.sourceIds && s.sourceIds.length > 0);
    if (!hasAnySourceId) {
      return {
        ...m,
        processSegments: m.processSegments.map((s, idx) => ({
          ...s,
          sourceIds: idx === 0 ? [m.id] : [],
        })),
      };
    }
    return m;
  }

  if (m.kind === 'reply' || m.kind === 'thought' || m.kind === 'tool') {
    return m;
  }

  const reconstructed = tryReconstructProcess(m);
  if (reconstructed) return reconstructed;

  const { thought, body } = splitAssistantContent(m.content);
  if (thought && body.trim()) {
    return { ...m, kind: 'reply' };
  }

  return { ...m, kind: inferKindFromContent(m.content) };
}

export function rehydrateChatMessages(msgs: ChatMessage[]): ChatMessage[] {
  return msgs.map(rehydrateChatMessage);
}
