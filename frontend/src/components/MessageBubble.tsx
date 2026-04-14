import { useState, useCallback } from 'react';
import type { ChatMessage } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface MessageBubbleProps {
  message: ChatMessage;
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

  return (
    <div style={{ ...styles.message, ...(isUser ? styles.user : styles.assistant) }} className="finclaw-message">
      <div style={{ ...styles.avatar, ...(isUser ? styles.userAvatar : styles.aiAvatar) }}>
        {isUser ? 'U' : 'F'}
      </div>
      <div style={styles.content}>
        <div style={{ ...styles.bubble, ...(isUser ? styles.userBubble : styles.aiBubble) }} className="finclaw-bubble">
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
  userAvatar: { background: 'linear-gradient(135deg, #4a4a55 0%, #3a3a42 100%)', color: '#8a8a8e' },
  aiAvatar: { background: 'linear-gradient(135deg, #c9a84c 0%, #e8b84a 100%)', color: '#0c0c0e' },
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
    background: 'linear-gradient(135deg, #2d2d35 0%, #1f1f26 100%)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderTopRightRadius: 4,
  },
  aiBubble: {
    background: 'rgba(201,168,76,0.08)',
    border: '1px solid rgba(201,168,76,0.25)',
    borderTopLeftRadius: 4,
  },
  text: { color: '#f0f0f2' },
  inlineCode: {
    background: 'rgba(255,255,255,0.08)',
    padding: '2px 6px',
    borderRadius: 4,
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 13,
  },
  link: { color: '#c9a84c', textDecoration: 'underline' },
  table: {
    borderCollapse: 'collapse',
    width: '100%',
    fontSize: 13,
    margin: '8px 0',
  },
  blockquote: {
    borderLeft: '3px solid rgba(201,168,76,0.4)',
    paddingLeft: 12,
    margin: '8px 0',
    color: '#8a8a8e',
  },
  time: { fontSize: 11, color: '#5a5a5e', fontFamily: 'JetBrains Mono, monospace', padding: '0 4px' },
};

const copyBtn: React.CSSProperties = {
  position: 'absolute',
  top: 10,
  right: 10,
  padding: '4px 8px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 6,
  color: '#8a8a8e',
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
