/** Shared base styles (chat + RSS). 浅色「工作台」主题，与侧栏、首页 Hub 一致 */
export const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Noto+Sans+SC:wght@300;400;500;600;700&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  color-scheme: light;
  --fc-bg-deep: #e8ebf3;
  --fc-bg-app: #f4f6fb;
  --fc-bg-raised: #ffffff;
  --fc-bg-surface: #ffffff;
  --fc-bg-muted: #eef1f8;
  --fc-bg-panel: #f9fafc;
  --fc-border: rgba(15, 23, 42, 0.08);
  --fc-border-strong: rgba(15, 23, 42, 0.14);
  --fc-text: #161822;
  --fc-text-secondary: #4b5568;
  --fc-text-muted: #6b7280;
  --fc-text-dim: #9ca3af;
  --fc-primary: #2468f2;
  --fc-primary-hover: #1a5ad9;
  --fc-primary-soft: #e8f0ff;
  --fc-accent-gold: #c9a84c;
  --fc-accent-gold-mid: #b8953a;
  --fc-accent-gold-bright: #a67c1a;
  --fc-accent-blue: #2468f2;
  --fc-accent-blue-soft: #5b8def;
  --fc-teal: #0d9488;
  --fc-success: #16a34a;
  --fc-danger: #dc2626;
  --fc-focus: 0 0 0 2px #fff, 0 0 0 4px rgba(36, 104, 242, 0.35);
  --fc-font-sans: 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --fc-font-mono: 'JetBrains Mono', ui-monospace, monospace;
  --fc-sidebar-width: 232px;
  --fc-sidebar-rail: 72px;
  --fc-page-pad-x: clamp(16px, 3vw, 36px);
  --fc-page-pad-y: clamp(16px, 2.5vh, 28px);
  --fc-radius-lg: 16px;
  --fc-radius-md: 12px;
  --fc-content-max: 1224px;
  --fc-type-title: clamp(1.125rem, 2.5vw, 1.35rem);
  --fc-type-body: 15px;
  --fc-type-small: 13px;
  --fc-type-caption: 12px;
}

.fc-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.fc-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--fc-bg-app);
}

.fc-page__main {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--fc-page-pad-y) var(--fc-page-pad-x);
}

.fc-page__card {
  width: min(720px, 100%);
  border-radius: var(--fc-radius-lg);
  border: 1px solid var(--fc-border);
  background: var(--fc-bg-raised);
  padding: clamp(24px, 4vw, 36px);
  box-shadow: 0 8px 32px rgba(15, 23, 42, 0.06);
}

.fc-page__title {
  font-size: var(--fc-type-title);
  font-weight: 650;
  letter-spacing: -0.03em;
  color: var(--fc-text);
  margin-bottom: 10px;
}

.fc-page__sub {
  font-size: var(--fc-type-body);
  color: var(--fc-text-muted);
  line-height: 1.65;
}

html, body, #root {
  height: 100%;
  font-family: var(--fc-font-sans);
  background: var(--fc-bg-app);
  color: var(--fc-text);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

::selection {
  background: rgba(36, 104, 242, 0.18);
  color: var(--fc-text);
}

button:focus-visible,
a:focus-visible,
input:focus-visible,
textarea:focus-visible,
select:focus-visible {
  outline: none;
  box-shadow: var(--fc-focus);
}

.finclaw-input:focus-within {
  border-color: rgba(36, 104, 242, 0.45) !important;
  box-shadow: 0 0 0 1px rgba(36, 104, 242, 0.12), 0 4px 20px rgba(15, 23, 42, 0.06);
}

.finclaw-quick-chip {
  font-size: 12px;
  line-height: 1.4;
  text-align: left;
  padding: 10px 14px;
  border-radius: 999px;
  border: 1px solid rgba(36, 104, 242, 0.22);
  background: var(--fc-primary-soft);
  color: var(--fc-primary);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.12s ease;
  font-family: var(--fc-font-sans);
}
.finclaw-quick-chip:hover {
  background: #dbeafe;
  border-color: rgba(36, 104, 242, 0.4);
}
.finclaw-quick-chip:active {
  transform: scale(0.98);
}

::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: rgba(15, 23, 42, 0.12);
  border-radius: 4px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
::-webkit-scrollbar-thumb:hover { background: rgba(36, 104, 242, 0.35); background-clip: padding-box; }

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
