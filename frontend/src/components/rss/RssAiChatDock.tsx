import { useCallback, useMemo, useState } from 'react';
import { ChatContainer } from '../ChatContainer';
import { InputArea } from '../InputArea';
import { ErrorBoundary } from '../ErrorBoundary';
import { useWebSocket } from '../../hooks/useWebSocket';
import { buildAnalysisUserMessage, type EntryForAnalysis } from '../../utils/analysisPrompt';
import { rssScopedItemKey } from '../../utils/rssScopedKey';
import { rssSourceDisplayLabel } from '../../utils/rssSourceLabel';

const WS_URL = `ws://${window.location.host}/ws/chat`;

type Props = {
  listEntries: EntryForAnalysis[];
  selectedKeys: Set<string>;
  onToggleSelectKey: (key: string) => void;
  onClearSelection: () => void;
};

function CuteAiFab({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="rss-ai-fab" onClick={onClick} aria-label="打开 AI 对话">
      <span className="rss-ai-fab-glow" aria-hidden />
      <span className="rss-ai-fab-face">
        <svg className="rss-ai-fab-svg" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <ellipse cx="32" cy="36" rx="22" ry="20" fill="url(#fabGrad)" />
          <ellipse cx="22" cy="30" rx="5" ry="7" fill="#fff5" transform="rotate(-15 22 30)" />
          <ellipse cx="42" cy="30" rx="5" ry="7" fill="#fff5" transform="rotate(15 42 30)" />
          <circle cx="24" cy="34" r="3.5" fill="#1a1520" />
          <circle cx="40" cy="34" r="3.5" fill="#1a1520" />
          <circle cx="25" cy="33" r="1.2" fill="#fff" />
          <circle cx="41" cy="33" r="1.2" fill="#fff" />
          <ellipse cx="26" cy="42" rx="3" ry="2" fill="#ffb6c8" opacity="0.65" />
          <ellipse cx="38" cy="42" rx="3" ry="2" fill="#ffb6c8" opacity="0.65" />
          <path
            d="M26 46 Q32 50 38 46"
            stroke="#1a1520"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
            opacity="0.85"
          />
          <path d="M14 18 Q32 8 50 18" stroke="#e8b84a" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.9" />
          <circle cx="18" cy="14" r="3" fill="#ffd966" opacity="0.95" />
          <circle cx="46" cy="14" r="3" fill="#ffd966" opacity="0.95" />
          <defs>
            <linearGradient id="fabGrad" x1="18" y1="16" x2="46" y2="52" gradientUnits="userSpaceOnUse">
              <stop stopColor="#ffe8f0" />
              <stop offset="0.5" stopColor="#ffd6e8" />
              <stop offset="1" stopColor="#e8c4ff" />
            </linearGradient>
          </defs>
        </svg>
      </span>
      <span className="rss-ai-fab-sparkle" aria-hidden>
        ✨
      </span>
    </button>
  );
}

export function RssAiChatDock({ listEntries, selectedKeys, onToggleSelectKey, onClearSelection }: Props) {
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const { messages, status, isTyping, sendError, send, clearMessages, reconnect } = useWebSocket(WS_URL);

  const hasFeed = listEntries.length > 0;
  const selectedEntries = useMemo(
    () => listEntries.filter((e) => selectedKeys.has(rssScopedItemKey(e.sourceName, e.sector, e.item))),
    [listEntries, selectedKeys],
  );

  const handleSend = useCallback(
    (text: string) => {
      setHint(null);
      const entries = selectedEntries;
      const missingLink = entries.length > 0 && entries.every((e) => !e.item.link?.trim());
      if (missingLink) {
        setHint('已选文章没有原文链接，请先取消选择或换一篇带链接的条目。');
        return;
      }
      const payload = buildAnalysisUserMessage(text, entries);
      send(payload);
    },
    [send, selectedEntries],
  );

  const removeChip = (key: string) => {
    onToggleSelectKey(key);
  };

  return (
    <>
      <style>{DOCK_CSS}</style>
      {!open && <CuteAiFab onClick={() => setOpen(true)} />}

      {open && (
        <>
          <button type="button" className="rss-ai-backdrop" aria-label="关闭对话" onClick={() => setOpen(false)} />
          <aside className="rss-ai-dock" aria-label="AI 对话">
            <div className="rss-ai-dock-head">
              <div className="rss-ai-dock-title">
                <span className="rss-ai-dock-emoji" aria-hidden>
                  💬
                </span>
                <div>
                  <div className="rss-ai-dock-name">Finclaw AI</div>
                  <div className="rss-ai-dock-sub">
                    {hasFeed ? '勾选金融资讯里的文章，可把原文链接一并发给助手' : '直接提问即可'}
                  </div>
                </div>
              </div>
              <div className="rss-ai-dock-head-actions">
                <span className={`rss-ai-dock-dot rss-ai-dock-dot--${status}`} title={status} />
                {(status === 'error' || status === 'idle') && (
                  <button type="button" className="rss-ai-dock-mini-btn" onClick={reconnect}>
                    重连
                  </button>
                )}
                <button type="button" className="rss-ai-dock-close" onClick={() => setOpen(false)} aria-label="关闭">
                  ×
                </button>
              </div>
            </div>

            {selectedEntries.length > 0 && (
              <div className="rss-ai-chips">
                <div className="rss-ai-chips-head">
                  <span>已选 {selectedEntries.length} 篇</span>
                  <button type="button" className="rss-ai-chips-clear" onClick={onClearSelection}>
                    清空
                  </button>
                </div>
                <div className="rss-ai-chips-row">
                  {selectedEntries.map((e) => {
                    const k = rssScopedItemKey(e.sourceName, e.sector, e.item);
                    const t = e.item.title || '(无标题)';
                    const short = t.length > 36 ? `${t.slice(0, 36)}…` : t;
                    return (
                      <span key={k} className="rss-ai-chip">
                        <span className="rss-ai-chip-text">
                          <span className="rss-ai-chip-title">{short}</span>
                          <span className="rss-ai-chip-meta">
                            {rssSourceDisplayLabel(e)} · {e.sector}
                          </span>
                        </span>
                        <button type="button" className="rss-ai-chip-x" onClick={() => removeChip(k)} aria-label="移除">
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {hint && <div className="rss-ai-hint">{hint}</div>}
            {sendError && <div className="rss-ai-warn">{sendError}</div>}

            <ErrorBoundary>
              <div className="rss-ai-dock-chat">
                <ChatContainer
                  messages={messages}
                  isTyping={isTyping}
                  onClear={clearMessages}
                  variant="dock"
                />
              </div>
            </ErrorBoundary>

            <div className="rss-ai-dock-inputwrap">
              <InputArea
                onSend={handleSend}
                disabled={status !== 'connected'}
                placeholder={
                  selectedEntries.length > 0
                    ? '输入问题，将附带已选文章的原文链接…'
                    : '随便聊聊，或在列表勾选文章后再提问…'
                }
              />
            </div>
          </aside>
        </>
      )}
    </>
  );
}

const DOCK_CSS = `
.rss-ai-fab {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 1100;
  width: 68px;
  height: 68px;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  padding: 0;
  background: transparent;
  filter: drop-shadow(0 8px 24px rgba(232, 184, 74, 0.35));
  transition: transform 0.2s ease;
}
.rss-ai-fab:hover { transform: scale(1.06); }
.rss-ai-fab:active { transform: scale(0.96); }

.rss-ai-fab-glow {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(circle at 30% 30%, rgba(255,230,240,0.9), rgba(232,196,255,0.5) 55%, rgba(201,168,76,0.15));
  animation: rssAiFabPulse 2.8s ease-in-out infinite;
}
@keyframes rssAiFabPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.92; transform: scale(1.03); }
}

.rss-ai-fab-face {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}
.rss-ai-fab-svg { width: 56px; height: 56px; }
.rss-ai-fab-sparkle {
  position: absolute;
  right: -2px;
  top: -4px;
  font-size: 14px;
  animation: rssAiSpark 1.8s ease-in-out infinite;
  pointer-events: none;
}
@keyframes rssAiSpark {
  0%, 100% { opacity: 0.85; transform: rotate(-8deg) scale(1); }
  50% { opacity: 1; transform: rotate(8deg) scale(1.08); }
}

.rss-ai-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1090;
  background: rgba(0,0,0,0.45);
  border: none;
  cursor: pointer;
  animation: rssAiFadeIn 0.2s ease;
}
@keyframes rssAiFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.rss-ai-dock {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 1100;
  width: min(420px, 100vw);
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #12121a 0%, #0c0c0e 40%);
  border-left: 1px solid rgba(255,255,255,0.08);
  box-shadow: -12px 0 40px rgba(0,0,0,0.45);
  animation: rssAiSlide 0.28s ease;
}
@keyframes rssAiSlide {
  from { transform: translateX(100%); opacity: 0.9; }
  to { transform: translateX(0); opacity: 1; }
}

.rss-ai-dock-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 14px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}
.rss-ai-dock-title { display: flex; gap: 10px; min-width: 0; }
.rss-ai-dock-emoji { font-size: 26px; line-height: 1; }
.rss-ai-dock-name {
  font-size: 16px;
  font-weight: 600;
  color: #f0f0f2;
}
.rss-ai-dock-sub {
  font-size: 11px;
  color: #7a7a82;
  margin-top: 4px;
  line-height: 1.45;
}
.rss-ai-dock-head-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.rss-ai-dock-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #5a5a5e;
}
.rss-ai-dock-dot--connected { background: #4ade80; box-shadow: 0 0 8px rgba(74,222,128,0.45); }
.rss-ai-dock-dot--connecting { background: #c9a84c; animation: pulse 1.2s ease-in-out infinite; }
.rss-ai-dock-dot--error { background: #f87171; }

.rss-ai-dock-mini-btn {
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid rgba(248,113,113,0.35);
  background: rgba(248,113,113,0.1);
  color: #f87171;
  cursor: pointer;
  font-family: JetBrains Mono, monospace;
}
.rss-ai-dock-close {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: rgba(255,255,255,0.06);
  color: #a0a0a8;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}
.rss-ai-dock-close:hover { background: rgba(255,255,255,0.1); color: #f0f0f2; }

.rss-ai-chips {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  flex-shrink: 0;
  max-height: 120px;
  overflow: auto;
}
.rss-ai-chips-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  font-family: JetBrains Mono, monospace;
  color: #7ab8e8;
  margin-bottom: 8px;
}
.rss-ai-chips-clear {
  background: none;
  border: none;
  color: #c9a84c;
  cursor: pointer;
  font-size: 11px;
  font-family: JetBrains Mono, monospace;
}
.rss-ai-chips-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.rss-ai-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  padding: 4px 8px 4px 10px;
  border-radius: 999px;
  background: rgba(91,155,213,0.12);
  border: 1px solid rgba(91,155,213,0.25);
  font-size: 11px;
  color: #b8d9f5;
}
.rss-ai-chip-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.rss-ai-chip-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px; }
.rss-ai-chip-meta {
  font-size: 10px;
  color: #7a8a9a;
  font-family: JetBrains Mono, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 260px;
}
.rss-ai-chip-x {
  border: none;
  background: transparent;
  color: #8ec5f0;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
}

.rss-ai-hint, .rss-ai-warn {
  padding: 8px 12px;
  font-size: 12px;
  flex-shrink: 0;
}
.rss-ai-hint { color: #fbbf24; background: rgba(251,191,36,0.08); }
.rss-ai-warn { color: #f87171; background: rgba(248,113,113,0.08); }

.rss-ai-dock-chat {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0 12px;
  overflow: hidden;
}

.rss-ai-dock-inputwrap form {
  padding-left: 12px !important;
  padding-right: 12px !important;
  padding-bottom: 16px !important;
}
.rss-ai-dock-inputwrap .finclaw-input {
  border-radius: 18px !important;
}

@media (max-width: 480px) {
  .rss-ai-fab { right: 14px; bottom: 14px; width: 60px; height: 60px; }
  .rss-ai-fab-svg { width: 50px; height: 50px; }
}
`;
