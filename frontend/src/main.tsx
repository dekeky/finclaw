import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import { ThemeProvider } from './context/ThemeContext';
import './index.css';
import { AiDockProvider } from './state/aiDock';
import { AgentsProvider } from './state/agents';
import { ChatSessionProvider } from './state/chatSession';
import { DocViewerProvider } from './state/docViewer';
import { NavigationGuardProvider } from './state/navigationGuard';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <NavigationGuardProvider>
          <AgentsProvider>
            <DocViewerProvider>
              <ChatSessionProvider>
                <AiDockProvider>
                  <App />
                </AiDockProvider>
              </ChatSessionProvider>
            </DocViewerProvider>
          </AgentsProvider>
        </NavigationGuardProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
