/** Detect agent tool output that wrote/edited the current strategy file. */
export function messageTouchesStrategyFile(content: string, strategyPath?: string | null): boolean {
  const text = content.trim();
  if (!text) return false;

  const hasFileTool =
    text.includes('write_file')
    || text.includes('edit_file')
    || text.includes('写入文件')
    || (text.includes('🔧') && text.includes('strategies/'));

  if (!hasFileTool && !text.includes('strategies/')) return false;
  if (!text.includes('strategies/')) return false;

  if (!strategyPath?.trim()) return true;

  const normalizedPath = strategyPath.trim();
  const fileName = normalizedPath.split('/').pop();
  return (
    text.includes(normalizedPath)
    || (fileName != null && fileName.length > 0 && text.includes(fileName))
  );
}

type TurnMessage = {
  role: string;
  content: string;
  id: string;
  processSegments?: Array<{ content: string }>;
};

function messageText(msg: TurnMessage): string {
  if (msg.processSegments?.length) {
    return msg.processSegments.map((s) => s.content).join('\n\n---\n\n');
  }
  return msg.content;
}

/** Scan assistant messages in the latest user turn for strategy file writes. */
export function findStrategyFileTouchInTurn(
  messages: TurnMessage[],
  strategyPath?: string | null,
): { id: string; content: string } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'user') break;
    if (msg.role !== 'assistant') continue;
    const text = messageText(msg);
    if (messageTouchesStrategyFile(text, strategyPath)) {
      return { id: msg.id, content: text };
    }
  }
  return null;
}

/** Whether the latest turn includes a user message (agent task was triggered). */
export function turnHasUserMessage(messages: Array<{ role: string }>): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return true;
  }
  return false;
}
