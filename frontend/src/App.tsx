import { Header } from './components/Header';
import { ChatContainer } from './components/ChatContainer';
import { InputArea } from './components/InputArea';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useWebSocket } from './hooks/useWebSocket';

// 通过 Vite 同源代理连接后端 WebSocket，绕过 CORS
const WS_URL = `ws://${window.location.host}/ws/chat`;

export default function App() {
  const { messages, status, isTyping, sendError, send, clearMessages, reconnect } = useWebSocket(WS_URL);

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <div style={styles.app}>
        <div style={styles.inner} className="finclaw-inner">
          <Header status={status} onNewChat={clearMessages} messageCount={messages.length} onReconnect={reconnect} />
          {sendError && (
            <div style={styles.errorBanner}>
              <span style={styles.errorText}>{sendError}</span>
              <button style={styles.reconnectBtn} onClick={reconnect}>Reconnect</button>
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

const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Noto+Sans+SC:wght@300;400;500;600&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body, #root {
  height: 100%;
  font-family: 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif;
  background: #0c0c0e;
  color: #f0f0f2;
}

::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #222228; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #5a5a5e; }

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes messageIn {
  from { opacity: 0; transform: translateY(12px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

@keyframes typingBounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-6px); opacity: 1; }
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.8); }
}

@media (max-width: 640px) {
  .finclaw-inner {
    padding: 0 12px !important;
  }

  .finclaw-header {
    padding: 14px 0 !important;
  }

  .finclaw-message {
    max-width: 92% !important;
  }

  .finclaw-bubble {
    font-size: 13px !important;
    padding: 12px 14px !important;
  }

  .finclaw-input {
    border-radius: 16px !important;
    padding: 4px 4px 4px 14px !important;
  }
}
`;
