import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent } from 'react';

interface InputAreaProps {
  onSend: (content: string) => void;
  disabled: boolean;
  placeholder?: string;
  /** 侧栏等场景：去掉快捷键说明、收紧留白 */
  compact?: boolean;
  /** Agent 正在生成回复时显示停止按钮 */
  isGenerating?: boolean;
  onStop?: () => void;
}

export function InputArea({ onSend, disabled, placeholder, compact, isGenerating, onStop }: InputAreaProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // auto-resize
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, [value]);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    textareaRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const onFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleSend();
  };

  const formStyle = compact ? { ...styles.form, ...styles.formCompact } : styles.form;
  const wrapperStyle = compact ? { ...styles.wrapper, ...styles.wrapperCompact } : styles.wrapper;
  const btnStyle = compact ? { ...styles.button, ...styles.buttonCompact, ...styles.buttonDock } : styles.button;

  return (
    <form style={formStyle} onSubmit={onFormSubmit}>
      <div style={wrapperStyle} className="finclaw-input">
        <textarea
          ref={textareaRef}
          style={styles.textarea}
          placeholder={placeholder ?? 'Ask me anything about finance...'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          disabled={disabled}
        />
        <button
          type={isGenerating ? 'button' : 'submit'}
          style={{
            ...btnStyle,
            ...(isGenerating
              ? { background: 'var(--fc-text-muted)', color: 'var(--fc-bg-panel)' }
              : {}),
          }}
          disabled={disabled || (!isGenerating && !value.trim())}
          onClick={isGenerating ? onStop : undefined}
          aria-label={isGenerating ? '停止生成' : '发送'}
        >
          {isGenerating ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="1.5" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>
      {!compact && (
        <div style={styles.hint}>
          <kbd style={styles.kbd}>Enter</kbd> to send · <kbd style={styles.kbd}>Shift</kbd>+<kbd style={styles.kbd}>Enter</kbd> for new line
        </div>
      )}
    </form>
  );
}

const styles: Record<string, React.CSSProperties> = {
  form: { padding: '20px 0', borderTop: '1px solid var(--fc-border)', flexShrink: 0 },
  formCompact: {
    padding: '12px 0 16px',
    borderTop: '1px solid var(--fc-border)',
  },
  wrapper: {
    display: 'flex',
    gap: 12,
    alignItems: 'flex-end',
    background: 'var(--fc-bg-raised)',
    border: '1px solid var(--fc-border-strong)',
    borderRadius: 24,
    padding: '6px 6px 6px 20px',
    boxShadow: '0 2px 12px rgba(15, 23, 42, 0.04)',
  },
  wrapperCompact: {
    borderRadius: 22,
    padding: '5px 5px 5px 16px',
    background: 'var(--fc-bg-panel)',
    border: '1px solid var(--fc-border)',
    boxShadow: '0 2px 16px rgba(15, 23, 42, 0.06)',
  },
  textarea: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--fc-text)',
    fontSize: 14,
    fontFamily: 'inherit',
    lineHeight: 1.5,
    resize: 'none',
    minHeight: 24,
    maxHeight: 120,
    padding: '8px 0',
  },
  button: {
    width: 44,
    height: 44,
    border: 'none',
    borderRadius: 12,
    background: 'linear-gradient(135deg, #2468f2 0%, #5b9cff 100%)',
    color: '#ffffff',
    fontSize: 18,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'all 0.3s ease',
  },
  buttonDock: {
    background: 'linear-gradient(135deg, #14b8a6 0%, #0d9488 55%, #0f766e 100%)',
    color: '#ecfdf5',
  },
  buttonCompact: {
    width: 40,
    height: 40,
    borderRadius: 11,
  },
  hint: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: 12,
    fontSize: 11,
    color: 'var(--fc-text-muted)',
    fontFamily: 'JetBrains Mono, monospace',
  },
  kbd: {
    background: 'var(--fc-bg-muted)',
    padding: '2px 6px',
    borderRadius: 4,
    border: '1px solid var(--fc-border-strong)',
    margin: '0 2px',
  },
};
