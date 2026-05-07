import type { ChatMessage } from '../types';

/** 合并多条工具进度时的分隔符；拆解摘要时需与此一致 */
export const AGGREGATED_TOOL_FEEDBACK_JOIN = '\n\n---\n\n';

/** PicoClaw 工具进度条：正文以 🔧（U+1F527）开头 */
export function isPicoclawToolFeedbackContent(content: string): boolean {
  return content.trimStart().startsWith('🔧');
}

/**
 * 将连续的助手「工具反馈」气泡合并为一条，避免刷屏。
 * 仅在两条均为 assistant + 🔧 时合并；中间夹着用户或其它正文则断开。
 */
export function foldConsecutivePicoclawToolFeedback(msgs: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of msgs) {
    if (m.role !== 'assistant' || !isPicoclawToolFeedbackContent(m.content)) {
      out.push({ ...m });
      continue;
    }
    const last = out[out.length - 1];
    if (last?.role === 'assistant' && isPicoclawToolFeedbackContent(last.content)) {
      out[out.length - 1] = {
        ...last,
        content: `${last.content}${AGGREGATED_TOOL_FEEDBACK_JOIN}${m.content}`,
      };
    } else {
      out.push({ ...m });
    }
  }
  return out;
}
