import type { ChatMessage } from '../types';

export const AGGREGATED_THOUGHT_JOIN = '\n\n---\n\n';

export function isThoughtMessage(m: ChatMessage): boolean {
  return m.role === 'assistant' && m.kind === 'thought';
}

/** 合并连续的思考消息，便于滚动更新展示 */
export function foldConsecutiveThoughtMessages(msgs: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of msgs) {
    if (!isThoughtMessage(m)) {
      out.push({ ...m });
      continue;
    }
    const last = out[out.length - 1];
    if (last && isThoughtMessage(last)) {
      out[out.length - 1] = {
        ...last,
        content: `${last.content}${AGGREGATED_THOUGHT_JOIN}${m.content}`,
      };
    } else {
      out.push({ ...m });
    }
  }
  return out;
}
