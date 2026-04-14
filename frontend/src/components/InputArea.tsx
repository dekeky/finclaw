import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent } from 'react';

interface InputAreaProps {
  onSend: (content: string) => void;
  disabled: boolean;
}

export function InputArea({ onSend, disabled }: InputAreaProps) {
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

  return (
    <form style={styles.form} onSubmit={onFormSubmit}>
      <div style={styles.wrapper} className="finclaw-input">
        <textarea
          ref={textareaRef}
          style={styles.textarea}
          placeholder="Ask me anything about finance..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          disabled={disabled}
        />
        <button type="submit" style={styles.button} disabled={disabled || !value.trim()}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
      <div style={styles.hint}>
        <kbd style={styles.kbd}>Enter</kbd> to send · <kbd style={styles.kbd}>Shift</kbd>+<kbd style={styles.kbd}>Enter</kbd> for new line
      </div>
    </form>
  );
}

const styles: Record<string, React.CSSProperties> = {
  form: { padding: '20px 0', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 },
  wrapper: {
    display: 'flex',
    gap: 12,
    alignItems: 'flex-end',
    background: '#131316',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 24,
    padding: '6px 6px 6px 20px',
  },
  textarea: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#f0f0f2',
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
    background: 'linear-gradient(135deg, #c9a84c 0%, #e8b84a 100%)',
    color: '#0c0c0e',
    fontSize: 18,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    transition: 'all 0.3s ease',
  },
  hint: {
    display: 'flex',
    justifyContent: 'center',
    marginTop: 12,
    fontSize: 11,
    color: '#5a5a5e',
    fontFamily: 'JetBrains Mono, monospace',
  },
  kbd: {
    background: '#1a1a1f',
    padding: '2px 6px',
    borderRadius: 4,
    border: '1px solid rgba(255,255,255,0.06)',
    margin: '0 2px',
  },
};
