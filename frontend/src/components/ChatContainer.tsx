import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../types';
import { MessageBubble } from './MessageBubble';

const DOCK_QUICK_PROMPTS = [
  '用要点列表总结我已选文章',
  '这些资讯里有没有明显风险或矛盾？',
  '结合链接原文，给出简要解读',
  '还有哪些角度值得深挖？',
];

interface ChatContainerProps {
  messages: ChatMessage[];
  isTyping: boolean;
  onClear: () => void;
  /** 右侧浮窗里用更轻量的欢迎文案 */
  variant?: 'default' | 'dock';
  /** 侧栏空态：元宝式快捷提问 */
  onQuickPrompt?: (text: string) => void;
  quickPrompts?: string[];
}

export function ChatContainer({
  messages,
  isTyping,
  onClear,
  variant = 'default',
  onQuickPrompt,
  quickPrompts = DOCK_QUICK_PROMPTS,
}: ChatContainerProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  if (messages.length === 0) {
    if (variant === 'dock') {
      return (
        <div style={styles.welcomeDock}>
          <div style={styles.welcomeDockIcon} aria-hidden>
            ✨
          </div>
          <div style={styles.welcomeDockTitle}>想问点什么？</div>
          <div style={styles.welcomeDockSub}>
            可直接输入问题；在资讯列表勾选文章后提问，会自动带上原文链接。也可点下方试试常见问法。
          </div>
          {onQuickPrompt && quickPrompts.length > 0 && (
            <div style={styles.quickRow}>
              {quickPrompts.map((q) => (
                <button key={q} type="button" className="finclaw-quick-chip" onClick={() => onQuickPrompt(q)}>
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }
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
      {hasUserMessages && variant !== 'dock' && (
        <div style={styles.clearRow}>
          <button style={styles.clearBtn} onClick={onClear}>
            Clear conversation
          </button>
        </div>
      )}
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} variant={variant === 'dock' ? 'dock' : 'default'} />
      ))}
      {isTyping && (
        <div style={styles.typingRow} role="status" aria-live="polite" aria-label="助手正在回复">
          <div
            style={{
              ...styles.typingAvatar,
              ...(variant === 'dock' ? styles.typingAvatarDock : {}),
            }}
          >
            {variant === 'dock' ? 'AI' : 'F'}
          </div>
          <div
            style={{
              ...styles.typingBubble,
              ...(variant === 'dock' ? styles.typingBubbleDock : {}),
            }}
          >
            <span
              style={{
                ...styles.thinkingLabel,
                ...(variant === 'dock' ? styles.thinkingLabelDock : {}),
              }}
            >
              正在思考…
            </span>
            <div style={styles.typingDotsInline}>
              <span
                style={{
                  ...styles.typingDot,
                  ...(variant === 'dock' ? styles.typingDotDock : {}),
                  animationDelay: '0s',
                }}
              />
              <span
                style={{
                  ...styles.typingDot,
                  ...(variant === 'dock' ? styles.typingDotDock : {}),
                  animationDelay: '0.2s',
                }}
              />
              <span
                style={{
                  ...styles.typingDot,
                  ...(variant === 'dock' ? styles.typingDotDock : {}),
                  animationDelay: '0.4s',
                }}
              />
            </div>
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
    background: 'linear-gradient(135deg, #2468f2 0%, #5b9cff 100%)',
    borderRadius: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 28,
    color: '#fff',
    boxShadow: '0 8px 24px rgba(36,104,242,0.25)',
    marginBottom: 20,
    animation: 'float 3s ease-in-out infinite',
  },
  welcomeTitle: { fontSize: 24, fontWeight: 500, marginBottom: 8, color: 'var(--fc-text)' },
  welcomeSubtitle: {
    color: 'var(--fc-text-muted)',
    fontSize: 14,
    maxWidth: 400,
    textAlign: 'center',
    lineHeight: 1.6,
  },
  container: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px 0 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    scrollBehavior: 'smooth',
  },
  clearRow: { display: 'flex', justifyContent: 'center', padding: '4px 0' },
  clearBtn: {
    fontSize: 11,
    color: 'var(--fc-text-muted)',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'JetBrains Mono, monospace',
    padding: '4px 8px',
    borderRadius: 4,
    transition: 'color 0.2s ease',
  },
  typingRow: { display: 'flex', gap: 12, alignItems: 'center' },
  thinkingLabel: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--fc-text-secondary)',
    letterSpacing: '0.02em',
    flexShrink: 0,
  },
  thinkingLabelDock: {
    fontSize: 12,
    color: 'var(--fc-text-muted)',
  },
  typingBubble: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: '12px 16px',
    background: 'var(--fc-bg-panel)',
    border: '1px solid var(--fc-border-strong)',
    borderRadius: 16,
    borderTopLeftRadius: 4,
    flexWrap: 'wrap',
  },
  typingBubbleDock: {
    background: 'var(--fc-bg-raised)',
    border: '1px solid var(--fc-border-strong)',
    borderTopLeftRadius: 6,
    padding: '10px 14px',
    gap: 8,
  },
  typingDotsInline: {
    display: 'flex',
    gap: 4,
    alignItems: 'center',
  },
  typingAvatar: {
    width: 36,
    height: 36,
    borderRadius: 8,
    background: 'linear-gradient(135deg, #2468f2 0%, #5b9cff 100%)',
    color: '#fff',
    fontWeight: 600,
    fontSize: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  typingAvatarDock: {
    width: 32,
    height: 32,
    borderRadius: 10,
    fontSize: 12,
    background: 'linear-gradient(145deg, #e8f0ff 0%, #dbeafe 100%)',
    color: '#1e40af',
  },
  typingDot: {
    width: 8,
    height: 8,
    background: 'rgba(36,104,242,0.45)',
    borderRadius: '50%',
    animation: 'typingBounce 1.4s ease-in-out infinite',
  },
  typingDotDock: {
    background: 'rgba(45,212,191,0.55)',
  },
  welcomeDock: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 16px',
    textAlign: 'center',
    animation: 'fadeIn 0.45s ease',
  },
  welcomeDockIcon: {
    fontSize: 36,
    marginBottom: 12,
    animation: 'float 3s ease-in-out infinite',
  },
  welcomeDockTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--fc-text)',
    marginBottom: 10,
  },
  welcomeDockSub: {
    fontSize: 13,
    color: 'var(--fc-text-muted)',
    lineHeight: 1.55,
    maxWidth: 320,
    marginBottom: 4,
  },
  quickRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginTop: 18,
    maxWidth: 340,
  },
};
