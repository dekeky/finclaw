import { Link } from 'react-router-dom';
import type { ConnectionStatus } from '../types';

export type HeaderProps =
  | {
      mode: 'chat';
      status: ConnectionStatus;
      onNewChat: () => void;
      messageCount: number;
      onReconnect: () => void;
    }
  | {
      mode: 'rss';
      rssRefreshing?: boolean;
      onRssRefresh?: () => void;
    };

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  idle: 'Disconnected',
  connecting: 'Connecting...',
  connected: 'Connected',
  error: 'Connection Error',
};

export function Header(props: HeaderProps) {
  const isRss = props.mode === 'rss';

  return (
    <header style={styles.header} className="finclaw-header">
      <div style={styles.headerLeft}>
        <Link to="/" style={styles.logoLink} aria-label="Finclaw 首页">
          <div style={styles.logo}>F</div>
        </Link>
        <div>
          <div style={styles.headerTitle}>Finclaw</div>
          <div style={styles.headerSubtitle}>
            {isRss ? '金融资讯 · AI Reader' : 'AI Financial Assistant'}
          </div>
        </div>
      </div>
      <div style={styles.right}>
        {isRss ? (
          <>
            {props.rssRefreshing && <span style={styles.rssLoading}>同步中…</span>}
            <button
              type="button"
              style={styles.refreshBtn}
              onClick={props.onRssRefresh}
              disabled={props.rssRefreshing}
              title="重新拉取订阅列表与当前分组"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M23 4v6h-6" />
                <path d="M1 20v-6h6" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              刷新
            </button>
          </>
        ) : (
          <>
            {props.messageCount > 0 && (
              <button style={styles.newChatBtn} onClick={props.onNewChat} title="New conversation">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                New Chat
              </button>
            )}
            <div style={styles.connectionStatus}>
              <span style={{ ...styles.statusDot, ...statusDotStyle(props.status) }} />
              <span style={styles.statusText}>{STATUS_LABEL[props.status]}</span>
            </div>
            {(props.status === 'error' || props.status === 'idle') && (
              <button style={styles.reconnectBtn} onClick={props.onReconnect} title="Reconnect">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 .49-3.51" />
                </svg>
                Reconnect
              </button>
            )}
          </>
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
    padding: '20px 24px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    flexShrink: 0,
  },
  logoLink: { textDecoration: 'none', color: 'inherit', display: 'flex' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minWidth: 0 },
  right: { display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 },
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
  refreshBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 14px',
    background: 'rgba(91,155,213,0.1)',
    border: '1px solid rgba(91,155,213,0.3)',
    borderRadius: 20,
    color: '#7ab8e8',
    fontSize: 12,
    fontFamily: 'JetBrains Mono, monospace',
    cursor: 'pointer',
  },
  rssLoading: {
    fontSize: 12,
    color: '#6a6a72',
    fontFamily: 'JetBrains Mono, monospace',
  },
};
