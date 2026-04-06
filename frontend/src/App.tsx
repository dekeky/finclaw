import { useState, useCallback } from 'react';
import { Header } from './components/Header';
import { ChatContainer } from './components/ChatContainer';
import { InputArea } from './components/InputArea';
import { useWebSocket } from './hooks/useWebSocket';

// 通过 Vite 同源代理连接后端 WebSocket，绕过 CORS
const WS_URL = `ws://${window.location.host}/ws/chat`;

export default function App() {
  const { messages, status, send } = useWebSocket(WS_URL);
  const [isTyping] = useState(false);

  const handleSend = useCallback(
    (content: string) => {
      send(content);
    },
    [send]
  );

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <div style={styles.app}>
        <div style={styles.inner}>
          <Header status={status} />
          <ChatContainer messages={messages} isTyping={isTyping} />
          <InputArea onSend={handleSend} disabled={status !== 'connected'} />
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
`;
