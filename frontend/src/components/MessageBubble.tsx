import { useState, useCallback } from 'react';
import type { ChatMessage } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { AGGREGATED_TOOL_FEEDBACK_JOIN } from '../utils/foldPicoclawToolFeedback';

type HermesFoldKind = 'thought' | 'tool_feedback';

function inferHermesFoldKind(m: ChatMessage): HermesFoldKind | undefined {
  if (m.role !== 'assistant') return undefined;
  const raw = m.content.trimStart();
  if (!raw) return undefined;
  if (raw.startsWith('🔧')) return 'tool_feedback';
  const head = raw.slice(0, 96).toLowerCase();
  if (
    head.startsWith('<thinking') ||
    head.startsWith('<redacted_reasoning') ||
    head.startsWith('<redacted_thinking')
  ) {
    return 'thought';
  }
  return undefined;
}

interface MessageBubbleProps {
  message: ChatMessage;
  variant?: 'default' | 'dock';
}

function ellipsisOneLine(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trimEnd()}…`;
}

function summarizeThought(content: string): string {
  const preview = ellipsisOneLine(content, 64);
  return preview ? `思考 · ${preview}` : '思考过程';
}

function parseToolFeedbackParts(content: string): string[] {
  return content.split(AGGREGATED_TOOL_FEEDBACK_JOIN).map((s) => s.trim()).filter(Boolean);
}

function summarizeToolFeedback(content: string): string {
  const parts = parseToolFeedbackParts(content);
  if (parts.length <= 1) {
    const line = content.split('\n')[0]?.trim() || '';
    if (!line) return '工具调研';
    const one = ellipsisOneLine(line, 88);
    return one.startsWith('🔧') ? `工具调研 · ${one.replace(/^🔧\s*/, '')}` : `工具调研 · ${one}`;
  }
  const names: string[] = [];
  for (const p of parts) {
    const first = p.split('\n')[0]?.trim() || '';
    const m = /^🔧\s*`([^`]+)`/.exec(first);
    if (m) names.push(m[1]);
  }
  if (names.length > 0) {
    const head = names.slice(0, 3).join('、');
    const suf = names.length > 3 ? ` 等 ${names.length} 个` : '';
    return `工具调研 · ${head}${suf}`;
  }
  return `工具调研 · ${parts.length} 项`;
}

interface AssistantMarkdownBodyProps {
  messageId: string;
  content: string;
  copiedId: string | null;
  handleCopy: (code: string, id: string) => void;
}

function CopyButton({ code, id, copied, onCopy }: { code: string; id: string; copied: boolean; onCopy: (code: string, id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onCopy(code, id)}
      className="absolute top-2 right-2 rounded-md bg-muted/80 p-1.5 text-muted-foreground backdrop-blur transition-all hover:bg-muted hover:text-foreground"
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

function AssistantMarkdownBody({ messageId, content, copiedId, handleCopy }: AssistantMarkdownBodyProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const code = String(children).replace(/\n$/, '');
          const codeId = `${messageId}-${match ? match[1] : 'inline'}`;
          if (match) {
            return (
              <div className="group/code relative">
                <CopyButton code={code} id={codeId} copied={copiedId === codeId} onCopy={handleCopy} />
                <SyntaxHighlighter
                  style={oneDark}
                  language={match[1]}
                  PreTag="div"
                  customStyle={{ borderRadius: '0.5rem', fontSize: '13px' }}
                >
                  {code}
                </SyntaxHighlighter>
              </div>
            );
          }
          return (
            <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[13px]" {...props}>
              {children}
            </code>
          );
        },
        a({ href, children }) {
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-violet-500 underline underline-offset-2 hover:text-violet-600">
              {children}
            </a>
          );
        },
        table({ children }) {
          return (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">{children}</table>
            </div>
          );
        },
        blockquote({ children }) {
          return <blockquote className="border-l-3 border-violet-500/40 pl-4 my-3 text-muted-foreground">{children}</blockquote>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function HermesDetails({ summaryLabel, children }: { summaryLabel: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 mt-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/30"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`transition-transform ${open ? 'rotate-90' : ''}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        {summaryLabel}
      </button>
      {open && (
        <div className="border-t border-border/30 px-3 py-3 text-[13px] leading-relaxed text-foreground max-h-[520px] overflow-y-auto">
          {children}
        </div>
      )}
    </div>
  );
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const time = message.timestamp.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const isUser = message.role === 'user';

  const handleCopy = useCallback((code: string, id: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

  const foldKind = !isUser ? inferHermesFoldKind(message) : undefined;
  const useHermesCollapse = foldKind !== undefined;

  const assistantMarkdown = (
    <AssistantMarkdownBody messageId={message.id} content={message.content} copiedId={copiedId} handleCopy={handleCopy} />
  );

  const assistantBubbleBody = () => {
    if (useHermesCollapse && foldKind === 'thought') {
      return (
        <HermesDetails summaryLabel={summarizeThought(message.content)}>
          {assistantMarkdown}
        </HermesDetails>
      );
    }
    if (useHermesCollapse && foldKind === 'tool_feedback') {
      return (
        <HermesDetails summaryLabel={summarizeToolFeedback(message.content)}>
          {assistantMarkdown}
        </HermesDetails>
      );
    }
    return assistantMarkdown;
  };

  return (
    <div
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} animate-in fade-in-0 slide-in-from-bottom-2 duration-300`}
    >
      {/* Avatar */}
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-semibold ${
          isUser
            ? 'bg-violet-500 text-white'
            : 'bg-gradient-to-br from-amber-100 to-amber-200 text-amber-700 dark:from-amber-900/50 dark:to-amber-950/30'
        }`}
      >
        {isUser ? '我' : 'AI'}
      </div>

      {/* Content */}
      <div className={`flex max-w-[90%] flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
            isUser
              ? 'rounded-tr-sm bg-violet-500 text-white'
              : 'rounded-tl-sm border border-border/60 bg-card text-foreground'
          }`}
        >
          {isUser ? <span>{message.content}</span> : assistantBubbleBody()}
        </div>
        <span className="px-1 text-[10px] font-mono text-muted-foreground/60">{time}</span>
      </div>
    </div>
  );
}