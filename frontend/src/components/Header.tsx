import type { ConnectionStatus } from '../types';

interface HeaderProps {
  status: ConnectionStatus;
}

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  idle: 'Disconnected',
  connecting: 'Connecting...',
  connected: 'Connected',
  error: 'Connection Error',
};

export function Header({ status }: HeaderProps) {
  return (
    <header style={styles.header}>
      <div style={styles.headerLeft}>
        <div style={styles.logo}>F</div>
        <div>
          <div style={styles.headerTitle}>Finclaw</div>
          <div style={styles.headerSubtitle}>AI Financial Assistant</div>
        </div>
      </div>
      <div style={styles.connectionStatus}>
        <span style={{ ...styles.statusDot, ...statusDotStyle(status) }} />
        <span style={styles.statusText}>{STATUS_LABEL[status]}</span>
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
};
