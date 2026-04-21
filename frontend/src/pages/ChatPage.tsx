import { Header } from '../components/Header';
import { ChatContainer } from '../components/ChatContainer';
import { InputArea } from '../components/InputArea';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useWebSocket } from '../hooks/useWebSocket';
import { GLOBAL_CSS } from '../styles/globalCss';

// 通过 Vite 同源代理连接后端 WebSocket，绕过 CORS
const WS_URL = `ws://${window.location.host}/ws/chat`;

export default function ChatPage() {
  const { messages, status, isTyping, sendError, send, clearMessages, reconnect } = useWebSocket(WS_URL);

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <div style={styles.app}>
        <div style={styles.inner} className="finclaw-inner">
          <Header
            mode="chat"
            status={status}
            onNewChat={clearMessages}
            messageCount={messages.length}
            onReconnect={reconnect}
          />
          {sendError && (
            <div style={styles.errorBanner}>
              <span style={styles.errorText}>{sendError}</span>
              <button type="button" style={styles.reconnectBtn} onClick={reconnect}>
                Reconnect
              </button>
            </div>
          )}
          <ErrorBoundary>
            <ChatContainer messages={messages} isTyping={isTyping} onClear={clearMessages} />
          </ErrorBoundary>
          <InputArea onSend={send} disabled={status !== 'connected'} />
        </div>
      </div>
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  app: {
    display: 'flex',
    justifyContent: 'center',
    height: '100vh',
    background: '#0c0c0e',
  },
  inner: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    maxWidth: 900,
    padding: '0 20px',
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    background: 'rgba(248,113,113,0.1)',
    border: '1px solid rgba(248,113,113,0.3)',
    borderRadius: 10,
    marginTop: 12,
    animation: 'fadeIn 0.3s ease',
  },
  errorText: { color: '#f87171', fontSize: 13 },
  reconnectBtn: {
    padding: '5px 14px',
    background: 'rgba(248,113,113,0.15)',
    border: '1px solid rgba(248,113,113,0.4)',
    borderRadius: 6,
    color: '#f87171',
    fontSize: 12,
    cursor: 'pointer',
    fontFamily: 'JetBrains Mono, monospace',
    transition: 'all 0.2s ease',
  },
};
