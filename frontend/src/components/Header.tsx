import type { ConnectionStatus } from '../types';

interface HeaderProps {
  status: ConnectionStatus;
  onNewChat: () => void;
  messageCount: number;
  onReconnect: () => void;
}

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  idle: 'Disconnected',
  connecting: 'Connecting...',
  connected: 'Connected',
  error: 'Connection Error',
};

export function Header({ status, onNewChat, messageCount, onReconnect }: HeaderProps) {
  return (
    <header style={styles.header} className="finclaw-header">
      <div style={styles.headerLeft}>
        <div style={styles.logo}>F</div>
        <div>
          <div style={styles.headerTitle}>Finclaw</div>
          <div style={styles.headerSubtitle}>AI Financial Assistant</div>
        </div>
      </div>
      <div style={styles.right}>
        {messageCount > 0 && (
          <button style={styles.newChatBtn} onClick={onNewChat} title="New conversation">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New Chat
          </button>
        )}
        <div style={styles.connectionStatus}>
          <span style={{ ...styles.statusDot, ...statusDotStyle(status) }} />
          <span style={styles.statusText}>{STATUS_LABEL[status]}</span>
        </div>
        {(status === 'error' || status === 'idle') && (
          <button style={styles.reconnectBtn} onClick={onReconnect} title="Reconnect">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 .49-3.51" />
            </svg>
            Reconnect
          </button>
        )}
      </div>
    </header>
  );
}

function statusDotStyle(status: ConnectionStatus): React.CSSProperties {
  switch (status) {
    case 'connected':
      return { background: '#4ade80', boxShadow: '0 0 8px rgba(74,222,128,0.5)' };
    case 'connecting':
      return { background: '#c9a84c', animation: 'pulse 1.5s ease-in-out infinite' };
    case 'error':
      return { background: '#f87171', boxShadow: '0 0 8px rgba(248,113,113,0.5)' };
    default:
      return { background: '#5a5a5e' };
  }
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 0',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  right: { display: 'flex', alignItems: 'center', gap: 12 },
  newChatBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 14px',
    background: 'rgba(201,168,76,0.08)',
    border: '1px solid rgba(201,168,76,0.25)',
    borderRadius: 20,
    color: '#c9a84c',
    fontSize: 12,
    fontFamily: 'JetBrains Mono, monospace',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  logo: {
    width: 36,
    height: 36,
    background: 'linear-gradient(135deg, #c9a84c 0%, #e8b84a 100%)',
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 600,
    fontSize: 18,
    color: '#0c0c0e',
    boxShadow: '0 0 20px rgba(201,168,76,0.15)',
  },
  headerTitle: { fontSize: 18, fontWeight: 500, letterSpacing: '-0.02em' },
  headerSubtitle: { fontSize: 12, color: '#5a5a5e', fontFamily: 'JetBrains Mono, monospace' },
  connectionStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    background: '#1a1a1f',
    borderRadius: 20,
    fontSize: 12,
    fontFamily: 'JetBrains Mono, monospace',
  },
  statusDot: { width: 8, height: 8, borderRadius: '50%', transition: 'all 0.3s ease' },
  statusText: { color: '#8a8a8e' },
  reconnectBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 14px',
    background: 'rgba(248,113,113,0.1)',
    border: '1px solid rgba(248,113,113,0.3)',
    borderRadius: 20,
    color: '#f87171',
    fontSize: 12,
    fontFamily: 'JetBrains Mono, monospace',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
};
