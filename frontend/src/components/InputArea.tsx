import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent } from 'react';
import {
  ChatSlashHints,
  handleSlashInputKeyDown,
} from '@/components/ChatSlashHints';

interface InputAreaProps {
  onSend: (content: string) => void;
  disabled: boolean;
  placeholder?: string;
  /** 侧栏等场景：去掉快捷键说明、收紧留白 */
  compact?: boolean;
}

export function InputArea({ onSend, disabled, placeholder, compact }: InputAreaProps) {
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
    handleSlashInputKeyDown(e, value, {
      onAutocomplete: (command) => setValue(command),
      onSend: handleSend,
    });
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
      <div style={{ ...wrapperStyle, position: 'relative', overflow: 'visible' }} className="finclaw-input">
        <ChatSlashHints value={value} onPick={(command) => setValue(command)} />
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
          type="submit"
          style={btnStyle}
          disabled={disabled || !value.trim()}
          aria-label="发送"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
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
};
