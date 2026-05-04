import { Link } from 'react-router-dom';
import type { ConnectionStatus } from '../types';
import { FinclawMark } from './FinclawMark';

export type HeaderProps =
  | {
      mode: 'chat';
      /** 为 false 时不显示左侧 Logo（与侧栏并存时使用） */
      showBranding?: boolean;
      status: ConnectionStatus;
      onNewChat: () => void;
      messageCount: number;
      onReconnect: () => void;
    }
  | {
      mode: 'rss';
      showBranding?: boolean;
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
  const showBrand = props.showBranding !== false;

  return (
    <header style={styles.header} className="finclaw-header">
      <div style={styles.headerLeft}>
        {showBrand && (
          <Link to="/" style={styles.logoLink} aria-label="Finclaw 首页">
            <div style={styles.logo}>
              <FinclawMark variant="mark" size={26} decorative />
            </div>
          </Link>
        )}
        <div style={styles.titleBlock}>
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
    gap: 16,
    padding: '16px var(--fc-page-pad-x) 16px var(--fc-page-pad-x)',
    borderBottom: '1px solid var(--fc-border)',
    flexShrink: 0,
    background: 'var(--fc-bg-raised)',
    boxShadow: '0 1px 0 rgba(15, 23, 42, 0.04)',
  },
  logoLink: { textDecoration: 'none', color: 'inherit', display: 'flex', flexShrink: 0 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', minWidth: 0, flex: 1 },
  titleBlock: { minWidth: 0 },
  right: { display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 },
  newChatBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 14px',
    background: 'var(--fc-primary-soft)',
    border: '1px solid rgba(36,104,242,0.22)',
    borderRadius: 20,
    color: 'var(--fc-primary)',
    fontSize: 12,
    fontFamily: 'var(--fc-font-mono)',
    cursor: 'pointer',
    transition: 'background 0.2s ease, border-color 0.2s ease',
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    background: 'linear-gradient(145deg, #fff9e6 0%, #ffe8b8 100%)',
    border: '1px solid rgba(234, 179, 8, 0.28)',
    boxShadow: '0 2px 12px rgba(234, 179, 8, 0.12)',
  },
  headerTitle: {
    fontSize: 'var(--fc-type-title)',
    fontWeight: 650,
    letterSpacing: '-0.025em',
    color: 'var(--fc-text)',
    lineHeight: 1.25,
  },
  headerSubtitle: {
    fontSize: 'var(--fc-type-caption)',
    color: 'var(--fc-text-muted)',
    fontFamily: 'var(--fc-font-mono)',
    marginTop: 3,
    lineHeight: 1.4,
  },
  connectionStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    background: 'var(--fc-bg-raised)',
    borderRadius: 20,
    border: '1px solid var(--fc-border)',
    fontSize: 12,
    fontFamily: 'var(--fc-font-mono)',
  },
  statusDot: { width: 8, height: 8, borderRadius: '50%', transition: 'all 0.3s ease' },
  statusText: { color: 'var(--fc-text-muted)' },
  reconnectBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 14px',
    background: 'rgba(248,113,113,0.1)',
    border: '1px solid rgba(248,113,113,0.32)',
    borderRadius: 20,
    color: 'var(--fc-danger)',
    fontSize: 12,
    fontFamily: 'var(--fc-font-mono)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  refreshBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 14px',
    background: 'var(--fc-primary-soft)',
    border: '1px solid rgba(36,104,242,0.22)',
    borderRadius: 20,
    color: 'var(--fc-primary)',
    fontSize: 12,
    fontFamily: 'var(--fc-font-mono)',
    cursor: 'pointer',
    transition: 'background 0.15s ease, border-color 0.15s ease',
  },
  rssLoading: {
    fontSize: 12,
    color: 'var(--fc-text-muted)',
    fontFamily: 'var(--fc-font-mono)',
  },
};
