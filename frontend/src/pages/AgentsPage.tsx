import { useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from '../components/Header';
import { ChatContainer } from '../components/ChatContainer';
import { InputArea } from '../components/InputArea';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useWebSocket } from '../hooks/useWebSocket';
import { useAgents } from '../state/agents';
import type { CreateAgentRequest } from '../api/agents';
import type { ConnectionStatus } from '../types';

const CHAT_WS_STATUS: Record<ConnectionStatus, string> = {
  idle: '未连接',
  connecting: '连接中…',
  connected: '已连接',
  error: '连接异常',
};

function buildAgentWsUrl(agentName: string | null): string | null {
  if (!agentName) return null;
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/ws/chat/${encodeURIComponent(agentName)}`;
}

type FormState = {
  name: string;
  modelName: string;
  model: string;
  apiBase: string;
  apiKey: string;
};

const EMPTY_FORM: FormState = {
  name: '',
  modelName: '',
  model: '',
  apiBase: '',
  apiKey: '',
};

const PRESETS: Array<{
  label: string;
  modelName: string;
  model: string;
  apiBase: string;
}> = [
  {
    label: 'DeepSeek Chat',
    modelName: 'deepseek-chat',
    model: 'deepseek-chat',
    apiBase: 'https://api.deepseek.com/v1',
  },
  {
    label: 'DeepSeek Reasoner',
    modelName: 'deepseek-reasoner',
    model: 'deepseek-reasoner',
    apiBase: 'https://api.deepseek.com/v1',
  },
  {
    label: 'OpenAI GPT-4o',
    modelName: 'gpt-4o',
    model: 'gpt-4o',
    apiBase: 'https://api.openai.com/v1',
  },
  {
    label: 'Qwen Plus (DashScope)',
    modelName: 'qwen-plus',
    model: 'qwen-plus',
    apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
];

function sectionKey(name: string): string {
  const ch = name.trim().charAt(0);
  if (/[a-zA-Z]/.test(ch)) return ch.toUpperCase();
  return '#';
}

type Section = { key: string; names: string[] };

function groupAgents(names: string[]): Section[] {
  const sorted = [...names].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  const map = new Map<string, string[]>();
  for (const n of sorted) {
    const k = sectionKey(n);
    const arr = map.get(k) ?? [];
    arr.push(n);
    map.set(k, arr);
  }
  const order = (a: string, b: string) => {
    if (a === '#') return 1;
    if (b === '#') return -1;
    return a.localeCompare(b, 'en');
  };
  return [...map.entries()]
    .sort(([ka], [kb]) => order(ka, kb))
    .map(([key, list]) => ({ key, names: list }));
}

export default function AgentsPage() {
  const {
    agents,
    status,
    error,
    currentAgent,
    selectAgent,
    refresh,
    createAgent,
    deleteAgent,
  } = useAgents();

  const [search, setSearch] = useState('');
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter((n) => n.toLowerCase().includes(q));
  }, [agents, search]);

  const sections = useMemo(() => groupAgents(filtered), [filtered]);

  useEffect(() => {
    setSelectedName((prev) => {
      if (prev && agents.includes(prev)) return prev;
      if (currentAgent && agents.includes(currentAgent)) return currentAgent;
      return agents[0] ?? null;
    });
  }, [agents, currentAgent]);

  const formValid = useMemo(() => {
    return (
      form.name.trim() &&
      form.modelName.trim() &&
      form.model.trim() &&
      form.apiBase.trim() &&
      form.apiKey.trim()
    );
  }, [form]);

  const openDetail = useCallback(
    (name: string) => {
      setAddOpen(false);
      setSelectedName(name);
      selectAgent(name);
    },
    [selectAgent],
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formValid || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    const req: CreateAgentRequest = {
      name: form.name.trim(),
      model_provider: {
        model_name: form.modelName.trim(),
        model: form.model.trim(),
        api_base: form.apiBase.trim(),
        api_key: form.apiKey.trim(),
      },
    };
    try {
      await createAgent(req);
      setForm(EMPTY_FORM);
      setAddOpen(false);
      setSelectedName(req.name);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async (name: string) => {
    if (pendingDelete) return;
    if (!window.confirm(`确定从列表移除 Agent「${name}」？后端将终止该 Agent 相关会话。`)) return;
    setPendingDelete(name);
    try {
      await deleteAgent(name);
      setSelectedName((prev) => (prev === name ? null : prev));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingDelete(null);
    }
  };

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    setForm((prev) => ({
      ...prev,
      modelName: preset.modelName,
      model: preset.model,
      apiBase: preset.apiBase,
    }));
  };

  const detailName = addOpen ? null : selectedName;
  const chatWsUrl = useMemo(
    () => buildAgentWsUrl(addOpen ? null : detailName),
    [addOpen, detailName],
  );
  const {
    messages,
    status: chatWsStatus,
    isTyping,
    sendError,
    send,
    clearMessages,
    reconnect,
  } = useWebSocket(chatWsUrl);

  return (
    <>
      <style>{PAGE_CSS}</style>
      <div className="agents-shell">
        <Header
          mode="rss"
          showBranding={false}
          rssRefreshing={status === 'loading'}
          onRssRefresh={() => void refresh()}
        />

        <div className="agents-scroll">
          <div className="contacts-layout">
            <aside className="contacts-list-pane" aria-label="Agent 列表">
              <div className="contacts-list-head">
                <div className="contacts-list-title-row">
                  <h1 className="contacts-list-title">Agent 管理</h1>
                  <span className="contacts-count">{agents.length}</span>
                </div>
                <p className="contacts-list-hint">点击 Agent 即在右侧直连 WebSocket 对话；当前选中项会与资讯浮窗共用。</p>
                <div className="contacts-toolbar">
                  <label className="contacts-search-wrap">
                    <span className="contacts-search-ic" aria-hidden>
                      ⌕
                    </span>
                    <input
                      className="contacts-search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="搜索 Agent"
                      autoComplete="off"
                      spellCheck={false}
                      aria-label="搜索 Agent"
                    />
                  </label>
                  <button
                    type="button"
                    className="contacts-add-hit"
                    onClick={() => setAddOpen(true)}
                    title="添加 Agent"
                  >
                    添加
                  </button>
                </div>
                <div className="contacts-list-actions">
                  <button
                    type="button"
                    className="agents-btn agents-btn-ghost contacts-sync"
                    onClick={() => void refresh()}
                    disabled={status === 'loading'}
                  >
                    {status === 'loading' ? '同步中…' : '同步列表'}
                  </button>
                </div>
              </div>

              {error && <div className="agents-warn contacts-list-warn">⚠️ {error}</div>}

              <div className="contacts-list-body">
                {filtered.length === 0 ? (
                  <div className="contacts-empty">
                    <div className="contacts-empty-icon" aria-hidden>
                      👥
                    </div>
                    <div className="contacts-empty-title">{search.trim() ? '没有匹配的 Agent' : '暂无 Agent'}</div>
                    <div className="contacts-empty-sub">
                      {search.trim()
                        ? '换个关键词试试，或清空搜索。'
                        : '点击「添加」创建 Agent 并绑定模型，即可在右侧对话。'}
                    </div>
                    {!search.trim() && (
                      <button type="button" className="agents-btn agents-btn-primary contacts-empty-cta" onClick={() => setAddOpen(true)}>
                        添加 Agent
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="contacts-sections" role="list">
                    {sections.map((sec) => (
                      <section key={sec.key} className="contacts-section">
                        <div className="contacts-section-label" aria-hidden>
                          {sec.key}
                        </div>
                        <ul className="contacts-rows">
                          {sec.names.map((name) => {
                            const chatting = name === currentAgent;
                            const selected = !addOpen && name === selectedName;
                            const deleting = pendingDelete === name;
                            return (
                              <li key={name}>
                                <button
                                  type="button"
                                  role="listitem"
                                  className={`contacts-row ${selected ? 'selected' : ''}`}
                                  onClick={() => openDetail(name)}
                                >
                                  <div className="contacts-row-avatar" aria-hidden>
                                    {name.slice(0, 1).toUpperCase()}
                                  </div>
                                  <div className="contacts-row-text">
                                    <div className="contacts-row-name">
                                      <span className="contacts-row-name-txt">{name}</span>
                                      {chatting && <span className="contacts-row-badge">当前</span>}
                                    </div>
                                    <div className="contacts-row-sub">/ws/chat/{name}</div>
                                  </div>
                                  {deleting && <span className="contacts-row-spin">…</span>}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            </aside>

            <main className="contacts-detail-pane" aria-label="Agent 详情与对话">
              {addOpen ? (
                <div className="contacts-detail-card">
                  <div className="contacts-detail-head">
                    <button type="button" className="contacts-back-mo" onClick={() => setAddOpen(false)}>
                      ← 返回列表
                    </button>
                    <div className="contacts-detail-title-block">
                      <h2 className="contacts-detail-title">添加 Agent</h2>
                      <p className="contacts-detail-sub">创建 Agent 目录并绑定模型服务后，即可在右侧与其对话。</p>
                    </div>
                  </div>

                  <div className="agents-presets">
                    {PRESETS.map((p) => (
                      <button
                        type="button"
                        key={p.label}
                        className="agents-preset"
                        onClick={() => applyPreset(p)}
                        title={`${p.modelName} · ${p.apiBase}`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  <form className="agents-form" onSubmit={onSubmit}>
                    <label className="agents-field">
                      <span className="agents-field-label">显示名称 / 目录名 *</span>
                      <input
                        className="agents-input"
                        value={form.name}
                        onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                        placeholder="例如：deepseek-default"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </label>

                    <div className="agents-row">
                      <label className="agents-field">
                        <span className="agents-field-label">model_name *</span>
                        <input
                          className="agents-input"
                          value={form.modelName}
                          onChange={(e) => setForm((s) => ({ ...s, modelName: e.target.value }))}
                          placeholder="deepseek-chat"
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </label>
                      <label className="agents-field">
                        <span className="agents-field-label">model *</span>
                        <input
                          className="agents-input"
                          value={form.model}
                          onChange={(e) => setForm((s) => ({ ...s, model: e.target.value }))}
                          placeholder="deepseek-chat"
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </label>
                    </div>

                    <label className="agents-field">
                      <span className="agents-field-label">api_base *</span>
                      <input
                        className="agents-input"
                        value={form.apiBase}
                        onChange={(e) => setForm((s) => ({ ...s, apiBase: e.target.value }))}
                        placeholder="https://api.deepseek.com/v1"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </label>

                    <label className="agents-field">
                      <span className="agents-field-label">api_key *</span>
                      <input
                        className="agents-input"
                        type="password"
                        value={form.apiKey}
                        onChange={(e) => setForm((s) => ({ ...s, apiKey: e.target.value }))}
                        placeholder="sk-..."
                        autoComplete="off"
                        spellCheck={false}
                      />
                      <span className="agents-field-hint">仅发往后端，不会在浏览器里长期保存。</span>
                    </label>

                    {submitError && <div className="agents-warn">⚠️ {submitError}</div>}

                    <div className="agents-form-actions">
                      <button
                        type="button"
                        className="agents-btn agents-btn-ghost"
                        onClick={() => setForm(EMPTY_FORM)}
                        disabled={submitting}
                      >
                        清空
                      </button>
                      <button type="submit" className="agents-btn agents-btn-primary" disabled={!formValid || submitting}>
                        {submitting ? '添加中…' : '保存并设为当前 Agent'}
                      </button>
                    </div>
                  </form>
                </div>
              ) : detailName ? (
                <div className="contacts-agent-split">
                  <header className="contacts-agent-header">
                    <div className="contacts-agent-header-row">
                      <div className="contacts-profile-hero contacts-profile-hero--compact">
                        <div className="contacts-profile-avatar contacts-profile-avatar--sm" aria-hidden>
                          {detailName.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="contacts-profile-names">
                          <h2 className="contacts-profile-name">{detailName}</h2>
                          <p className="contacts-profile-handle">
                            <code className="contacts-mono">/ws/chat/{detailName}</code>
                          </p>
                        </div>
                      </div>
                      <div className="contacts-chat-status" title="与本页的实时连接状态">
                        <span className={`contacts-ws-dot contacts-ws-dot--${chatWsStatus}`} aria-hidden />
                        <span className="contacts-ws-label">{CHAT_WS_STATUS[chatWsStatus]}</span>
                        {(chatWsStatus === 'error' || chatWsStatus === 'idle') && chatWsUrl ? (
                          <button type="button" className="agents-btn agents-btn-ghost agents-btn-tight" onClick={reconnect}>
                            重连
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <p className="contacts-agent-hint">列表选中即切换对话对象；资讯页右下角 AI 浮窗会使用同一当前 Agent。</p>
                    <div className="contacts-agent-toolbar">
                      <button
                        type="button"
                        className="agents-btn agents-btn-danger"
                        onClick={() => void onDelete(detailName)}
                        disabled={pendingDelete === detailName}
                      >
                        {pendingDelete === detailName ? '移除中…' : '移除此 Agent'}
                      </button>
                    </div>
                  </header>
                  <div className="contacts-agent-chat">
                    {sendError ? (
                      <div className="contacts-chat-banner" role="status">
                        <span>{sendError}</span>
                        <button type="button" className="agents-btn agents-btn-ghost agents-btn-tight" onClick={reconnect}>
                          重连
                        </button>
                      </div>
                    ) : null}
                    <ErrorBoundary>
                      <ChatContainer messages={messages} isTyping={isTyping} onClear={clearMessages} />
                    </ErrorBoundary>
                    <InputArea
                      onSend={send}
                      disabled={chatWsStatus !== 'connected'}
                      placeholder={`向「${detailName}」发送消息…`}
                      compact
                    />
                  </div>
                </div>
              ) : (
                <div className="contacts-detail-placeholder">
                  <div className="contacts-detail-placeholder-icon" aria-hidden>
                    💬
                  </div>
                  <p className="contacts-detail-placeholder-title">选择左侧 Agent</p>
                  <p className="contacts-detail-placeholder-sub">点选列表中的条目，在右侧開始对话与管理。</p>
                </div>
              )}
            </main>
          </div>
        </div>
      </div>
    </>
  );
}

const PAGE_CSS = `
.agents-shell {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--fc-bg-app);
}
.agents-scroll {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.contacts-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
  gap: 0;
  max-width: var(--fc-content-max);
  margin: 0 auto;
  box-sizing: border-box;
  border: 1px solid var(--fc-border);
  border-radius: var(--fc-radius-lg);
  overflow: hidden;
  margin-top: var(--fc-page-pad-y);
  margin-bottom: calc(var(--fc-page-pad-y) + 8px);
  margin-left: var(--fc-page-pad-x);
  margin-right: var(--fc-page-pad-x);
  background: var(--fc-bg-raised);
  box-shadow: 0 8px 32px rgba(15, 23, 42, 0.08);
}

@media (max-width: 900px) {
  .contacts-layout {
    grid-template-columns: 1fr;
    margin-top: clamp(12px, 2vw, 20px);
  }
  .agents-scroll {
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .contacts-detail-pane {
    border-top: 1px solid var(--fc-border);
    min-height: min(520px, 65vh);
  }
  .contacts-back-mo { display: inline-flex !important; }
}

.contacts-list-pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--fc-border);
  background: var(--fc-bg-panel);
}

.contacts-list-head {
  padding: clamp(16px, 2.5vw, 20px);
  padding-bottom: 12px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--fc-border);
}

.contacts-list-title-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.contacts-list-title {
  font-size: clamp(1.15rem, 2.2vw, 1.35rem);
  font-weight: 650;
  letter-spacing: -0.02em;
  color: var(--fc-text);
  margin: 0;
}

.contacts-count {
  font-size: 12px;
  font-family: var(--fc-font-mono);
  color: var(--fc-text-muted);
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--fc-border);
  background: var(--fc-bg-muted);
}

.contacts-list-hint {
  font-size: 12px;
  color: var(--fc-text-muted);
  line-height: 1.55;
  margin: 8px 0 0;
}

.contacts-toolbar {
  display: flex;
  gap: 8px;
  margin-top: 14px;
  align-items: stretch;
}

.contacts-search-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border-radius: 10px;
  border: 1px solid var(--fc-border-strong);
  background: var(--fc-bg-app);
  min-width: 0;
}

.contacts-search-ic {
  color: var(--fc-text-dim);
  font-size: 14px;
  line-height: 1;
  flex-shrink: 0;
}

.contacts-search {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  color: var(--fc-text);
  font-size: 14px;
  font-family: var(--fc-font-sans);
  padding: 9px 0;
  outline: none;
}

.contacts-add-hit {
  flex-shrink: 0;
  padding: 0 14px;
  border-radius: 10px;
  border: 1px solid rgba(36,104,242,0.28);
  background: var(--fc-primary-soft);
  color: var(--fc-primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  font-family: var(--fc-font-sans);
  transition: background .15s ease;
}

.contacts-add-hit:hover {
  background: #dbeafe;
}

.contacts-list-actions {
  margin-top: 10px;
}

.contacts-sync.agents-btn {
  width: 100%;
  justify-content: center;
}

.contacts-list-warn {
  margin: 0 16px 12px;
}

.contacts-list-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.contacts-empty {
  padding: 36px 20px;
  text-align: center;
  color: var(--fc-text-muted);
}

.contacts-empty-icon {
  font-size: 36px;
  margin-bottom: 10px;
  opacity: 0.9;
}

.contacts-empty-title {
  color: var(--fc-text-secondary);
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 6px;
}

.contacts-empty-sub {
  font-size: 12px;
  line-height: 1.6;
  max-width: 260px;
  margin: 0 auto 16px;
}

.contacts-empty-cta {
  margin-top: 4px;
}

.contacts-sections {
  padding-bottom: 16px;
}

.contacts-section-label {
  font-size: 11px;
  font-weight: 650;
  color: var(--fc-accent-blue-soft);
  padding: 12px 16px 6px;
  letter-spacing: 0.06em;
  font-family: var(--fc-font-mono);
  position: sticky;
  top: 0;
  background: rgba(249,250,252,0.92);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--fc-border);
  z-index: 1;
}

.contacts-rows {
  list-style: none;
}

.contacts-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border: none;
  border-bottom: 1px solid var(--fc-border);
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background .12s ease;
  font: inherit;
  color: inherit;
}

.contacts-row:hover {
  background: var(--fc-bg-muted);
}

.contacts-row.selected {
  background: var(--fc-primary-soft);
  box-shadow: inset 3px 0 0 var(--fc-primary);
}

.contacts-row-avatar {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: linear-gradient(135deg, #2468f2 0%, #5b9cff 100%);
  color: #fff;
  font-weight: 700;
  font-size: 17px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.contacts-row-text {
  min-width: 0;
  flex: 1;
}

.contacts-row-name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.contacts-row-name-txt {
  font-size: 15px;
  font-weight: 600;
  color: var(--fc-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.contacts-row-badge {
  flex-shrink: 0;
  font-size: 10px;
  font-family: var(--fc-font-mono);
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid rgba(74,222,128,0.35);
  background: rgba(74,222,128,0.12);
  color: var(--fc-success);
}

.contacts-row-sub {
  font-size: 11px;
  color: var(--fc-text-dim);
  font-family: var(--fc-font-mono);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.contacts-row-spin {
  color: var(--fc-text-muted);
  font-size: 14px;
}

.contacts-detail-pane {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--fc-bg-raised);
  overflow: hidden;
}

.contacts-agent-split {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.contacts-agent-header {
  flex-shrink: 0;
  padding: clamp(14px, 2vw, 20px) clamp(16px, 2.5vw, 22px);
  border-bottom: 1px solid var(--fc-border);
  background: var(--fc-bg-panel);
}

.contacts-agent-header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.contacts-profile-hero.contacts-profile-hero--compact {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 1;
  min-width: 0;
  margin-bottom: 0;
}

.contacts-profile-avatar.contacts-profile-avatar--sm {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  font-size: 20px;
}

.contacts-chat-status {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--fc-text-muted);
  font-family: var(--fc-font-mono);
}

.contacts-ws-label {
  white-space: nowrap;
}

.contacts-ws-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--fc-text-dim);
}

.contacts-ws-dot--connected {
  background: var(--fc-success);
  box-shadow: 0 0 8px rgba(22, 163, 74, 0.35);
}

.contacts-ws-dot--connecting {
  background: #ca8a04;
  animation: pulse 1.2s ease-in-out infinite;
}

.contacts-ws-dot--error {
  background: var(--fc-danger);
}

.contacts-ws-dot--idle {
  background: var(--fc-text-dim);
}

.contacts-agent-hint {
  font-size: 12px;
  color: var(--fc-text-muted);
  line-height: 1.5;
  margin: 12px 0 0;
}

.contacts-agent-toolbar {
  margin-top: 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.contacts-agent-chat {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 12px clamp(14px, 2vw, 20px) 16px;
  background: var(--fc-bg-raised);
}

.contacts-chat-banner {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
  margin-bottom: 8px;
  border-radius: 8px;
  border: 1px solid rgba(220, 38, 38, 0.25);
  background: rgba(220, 38, 38, 0.06);
  color: var(--fc-danger);
  font-size: 12px;
}

.agents-btn-tight {
  padding: 4px 10px;
  font-size: 11px;
}

.contacts-detail-card {
  padding: clamp(20px, 3vw, 32px);
  flex: 1;
  overflow-y: auto;
}

.contacts-detail-head {
  margin-bottom: 18px;
}

.contacts-back-mo {
  display: none;
  margin-bottom: 12px;
  padding: 0;
  border: none;
  background: none;
  color: var(--fc-accent-blue);
  font-size: 13px;
  cursor: pointer;
  font-family: var(--fc-font-sans);
}

.contacts-detail-title-block {
  margin-top: 4px;
}

.contacts-detail-title {
  font-size: 18px;
  font-weight: 650;
  color: var(--fc-text);
  margin: 0 0 6px;
}

.contacts-detail-sub {
  font-size: 12px;
  color: var(--fc-text-muted);
  line-height: 1.55;
  margin: 0;
}

.contacts-profile-hero {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 28px;
}

.contacts-profile-avatar {
  width: 72px;
  height: 72px;
  border-radius: 22px;
  background: linear-gradient(145deg, #2468f2 0%, #5b9cff 100%);
  color: #fff;
  font-weight: 750;
  font-size: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 10px 28px rgba(36, 104, 242, 0.22);
}

.contacts-profile-name {
  font-size: clamp(1.25rem, 2.5vw, 1.5rem);
  font-weight: 650;
  margin: 0 0 4px;
  color: var(--fc-text);
}

.contacts-profile-handle {
  margin: 0;
  font-size: 13px;
  color: var(--fc-text-muted);
  font-family: var(--fc-font-mono);
}

.contacts-profile-fields {
  margin: 0;
  padding: 16px 0;
  border-top: 1px solid var(--fc-border);
  border-bottom: 1px solid var(--fc-border);
}

.contacts-profile-row {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 12px;
  padding: 10px 0;
  font-size: 13px;
}

.contacts-profile-row dt {
  margin: 0;
  color: var(--fc-text-muted);
  font-weight: 500;
}

.contacts-profile-row dd {
  margin: 0;
  color: var(--fc-text-secondary);
  line-height: 1.5;
}

.contacts-mono {
  font-family: var(--fc-font-mono);
  font-size: 12px;
  color: var(--fc-accent-blue);
  word-break: break-all;
}

.contacts-profile-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 24px;
}

.contacts-detail-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  text-align: center;
  color: var(--fc-text-muted);
}

.contacts-detail-placeholder-icon {
  font-size: 40px;
  margin-bottom: 12px;
  opacity: 0.85;
}

.contacts-detail-placeholder-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--fc-text-secondary);
  margin: 0 0 8px;
}

.contacts-detail-placeholder-sub {
  font-size: 13px;
  line-height: 1.6;
  max-width: 300px;
  margin: 0;
}

.agents-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  font-size: 12px;
  font-family: var(--fc-font-mono);
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
  background: transparent;
  transition: all .15s ease;
}
.agents-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.agents-btn-ghost {
  border-color: var(--fc-border-strong);
  color: var(--fc-text-secondary);
  background: var(--fc-bg-muted);
}
.agents-btn-ghost:hover:not(:disabled) { background: var(--fc-bg-app); }
.agents-btn-primary {
  background: linear-gradient(135deg, #2468f2 0%, #5b9cff 100%);
  color: #fff;
  font-weight: 600;
}
.agents-btn-primary:hover:not(:disabled) { filter: brightness(1.05); }
.agents-btn-danger {
  border-color: rgba(248,113,113,0.35);
  color: var(--fc-danger);
  background: rgba(248,113,113,0.08);
}
.agents-btn-danger:hover:not(:disabled) { background: rgba(248,113,113,0.16); }

.agents-warn {
  margin: 12px 0;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(248,113,113,0.3);
  background: rgba(248,113,113,0.08);
  color: var(--fc-danger);
  font-size: 12px;
}

.agents-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
}
.agents-preset {
  font-size: 11px;
  font-family: var(--fc-font-mono);
  padding: 5px 10px;
  border-radius: 999px;
  border: 1px solid rgba(36,104,242,0.22);
  background: var(--fc-primary-soft);
  color: var(--fc-primary);
  cursor: pointer;
}
.agents-preset:hover { background: #dbeafe; }

.agents-form { display: flex; flex-direction: column; gap: 12px; }
.agents-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.agents-field-label {
  font-size: 11px;
  color: var(--fc-text-muted);
  font-family: var(--fc-font-mono);
  letter-spacing: 0.02em;
}
.agents-field-hint {
  font-size: 11px;
  color: var(--fc-text-dim);
}
.agents-input {
  font-size: 13px;
  font-family: var(--fc-font-mono);
  padding: 9px 11px;
  border-radius: 8px;
  border: 1px solid var(--fc-border-strong);
  background: var(--fc-bg-app);
  color: var(--fc-text);
  outline: none;
  transition: border-color .15s ease, background .15s ease;
}
.agents-input:focus {
  border-color: rgba(36,104,242,0.45);
  background: var(--fc-bg-raised);
}
.agents-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
@media (max-width: 600px) {
  .agents-row { grid-template-columns: 1fr; }
}
.agents-form-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
`;