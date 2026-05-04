import { useState, useCallback } from 'react';
import type { ChatMessage } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface MessageBubbleProps {
  message: ChatMessage;
  /** 侧栏会话：更接近元宝等产品 — 用户偏青绿、助手偏中性底 */
  variant?: 'default' | 'dock';
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

  return (
    <div
      style={{ ...styles.message, ...(dock ? styles.messageDock : {}), ...(isUser ? styles.user : styles.assistant) }}
      className="finclaw-message"
    >
      <div style={{ ...styles.avatar, ...avatarSize, ...(isUser ? userAv : aiAv) }}>
        {isUser ? '我' : 'AI'}
      </div>
      <div style={styles.content}>
        <div style={{ ...styles.bubble, ...(isUser ? userBu : aiBu) }} className="finclaw-bubble">
          {isUser ? (
            <span style={styles.text}>{message.content}</span>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ node, className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '');
                  const code = String(children).replace(/\n$/, '');
                  const codeId = `${message.id}-${match ? match[1] : 'inline'}`;
                  if (match) {
                    return (
                      <div style={{ position: 'relative', margin: '10px 0' }}>
                        <button
                          style={{
                            ...copyBtn,
                            ...(copiedId === codeId ? copyBtnSuccess : {}),
                          }}
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
              {message.content}
            </ReactMarkdown>
          )}
        </div>
        <div style={{ ...styles.time, ...(isUser ? { textAlign: 'right' } : {}) }}>{time}</div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
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

const copyBtn: React.CSSProperties = {
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

const copyBtnSuccess: React.CSSProperties = {
  color: '#4ade80',
  borderColor: 'rgba(74,222,128,0.3)',
  background: 'rgba(74,222,128,0.08)',
};
