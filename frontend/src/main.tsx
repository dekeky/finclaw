import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import { AiDockProvider } from './state/aiDock';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AiDockProvider>
        <App />
      </AiDockProvider>
    </BrowserRouter>
  </StrictMode>
);
