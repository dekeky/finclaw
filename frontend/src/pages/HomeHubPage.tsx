import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

/** 工作台首页：问财式大搜索区 + 三栏推荐（静态示例，可后续接 RSS / 后端） */
export default function HomeHubPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [scope] = useState('资讯全域');

  const submit = () => {
    const t = query.trim();
    navigate('/news', { state: t ? { hubQuery: t } : undefined });
  };

  return (
    <>
      <style>{HUB_CSS}</style>
      <div className="hub-root">
        <section className="hub-hero">
          <div className="hub-hero-title-row">
            <span className="hub-hero-ic" aria-hidden>
              📊
            </span>
            <h1 className="hub-hero-title">Finclaw 智能资讯</h1>
          </div>
          <p className="hub-hero-sub">输入关注点，多维筛选与解读，助你快速把握脉络</p>

          <div className="hub-search-card">
            <textarea
              className="hub-search-input"
              rows={4}
              placeholder="请输入您关注的财经主题或筛选条件；多个条件可用分号隔开"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="hub-search-toolbar">
              <div className="hub-search-toolbar-left">
                <span className="hub-pill hub-pill--scope">{scope}</span>
                <button type="button" className="hub-soft-btn">
                  <span aria-hidden>🔎</span> 条件聚焦
                </button>
                <button type="button" className="hub-soft-btn" onClick={() => navigate('/news')}>
                  <span aria-hidden>⭐</span> 我的待读
                </button>
              </div>
              <button type="button" className="hub-send-btn" onClick={submit} aria-label="进入资讯">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        </section>

        <div className="hub-grid">
          <section className="hub-panel">
            <header className="hub-panel-head">
              <h2 className="hub-panel-title">今日热点</h2>
            </header>
            <div className="hub-topic-list">
              {TODAY_TOPICS.map((row) => (
                <button key={row.t} type="button" className="hub-topic-card" onClick={() => navigate('/news')}>
                  <span className="hub-topic-emoji" aria-hidden>
                    {row.icon}
                  </span>
                  <div className="hub-topic-copy">
                    <div className="hub-topic-name">{row.t}</div>
                    <div className="hub-topic-desc">{row.d}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="hub-panel hub-panel--wide">
            <header className="hub-panel-head hub-panel-head--tabs">
              <h2 className="hub-panel-title">常见问题</h2>
              <div className="hub-tabs">
                {['宏观', '市场', '公司'].map((tab, i) => (
                  <span key={tab} className={`hub-tab ${i === 1 ? 'active' : ''}`}>
                    {tab}
                  </span>
                ))}
              </div>
            </header>
            <div className="hub-queries">
              <div className="hub-queries-col">
                {QUERIES_COL_A.map((q) => (
                  <button key={q} type="button" className="hub-query-chip" onClick={() => setQuery(q)}>
                    <span aria-hidden>💬</span> {q}
                  </button>
                ))}
              </div>
              <div className="hub-queries-col">
                {QUERIES_COL_B.map((q) => (
                  <button key={q} type="button" className="hub-query-chip" onClick={() => setQuery(q)}>
                    <span aria-hidden>📌</span> {q}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="hub-panel hub-panel--events">
            <header className="hub-panel-head">
              <h2 className="hub-panel-title">关注方向</h2>
            </header>
            <div className="hub-events">
              {EVENT_CARDS.map((ev) => (
                <button
                  key={ev.title}
                  type="button"
                  className="hub-event-card"
                  style={{ ['--hub-ev' as string]: ev.tone }}
                  onClick={() => navigate('/news')}
                >
                  <span className="hub-event-title">{ev.title}</span>
                  <span className="hub-event-sub">{ev.sub}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

const TODAY_TOPICS = [
  { icon: '⚛️', t: '科技与算力', d: '景气链条与 capex 预期仍在博弈，关注季报指引。' },
  { icon: '🔋', t: '新能源', d: '排产与价格信号分化，紧盯政策与海外需求。' },
  { icon: '🏦', t: '利率与流动性', d: '海外路径与国内宽松节奏共同影响风险偏好。' },
  { icon: '🌐', t: '跨境与大宗', d: '汇率与库存周期对周期股弹性影响显著。' },
];

const QUERIES_COL_A = [
  '今日要闻里有哪些政策表述变化？',
  '海外宏观数据发布后，市场预期如何漂移？',
  '哪些赛道在资金流向上出现连续异动？',
];

const QUERIES_COL_B = [
  '把本周重要财报要点按表格汇总',
  '列表里有无明显矛盾或风险提示？',
  '从估值与景气匹配度看，哪些更值得跟踪？',
];

const EVENT_CARDS = [
  { title: '算力与应用', sub: '云 + 模型商业化', tone: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)' },
  { title: '先进制造', sub: '产业升级与出海', tone: 'linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%)' },
  { title: '消费修复', sub: '可选与必选分化', tone: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)' },
  { title: '绿色转型', sub: '政策与招投标', tone: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)' },
];

const HUB_CSS = `
.hub-root {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: clamp(20px, 3vw, 40px) clamp(20px, 4vw, 48px) 48px;
  background: var(--fc-bg-app);
  -webkit-overflow-scrolling: touch;
}

.hub-hero {
  max-width: 920px;
  margin: 0 auto 32px;
  text-align: center;
}

.hub-hero-title-row {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
}

.hub-hero-ic {
  font-size: 1.5rem;
  line-height: 1;
}

.hub-hero-title {
  font-size: clamp(1.35rem, 3vw, 1.75rem);
  font-weight: 700;
  color: var(--fc-text);
  letter-spacing: -0.02em;
  margin: 0;
}

.hub-hero-sub {
  margin: 10px 0 0;
  font-size: 14px;
  color: var(--fc-text-muted);
  line-height: 1.6;
}

.hub-search-card {
  margin-top: 28px;
  text-align: left;
  background: var(--fc-bg-raised);
  border: 1px solid var(--fc-border);
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(15, 23, 42, 0.06);
  padding: 16px 16px 12px;
  position: relative;
}

.hub-search-input {
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  font-size: 15px;
  line-height: 1.55;
  color: var(--fc-text);
  font-family: var(--fc-font-sans);
  background: transparent;
  min-height: 96px;
}

.hub-search-input::placeholder {
  color: var(--fc-text-dim);
}

.hub-search-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--fc-border);
}

.hub-search-toolbar-left {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.hub-pill {
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid var(--fc-border);
  background: var(--fc-primary-soft);
  color: var(--fc-primary);
}

.hub-soft-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid var(--fc-border);
  background: var(--fc-bg-app);
  color: var(--fc-text-secondary);
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.hub-soft-btn:hover {
  background: var(--fc-bg-muted);
  border-color: var(--fc-border-strong);
}

.hub-send-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  flex-shrink: 0;
  background: linear-gradient(145deg, var(--fc-primary) 0%, var(--fc-primary-hover) 100%);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(36, 104, 242, 0.35);
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}

.hub-send-btn:hover {
  transform: scale(1.04);
  box-shadow: 0 6px 18px rgba(36, 104, 242, 0.4);
}

.hub-grid {
  max-width: 1280px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr) minmax(0, 0.95fr);
  gap: 16px;
  align-items: start;
}

@media (max-width: 1100px) {
  .hub-grid {
    grid-template-columns: 1fr 1fr;
  }
  .hub-panel--events {
    grid-column: span 2;
  }
}

@media (max-width: 720px) {
  .hub-grid {
    grid-template-columns: 1fr;
  }
  .hub-panel--events {
    grid-column: auto;
  }
}

.hub-panel {
  background: var(--fc-bg-raised);
  border: 1px solid var(--fc-border);
  border-radius: 14px;
  padding: 16px 14px;
  box-shadow: 0 2px 12px rgba(15, 23, 42, 0.04);
}

.hub-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.hub-panel-head--tabs {
  flex-wrap: wrap;
}

.hub-panel-title {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  color: var(--fc-text);
  letter-spacing: -0.01em;
}

.hub-tabs {
  display: flex;
  gap: 4px;
  font-size: 12px;
}

.hub-tab {
  padding: 4px 10px;
  border-radius: 6px;
  color: var(--fc-text-muted);
  cursor: default;
}

.hub-tab.active {
  background: var(--fc-bg-muted);
  color: var(--fc-primary);
  font-weight: 600;
}

.hub-topic-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.hub-topic-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--fc-border);
  background: var(--fc-bg-app);
  text-align: left;
  cursor: pointer;
  font: inherit;
  color: inherit;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.hub-topic-card:hover {
  border-color: rgba(36, 104, 242, 0.25);
  box-shadow: 0 2px 10px rgba(36, 104, 242, 0.08);
}

.hub-topic-emoji {
  font-size: 22px;
  line-height: 1;
  flex-shrink: 0;
}

.hub-topic-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--fc-text);
  margin-bottom: 4px;
}

.hub-topic-desc {
  font-size: 12px;
  color: var(--fc-text-muted);
  line-height: 1.5;
}

.hub-queries {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

@media (max-width: 520px) {
  .hub-queries {
    grid-template-columns: 1fr;
  }
}

.hub-queries-col {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hub-query-chip {
  font-size: 12px;
  line-height: 1.45;
  text-align: left;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--fc-border);
  background: var(--fc-bg-app);
  color: var(--fc-text-secondary);
  cursor: pointer;
  font-family: inherit;
  transition: background 0.12s ease, border-color 0.12s ease;
}

.hub-query-chip:hover {
  background: var(--fc-primary-soft);
  border-color: rgba(36, 104, 242, 0.2);
  color: var(--fc-primary);
}

.hub-events {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.hub-event-card {
  border-radius: 12px;
  padding: 18px 16px;
  text-align: left;
  cursor: pointer;
  font: inherit;
  background: var(--hub-ev, var(--fc-bg-muted));
  border: 1px solid var(--fc-border);
  transition: transform 0.12s ease, box-shadow 0.12s ease;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 88px;
}

.hub-event-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.08);
}

.hub-event-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--fc-text);
}

.hub-event-sub {
  font-size: 12px;
  color: var(--fc-text-muted);
}
`;
