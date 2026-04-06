export function TypingIndicator() {
  return (
    <div style={styles.wrapper}>
      <div style={styles.avatar}>F</div>
      <div style={styles.dots}>
        <span style={{ ...styles.dot, animationDelay: '0s' }} />
        <span style={{ ...styles.dot, animationDelay: '0.2s' }} />
        <span style={{ ...styles.dot, animationDelay: '0.4s' }} />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { display: 'flex', gap: 12, alignItems: 'center' },
  avatar: {
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
  dots: {
    display: 'flex',
    gap: 4,
    padding: '14px 18px',
    background: 'rgba(201,168,76,0.08)',
    border: '1px solid rgba(201,168,76,0.25)',
    borderRadius: 16,
    borderTopLeftRadius: 4,
  },
  dot: {
    width: 8,
    height: 8,
    background: 'rgba(201,168,76,0.6)',
    borderRadius: '50%',
    animation: 'typingBounce 1.4s ease-in-out infinite',
  },
};
