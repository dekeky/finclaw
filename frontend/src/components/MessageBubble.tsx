import type { ChatMessage } from '../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const time = message.timestamp.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const isUser = message.role === 'user';

  return (
    <div style={{ ...styles.message, ...(isUser ? styles.user : styles.assistant) }}>
      <div style={{ ...styles.avatar, ...(isUser ? styles.userAvatar : styles.aiAvatar) }}>
        {isUser ? 'U' : 'F'}
      </div>
      <div style={styles.content}>
        <div style={{ ...styles.bubble, ...(isUser ? styles.userBubble : styles.aiBubble) }}>
          {isUser ? (
            <span style={styles.text}>{message.content}</span>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ node, className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '');
                  const code = String(children).replace(/\n$/, '');
                  if (match) {
                    return (
                      <SyntaxHighlighter
                        style={oneDark}
                        language={match[1]}
                        PreTag="div"
                        customStyle={{
                          margin: '10px 0',
                          borderRadius: 8,
                          fontSize: 13,
                          background: '#1a1a2e',
                        }}
                        {...(props as object)}
                      >
                        {code}
                      </SyntaxHighlighter>
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
