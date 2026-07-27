/**
 * Extract Python code from markdown assistant replies.
 * Prefers ```python blocks; falls back to generic fenced blocks.
 */
export function extractPythonCode(content: string): string | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  const pythonBlock = /```(?:python|py)\s*\n([\s\S]*?)```/i.exec(trimmed);
  if (pythonBlock?.[1]?.trim()) {
    return pythonBlock[1].trim();
  }

  const anyBlock = /```[^\n]*\n([\s\S]*?)```/.exec(trimmed);
  if (anyBlock?.[1]?.trim()) {
    return anyBlock[1].trim();
  }

  if (trimmed.includes('def ') || trimmed.includes('import ')) {
    return trimmed;
  }

  return null;
}

/** Find the latest assistant reply containing extractable Python code. */
export function findLatestPythonReply(
  messages: Array<{ role: string; content: string; kind?: string }>,
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant') continue;
    if (msg.kind === 'thought' || msg.kind === 'tool') continue;
    const code = extractPythonCode(msg.content);
    if (code) return code;
  }
  return null;
}
