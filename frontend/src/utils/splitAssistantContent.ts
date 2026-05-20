/** 模型思考块标签（Hermes / Claude / Qwen 等） */
const THINK_TAG_NAMES = ['thinking', 'redacted_reasoning', 'redacted_thinking', 'think'] as const;

const THINK_BLOCK_RE = new RegExp(
  `<(${THINK_TAG_NAMES.join('|')})(\\s[^>]*)?>([\\s\\S]*?)<\\/\\1>`,
  'gi',
);

/** DeepSeek / Qwen 等：```think ... ``` */
const THINK_FENCE_RE = /```(?:think|thinking)\s*([\s\S]*?)```/gi;

export interface SplitAssistantContent {
  thought: string | null;
  body: string;
}

function isThoughtOnlyHead(content: string): boolean {
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

function stripThinkingWrapper(text: string): string {
  const trimmed = text.trim();
  const openRe = new RegExp(
    `^<(${THINK_TAG_NAMES.join('|')})(\\s[^>]*)?>([\\s\\S]*)$`,
    'i',
  );
  const m = openRe.exec(trimmed);
  if (m) {
    const inner = m[3] ?? '';
    const closeRe = new RegExp(`<\\/(${THINK_TAG_NAMES.join('|')})>\\s*$`, 'i');
    return inner.replace(closeRe, '').trim();
  }
  const fence = /^```(?:think|thinking)\s*([\s\S]*)```$/i.exec(trimmed);
  if (fence) return (fence[1] ?? '').trim();
  return trimmed;
}

function extractThinkFences(content: string): { thoughts: string[]; bodyChunks: string[] } {
  const thoughts: string[] = [];
  const bodyChunks: string[] = [];
  let lastIndex = 0;
  let found = false;

  THINK_FENCE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = THINK_FENCE_RE.exec(content)) !== null) {
    found = true;
    const idx = match.index;
    if (idx > lastIndex) {
      const gap = content.slice(lastIndex, idx).trim();
      if (gap) bodyChunks.push(gap);
    }
    const inner = (match[1] ?? '').trim();
    if (inner) thoughts.push(inner);
    lastIndex = idx + match[0].length;
  }

  if (found) {
    const tail = content.slice(lastIndex).trim();
    if (tail) bodyChunks.push(tail);
  }

  return { thoughts, bodyChunks };
}

/**
 * 将助手消息拆为「思考」与「正文」两部分。
 */
export function splitAssistantContent(content: string): SplitAssistantContent {
  const thoughts: string[] = [];
  const bodyChunks: string[] = [];
  let lastIndex = 0;
  let foundBlock = false;

  THINK_BLOCK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = THINK_BLOCK_RE.exec(content)) !== null) {
    foundBlock = true;
    const idx = match.index;
    if (idx > lastIndex) {
      const gap = content.slice(lastIndex, idx).trim();
      if (gap) bodyChunks.push(gap);
    }
    const inner = (match[3] ?? '').trim();
    if (inner) thoughts.push(inner);
    lastIndex = idx + match[0].length;
  }

  if (foundBlock) {
    const tail = content.slice(lastIndex).trim();
    if (tail) bodyChunks.push(tail);
    return {
      thought: thoughts.length > 0 ? thoughts.join('\n\n---\n\n') : null,
      body: bodyChunks.join('\n\n').trim(),
    };
  }

  const fence = extractThinkFences(content);
  if (fence.thoughts.length > 0) {
    return {
      thought: fence.thoughts.join('\n\n---\n\n'),
      body: fence.bodyChunks.join('\n\n').trim(),
    };
  }

  if (isThoughtOnlyHead(content)) {
    return { thought: stripThinkingWrapper(content), body: '' };
  }

  return { thought: null, body: content };
}

/** 仅有思考块、尚无正文（流式进行中） */
export function isAssistantThoughtOnlyContent(content: string): boolean {
  const { thought, body } = splitAssistantContent(content);
  return Boolean(thought) && !body.trim();
}
