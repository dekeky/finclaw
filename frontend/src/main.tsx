import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import { ThemeProvider } from './context/ThemeContext';
import './index.css';
import { AiDockProvider } from './state/aiDock';
import { AgentsProvider } from './state/agents';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <AgentsProvider>
          <AiDockProvider>
            <App />
          </AiDockProvider>
        </AgentsProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
);
