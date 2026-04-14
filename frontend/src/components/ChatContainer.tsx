import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../types';
import { MessageBubble } from './MessageBubble';

interface ChatContainerProps {
  messages: ChatMessage[];
  isTyping: boolean;
  onClear: () => void;
}

export function ChatContainer({ messages, isTyping, onClear }: ChatContainerProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  if (messages.length === 0) {
    return (
      <div style={styles.welcome}>
        <div style={styles.welcomeIcon}>💼</div>
        <div style={styles.welcomeTitle}>Welcome to Finclaw</div>
        <div style={styles.welcomeSubtitle}>
          Your AI-powered financial assistant. Ask questions about markets, analysis, or any financial topic.
        </div>
      </div>
    );
  }

  const hasUserMessages = messages.some((m) => m.role === 'user');

  return (
    <div style={styles.container}>
      {hasUserMessages && (
        <div style={styles.clearRow}>
          <button style={styles.clearBtn} onClick={onClear}>
            Clear conversation
          </button>
        </div>
      )}
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {isTyping && (
        <div style={styles.typingRow}>
          <div style={styles.typingAvatar}>F</div>
          <div style={styles.typingDots}>
            <span style={{ ...styles.typingDot, animationDelay: '0s' }} />
            <span style={{ ...styles.typingDot, animationDelay: '0.2s' }} />
            <span style={{ ...styles.typingDot, animationDelay: '0.4s' }} />
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  welcome: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
    animation: 'fadeIn 0.6s ease',
  },
  welcomeIcon: {
    width: 64,
    height: 64,
    background: 'linear-gradient(135deg, #c9a84c 0%, #e8b84a 100%)',
    borderRadius: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 28,
    boxShadow: '0 0 20px rgba(201,168,76,0.15)',
    marginBottom: 20,
    animation: 'float 3s ease-in-out infinite',
  },
  welcomeTitle: { fontSize: 24, fontWeight: 500, marginBottom: 8 },
  welcomeSubtitle: {
    color: '#8a8a8e',
    fontSize: 14,
    maxWidth: 400,
    textAlign: 'center',
    lineHeight: 1.6,
  },
  container: {
    flex: 1,
    overflowY: 'auto',
    padding: '24px 0',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  clearRow: { display: 'flex', justifyContent: 'center', padding: '4px 0' },
  clearBtn: {
    fontSize: 11,
    color: '#5a5a5e',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'JetBrains Mono, monospace',
    padding: '4px 8px',
    borderRadius: 4,
    transition: 'color 0.2s ease',
  },
  typingRow: { display: 'flex', gap: 12, alignItems: 'center' },
  typingAvatar: {
    width: 36,
    height: 36,
    borderRadius: 8,
    background: 'linear-gradient(135deg, #c9a84c 0%, #e8b84a 100%)',
    color: '#0c0c0e',
    fontWeight: 600,
    fontSize: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  typingDots: {
    display: 'flex',
    gap: 4,
    padding: '14px 18px',
    background: 'rgba(201,168,76,0.08)',
    border: '1px solid rgba(201,168,76,0.25)',
    borderRadius: 16,
    borderTopLeftRadius: 4,
  },
  typingDot: {
    width: 8,
    height: 8,
    background: 'rgba(201,168,76,0.6)',
    borderRadius: '50%',
    animation: 'typingBounce 1.4s ease-in-out infinite',
  },
};
