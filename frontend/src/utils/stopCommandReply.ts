/**
 * picoclaw /stop 命令的英文回执，由后端经聊天接口原样返回。
 *
 * 前端不再回显这些文本：中断后的展示由本地「已撤销」状态承担。
 * 文案来自 github.com/sipeed/picoclaw v0.2.9（go.mod 已钉版本），
 * 只有回复恰好等于这些模式时才会被丢弃。
 */
const STOP_REPLY_EXACT = 'No active task to stop.';
const STOP_REPLY_PREFIXES = ['Task stopped.', 'Failed to stop task:'];

export function isStopCommandReply(content: string): boolean {
  const text = content.trim();
  if (!text) return false;
  if (text === STOP_REPLY_EXACT) return true;
  return STOP_REPLY_PREFIXES.some((prefix) => text.startsWith(prefix));
}
