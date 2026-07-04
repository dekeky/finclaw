import { CHAT_SLASH_COMMANDS, normalizeSlashInput } from '@/components/ChatSlashHints';
import type { ChatMessage } from '../types';

const ASSISTANT_SLASH_ACK_EXACT = new Set([
  'Chat history cleared!',
  'No active task to stop.',
  'Task stopped. Current task was canceled.',
]);

/** picoclaw 执行 slash 命令后的确认文案，不应出现在聊天 UI 或本地草稿中。 */
export function isPicoclawSlashCommandNoise(
  content: string,
  role: 'user' | 'assistant',
): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;

  if (role === 'user') {
    const normalized = normalizeSlashInput(trimmed);
    return CHAT_SLASH_COMMANDS.some((c) => c.command === normalized);
  }

  if (ASSISTANT_SLASH_ACK_EXACT.has(trimmed)) return true;
  if (trimmed.startsWith('Failed to clear chat history:')) return true;
  if (trimmed.startsWith('Failed to stop task:')) return true;
  if (trimmed.startsWith('Task stopped. ') && trimmed.endsWith(' was canceled.')) return true;

  return false;
}

export function stripPicoclawSlashCommandNoise(msgs: ChatMessage[]): ChatMessage[] {
  return msgs.filter((m) => !isPicoclawSlashCommandNoise(m.content, m.role));
}
