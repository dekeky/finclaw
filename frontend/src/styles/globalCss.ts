/** Shared base styles (chat + RSS). */
export const GLOBAL_CSS = `
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
