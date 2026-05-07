import { useState, useCallback, useRef, useEffect, type ReactNode, type CSSProperties } from 'react';
import type { ChatMessage } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { AGGREGATED_TOOL_FEEDBACK_JOIN } from '../utils/foldPicoclawToolFeedback';

/** 折叠详情区内最多展示的独立工具反馈条数（合并气泡按分隔符切分后的条数） */
const TOOL_RESEARCH_DETAIL_MAX = 5;

/** 仅由前端根据正文特征推断，不依赖 WebSocket 额外字段 */
type HermesFoldKind = 'thought' | 'tool_feedback';

function inferHermesFoldKind(m: ChatMessage): HermesFoldKind | undefined {
  if (m.role !== 'assistant') return undefined;
  const raw = m.content.trimStart();
  if (!raw) return undefined;
  // Picoclaw：`FormatToolFeedbackMessage` / loop 内 `\U0001f527 `%s`\n...`
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
  /** 侧栏会话：更接近元宝等产品 — 用户偏青绿、助手偏中性底 */
  variant?: 'default' | 'dock';
}

function ellipsisOneLine(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trimEnd()}…`;
}

function summarizeThought(content: string, dock: boolean): string {
  const preview = ellipsisOneLine(content, dock ? 52 : 64);
  return preview ? `思考 · ${preview}` : '思考过程';
}

function parseToolFeedbackParts(content: string): string[] {
  return content.split(AGGREGATED_TOOL_FEEDBACK_JOIN).map((s) => s.trim()).filter(Boolean);
}

/** 摘要行：罗列工具名 + 总规模，便于未展开时了解调研范围 */
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

function HermesDetails({ summaryLabel, dock, children }: { summaryLabel: string; dock: boolean; children: ReactNode }) {
  return (
    <details style={dock ? collapsible.detailsDock : collapsible.details}>
      <summary style={dock ? collapsible.summaryDock : collapsible.summary}>{summaryLabel}</summary>
      <div style={dock ? collapsible.bodyDock : collapsible.body}>{children}</div>
    </details>
  );
}

function HermesToolFeedbackFold({
  message,
  dock,
  copiedId,
  handleCopy,
}: {
  message: ChatMessage;
  dock: boolean;
  copiedId: string | null;
  handleCopy: (code: string, id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const content = message.content;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(id);
  }, [content]);

  const parts = parseToolFeedbackParts(content);
  const shown = parts.slice(0, TOOL_RESEARCH_DETAIL_MAX);
  const detailMarkdown =
    shown.length > 0 ? shown.join(AGGREGATED_TOOL_FEEDBACK_JOIN) : content.trim() || '';

  const summaryLabel = summarizeToolFeedback(content);

  return (
    <details style={dock ? collapsible.detailsDock : collapsible.details}>
      <summary style={dock ? collapsible.summaryDock : collapsible.summary}>{summaryLabel}</summary>
      <div ref={scrollRef} style={dock ? collapsible.bodyDock : collapsible.body}>
        <AssistantMarkdownBody
          messageId={message.id}
          content={detailMarkdown}
          copiedId={copiedId}
          handleCopy={handleCopy}
        />
        {parts.length > TOOL_RESEARCH_DETAIL_MAX ? (
          <div style={dock ? toolResearchHintDock : toolResearchHint}>
            共 {parts.length} 条工具记录；详情滚动区仅展示前 {TOOL_RESEARCH_DETAIL_MAX} 条摘要。
          </div>
        ) : null}
      </div>
    </details>
  );
}

const toolResearchHint: CSSProperties = {
  marginTop: 12,
  paddingTop: 10,
  borderTop: '1px dashed var(--fc-border-strong)',
  fontSize: 11.5,
  color: 'var(--fc-text-muted)',
  lineHeight: 1.5,
};
const toolResearchHintDock: CSSProperties = {
  ...toolResearchHint,
  marginTop: 10,
  paddingTop: 8,
  fontSize: 11,
};

interface AssistantMarkdownBodyProps {
  messageId: string;
  content: string;
  copiedId: string | null;
  handleCopy: (code: string, id: string) => void;
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
              <div style={{ position: 'relative', margin: '10px 0' }}>
                <button
                  style={{
                    ...copyBtn,
                    ...(copiedId === codeId ? copyBtnSuccess : {}),
                  }}
                  type="button"
                  onClick={() => handleCopy(code, codeId)}
                  title="Copy code"
                >
                  {copiedId === codeId ? (
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
                <SyntaxHighlighter
                  style={oneDark}
                  language={match[1]}
                  PreTag="div"
                  customStyle={{
                    borderRadius: 8,
                    fontSize: 13,
                    background: '#1a1a2e',
                  }}
                  {...(props as object)}
                >
                  {code}
                </SyntaxHighlighter>
              </div>
            );
          }
          return (
            <code className={className} style={styles.inlineCode} {...props}>
              {children}
            </code>
          );
        },
        a({ href, children }) {
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" style={styles.link}>
              {children}
            </a>
          );
        },
        table({ children }) {
          return (
            <div style={{ overflowX: 'auto' }}>
              <table style={styles.table}>{children}</table>
            </div>
          );
        },
        blockquote({ children }) {
          return <blockquote style={styles.blockquote}>{children}</blockquote>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export function MessageBubble({ message, variant = 'default' }: MessageBubbleProps) {
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

  const dock = variant === 'dock';
  const avatarSize = dock ? styles.avatarDock : {};
  const userAv = dock ? styles.userAvatarDock : styles.userAvatar;
  const aiAv = dock ? styles.aiAvatarDock : styles.aiAvatar;
  const userBu = dock ? styles.userBubbleDock : styles.userBubble;
  const aiBu = dock ? styles.aiBubbleDock : styles.aiBubble;

  const foldKind = !isUser ? inferHermesFoldKind(message) : undefined;
  const useHermesCollapse = foldKind !== undefined;

  const assistantMarkdown = (
    <AssistantMarkdownBody messageId={message.id} content={message.content} copiedId={copiedId} handleCopy={handleCopy} />
  );

  const assistantBubbleBody = () => {
    if (useHermesCollapse && foldKind === 'thought') {
      const summaryLabel = summarizeThought(message.content, dock);
      return (
        <HermesDetails summaryLabel={summaryLabel} dock={dock}>
          {assistantMarkdown}
        </HermesDetails>
      );
    }
    if (useHermesCollapse && foldKind === 'tool_feedback') {
      return (
        <HermesToolFeedbackFold
          message={message}
          dock={dock}
          copiedId={copiedId}
          handleCopy={handleCopy}
        />
      );
    }
    return assistantMarkdown;
  };

  const bubbleTone =
    useHermesCollapse && foldKind
      ? {
          ...(isUser ? userBu : aiBu),
          borderLeft: dock ? '3px solid rgba(45,212,191,0.45)' : '3px solid rgba(36,104,242,0.35)',
          paddingLeft: dock ? '12px 14px' : '13px 16px',
        }
      : { ...(isUser ? userBu : aiBu) };

  return (
    <div
      style={{ ...styles.message, ...(dock ? styles.messageDock : {}), ...(isUser ? styles.user : styles.assistant) }}
      className="finclaw-message"
    >
      <div style={{ ...styles.avatar, ...avatarSize, ...(isUser ? userAv : aiAv) }}>
        {isUser ? '我' : 'AI'}
      </div>
      <div style={styles.content}>
        <div
          style={{
            ...styles.bubble,
            ...bubbleTone,
            ...(useHermesCollapse ? { whiteSpace: 'normal' as const } : {}),
          }}
          className={`finclaw-bubble${useHermesCollapse ? ' finclaw-hermes' : ''}`}
        >
          {isUser ? <span style={styles.text}>{message.content}</span> : assistantBubbleBody()}
        </div>
        <div style={{ ...styles.time, ...(isUser ? { textAlign: 'right' } : {}) }}>{time}</div>
      </div>
    </div>
  );
}

const collapsible = {
  details: {
    borderRadius: 8,
    border: '1px solid rgba(15,23,42,0.08)',
    background: 'var(--fc-bg-app)',
    padding: '8px 10px',
    marginTop: 2,
  } as CSSProperties,
  detailsDock: {
    borderRadius: 10,
    border: '1px solid var(--fc-border)',
    background: 'var(--fc-bg-app)',
    padding: '6px 8px',
    marginTop: 2,
  } as CSSProperties,
  summary: {
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 550,
    color: 'var(--fc-text-muted)',
    listStyle: 'none',
    userSelect: 'none',
    lineHeight: 1.45,
  } as CSSProperties,
  summaryDock: {
    cursor: 'pointer',
    fontSize: 11.5,
    fontWeight: 600,
    color: 'var(--fc-text-muted)',
    listStyle: 'none',
    userSelect: 'none',
    lineHeight: 1.4,
  } as CSSProperties,
  body: {
    marginTop: 10,
    paddingTop: 10,
    borderTop: '1px dashed var(--fc-border-strong)',
    fontSize: 13,
    color: 'var(--fc-text)',
    lineHeight: 1.6,
    maxHeight: 'min(520px, 42vh)',
    overflowY: 'auto' as const,
  } as CSSProperties,
  bodyDock: {
    marginTop: 8,
    paddingTop: 8,
    borderTop: '1px dashed var(--fc-border-strong)',
    fontSize: 12.5,
    color: 'var(--fc-text)',
    lineHeight: 1.55,
    maxHeight: 'min(400px, 36vh)',
    overflowY: 'auto' as const,
  } as CSSProperties,
};

const styles: Record<string, CSSProperties> = {
  message: {
    display: 'flex',
    gap: 12,
    animation: 'messageIn 0.4s cubic-bezier(0.16,1,0.3,1)',
    maxWidth: '85%',
  },
  messageDock: {
    maxWidth: '94%',
  },
  user: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  assistant: { alignSelf: 'flex-start' },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    fontWeight: 600,
    flexShrink: 0,
  },
  avatarDock: { width: 32, height: 32, borderRadius: 10, fontSize: 12 },
  userAvatar: { background: 'linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)', color: '#3730a3' },
  userAvatarDock: {
    background: 'linear-gradient(145deg, #0f766e 0%, #0d9488 100%)',
    color: '#ecfdf5',
  },
  aiAvatar: { background: 'linear-gradient(135deg, #2468f2 0%, #5b9cff 100%)', color: '#fff' },
  aiAvatarDock: {
    background: 'linear-gradient(145deg, #e8f0ff 0%, #dbeafe 100%)',
    color: '#1e40af',
  },
  content: { display: 'flex', flexDirection: 'column', gap: 6 },
  bubble: {
    padding: '14px 18px',
    borderRadius: 16,
    fontSize: 14,
    lineHeight: 1.65,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  userBubble: {
    background: 'linear-gradient(135deg, #eff6ff 0%, #e0ecff 100%)',
    border: '1px solid rgba(36,104,242,0.18)',
    borderTopRightRadius: 4,
  },
  userBubbleDock: {
    background: 'linear-gradient(160deg, rgba(13,148,136,0.28) 0%, rgba(15,118,110,0.18) 100%)',
    border: '1px solid rgba(45,212,191,0.35)',
    borderTopRightRadius: 6,
  },
  aiBubble: {
    background: 'var(--fc-bg-raised)',
    border: '1px solid var(--fc-border-strong)',
    borderTopLeftRadius: 4,
  },
  aiBubbleDock: {
    background: 'var(--fc-bg-raised)',
    border: '1px solid var(--fc-border-strong)',
    borderTopLeftRadius: 6,
  },
  text: { color: 'var(--fc-text)' },
  inlineCode: {
    background: 'var(--fc-bg-muted)',
    padding: '2px 6px',
    borderRadius: 4,
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 13,
  },
  link: { color: 'var(--fc-primary)', textDecoration: 'underline' },
  table: {
    borderCollapse: 'collapse',
    width: '100%',
    fontSize: 13,
    margin: '8px 0',
  },
  blockquote: {
    borderLeft: '3px solid rgba(36,104,242,0.35)',
    paddingLeft: 12,
    margin: '8px 0',
    color: 'var(--fc-text-muted)',
  },
  time: { fontSize: 11, color: 'var(--fc-text-dim)', fontFamily: 'JetBrains Mono, monospace', padding: '0 4px' },
};

const copyBtn: CSSProperties = {
  position: 'absolute',
  top: 10,
  right: 10,
  padding: '4px 8px',
  background: 'var(--fc-bg-muted)',
  border: '1px solid var(--fc-border-strong)',
  borderRadius: 6,
  color: 'var(--fc-text-muted)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.15s ease',
  zIndex: 1,
};

const copyBtnSuccess: CSSProperties = {
  color: '#4ade80',
  borderColor: 'rgba(74,222,128,0.3)',
  background: 'rgba(74,222,128,0.08)',
};
