import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fetchAllRssData, fetchRssSectorData, fetchRssSources } from '../api/rss';
import { useReadGuids } from '../hooks/useReadGuids';
import type { RssData, RssItem, RssSourceIndex } from '../types/rss';
import { isProbablyHtml, stripDangerousTags } from '../utils/html';
import { rssScopedItemKey } from '../utils/rssScopedKey';
import { rssSourceDisplayLabel } from '../utils/rssSourceLabel';
import { Header } from '../components/Header';
import { useAiDock } from '../state/aiDock';

type FeedScope = 'all' | 'sector';

type ListEntry = { sourceName: string; sourceDisplayName?: string; sector: string; item: RssItem };

function sortItems(items: RssItem[]): RssItem[] {
  return [...items].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

function flattenAllData(bundles: RssData[]): ListEntry[] {
  const entries: ListEntry[] = [];
  for (const b of bundles) {
    const sn = b.sourceName ?? '';
    const sec = b.sector ?? '';
    const sd = rssSourceDisplayLabel({ sourceName: sn, sourceDisplayName: b.sourceDisplayName });
    for (const it of b.items ?? []) {
      entries.push({ sourceName: sn, sourceDisplayName: sd, sector: sec, item: it });
    }
  }
  entries.sort((a, b) => (b.item.timestamp || 0) - (a.item.timestamp || 0));
  return entries;
}

export default function RssReaderPage() {
  const [feedScope, setFeedScope] = useState<FeedScope>('all');
  const [sources, setSources] = useState<RssSourceIndex[]>([]);
  const [sourceName, setSourceName] = useState<string>('');
  const [sector, setSector] = useState<string>('');
  const [listEntries, setListEntries] = useState<ListEntry[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ListEntry | null>(null);
  const [mobilePane, setMobilePane] = useState<'list' | 'detail'>('list');
  /** Bumps when user clicks refresh to refetch current feed even if source/sector unchanged. */
  const [feedNonce, setFeedNonce] = useState(0);
  const dock = useAiDock();

  const { isRead, markRead, markUnread } = useReadGuids();

  useEffect(() => {
    dock.setListEntries(listEntries);
  }, [dock, listEntries]);

  const loadSources = useCallback(async () => {
    setSourcesLoading(true);
    setError(null);
    try {
      const list = await fetchRssSources();
      setSources(list);
      setSourceName((prev) => {
        if (prev && list.some((s) => s.sourceName === prev)) return prev;
        return list[0]?.sourceName ?? '';
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSourcesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  useEffect(() => {
    if (feedScope !== 'sector') return;
    if (!sourceName || !sources.length) return;
    const src = sources.find((s) => s.sourceName === sourceName);
    if (!src) return;
    setSector((prev) => (prev && src.sectors.includes(prev) ? prev : src.sectors[0] ?? ''));
  }, [sources, sourceName, feedScope]);

  const loadAllFeeds = useCallback(async () => {
    setListLoading(true);
    setError(null);
    try {
      const bundles = await fetchAllRssData();
      setListEntries(flattenAllData(bundles));
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadSectorFeeds = useCallback(async () => {
    if (!sourceName || !sector) {
      setListEntries([]);
      return;
    }
    setListLoading(true);
    setError(null);
    try {
      const data = await fetchRssSectorData(sourceName, sector);
      const sorted = sortItems(data?.items ?? []);
      const sd = rssSourceDisplayLabel({ sourceName, sourceDisplayName: data?.sourceDisplayName });
      setListEntries(sorted.map((it) => ({ sourceName, sourceDisplayName: sd, sector, item: it })));
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setListLoading(false);
    }
  }, [sourceName, sector]);

  useEffect(() => {
    if (feedScope === 'all') {
      void loadAllFeeds();
    } else {
      void loadSectorFeeds();
    }
  }, [feedScope, sourceName, sector, feedNonce, loadAllFeeds, loadSectorFeeds]);

  const unreadCount = useMemo(
    () => listEntries.filter((e) => !isRead(rssScopedItemKey(e.sourceName, e.sector, e.item))).length,
    [listEntries, isRead],
  );

  const onPickEntry = useCallback(
    (entry: ListEntry) => {
      setSelected(entry);
      markRead(rssScopedItemKey(entry.sourceName, entry.sector, entry.item));
      setMobilePane('detail');
    },
    [markRead],
  );

  return (
    <>
      <style>{RSS_READER_CSS}</style>
      <div style={layout.shell}>
        <Header
          mode="rss"
          showBranding={false}
          rssRefreshing={sourcesLoading || listLoading}
          onRssRefresh={() => {
            void loadSources();
            setFeedNonce((n) => n + 1);
          }}
        />

        {error && (
          <div style={layout.errorWrap}>
            <div style={layout.errorBanner}>
              <span>{error}</span>
              <button type="button" style={layout.dismissErr} onClick={() => setError(null)}>
                关闭
              </button>
            </div>
          </div>
        )}

        <div className="rss-workspace">
          <div className="rss-grid">
          <aside className="rss-col rss-sidebar">
            <div className="rss-panel-title">订阅与分组</div>
            {sourcesLoading ? (
              <div className="rss-muted">加载中…</div>
            ) : sources.length === 0 ? (
              <div className="rss-muted">暂无订阅源，请检查后端配置。</div>
            ) : (
              <div className="rss-source-list">
                <button
                  type="button"
                  className={`rss-all-feeds ${feedScope === 'all' ? 'active' : ''}`}
                  onClick={() => {
                    setFeedScope('all');
                    setSelected(null);
                  }}
                >
                  全部待读
                </button>
                {sources.map((src) => (
                  <div key={src.sourceName} className="rss-source-block">
                    <button
                      type="button"
                      className={`rss-source-name ${feedScope === 'sector' && src.sourceName === sourceName ? 'active' : ''}`}
                      onClick={() => {
                        setFeedScope('sector');
                        setSourceName(src.sourceName);
                        setSector(src.sectors[0] ?? '');
                      }}
                      title={src.url || rssSourceDisplayLabel(src)}
                    >
                      <span
                        className={`rss-health-dot ${src.health === false ? 'bad' : src.health === true ? 'ok' : 'unknown'}`}
                        aria-hidden
                        title={
                          src.health === false
                            ? '最近一次抓取失败'
                            : src.health === true
                              ? '抓取正常'
                              : '健康状态未知'
                        }
                      />
                      {rssSourceDisplayLabel(src)}
                    </button>
                    {feedScope === 'sector' && src.sourceName === sourceName && (
                      <div className="rss-sector-chips">
                        {src.sectors.map((sec) => (
                          <button
                            type="button"
                            key={sec}
                            className={`rss-chip ${sec === sector ? 'active' : ''}`}
                            onClick={() => setSector(sec)}
                          >
                            {sec}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </aside>

          <section className={`rss-col rss-list ${mobilePane === 'list' ? 'show-mobile' : 'hide-mobile'}`}>
            <div className="rss-list-header">
              <span className="rss-panel-title">{feedScope === 'all' ? '全部待读' : '分组条目'}</span>
              <span className="rss-badge">{unreadCount} 未读</span>
            </div>
            {listLoading ? (
              <div className="rss-muted rss-pad">加载条目…</div>
            ) : listEntries.length === 0 ? (
              <div className="rss-muted rss-pad">
                {feedScope === 'all' ? '暂无缓存文章，请确认后端已抓取 RSS。' : '该分组下暂无文章。'}
              </div>
            ) : (
              <ul className="rss-article-list">
                {listEntries.map((entry) => {
                  const k = rssScopedItemKey(entry.sourceName, entry.sector, entry.item);
                  const read = isRead(k);
                  const active =
                    selected &&
                    rssScopedItemKey(selected.sourceName, selected.sector, selected.item) === k;
                  const it = entry.item;
                  const aiOn = dock.selectedKeys.has(k);
                  return (
                    <li key={k} className="rss-article-li">
                      <label className="rss-ai-cb-wrap" title="选入 AI 分析">
                        <input
                          type="checkbox"
                          className="rss-ai-checkbox"
                          checked={aiOn}
                          onChange={() => dock.toggleKey(k)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </label>
                      <button
                        type="button"
                        className={`rss-article-row ${active ? 'active' : ''} ${read ? 'read' : ''}`}
                        onClick={() => onPickEntry(entry)}
                      >
                        {!read && <span className="rss-unread-dot" aria-hidden />}
                        <span className="rss-article-title">{it.title || '(无标题)'}</span>
                        <span className="rss-article-meta">{formatListMeta(entry)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className={`rss-col rss-detail ${mobilePane === 'detail' ? 'show-mobile' : 'hide-mobile'}`}>
            <button type="button" className="rss-back-mobile" onClick={() => setMobilePane('list')}>
              ← 返回列表
            </button>
            {selected ? (
              <ArticleDetail
                entry={selected}
                read={isRead(rssScopedItemKey(selected.sourceName, selected.sector, selected.item))}
                onToggleRead={() => {
                  const k = rssScopedItemKey(selected.sourceName, selected.sector, selected.item);
                  if (isRead(k)) markUnread(k);
                  else markRead(k);
                }}
              />
            ) : (
              <div className="rss-empty-detail">
                <div className="rss-empty-title">选择一篇文章</div>
                <p className="rss-muted">从中间列表打开条目，右侧显示摘要与正文。</p>
              </div>
            )}
          </section>
        </div>
        </div>
      </div>
    </>
  );
}

function formatListMeta(entry: ListEntry): string {
  const it = entry.item;
  const parts: string[] = [`${rssSourceDisplayLabel(entry)}/${entry.sector}`];
  if (it.author) parts.push(it.author);
  if (it.pubDate) parts.push(it.pubDate);
  return parts.join(' · ') || '—';
}

function ArticleDetail({
  entry,
  read,
  onToggleRead,
}: {
  entry: ListEntry;
  read: boolean;
  onToggleRead: () => void;
}) {
  const item = entry.item;
  return (
    <article className="rss-article-detail">
      <header className="rss-detail-head">
        <p className="rss-feed-line">
          {rssSourceDisplayLabel(entry)} · {entry.sector}
        </p>
        <h1 className="rss-detail-title">{item.title || '(无标题)'}</h1>
        <div className="rss-detail-actions">
          <span className={`rss-read-pill ${read ? '' : 'unread'}`}>{read ? '已读' : '未读'}</span>
          <button type="button" className="rss-text-btn" onClick={onToggleRead}>
            切换已读
          </button>
          {item.link ? (
            <a className="rss-text-btn link" href={item.link} target="_blank" rel="noreferrer">
              原文打开
            </a>
          ) : null}
        </div>
      </header>

      <div className="rss-body-label">摘要与正文</div>
      <div className="rss-body">
        <Description text={item.description} />
      </div>

      {item.categories?.length ? (
        <div className="rss-tags">
          {item.categories.map((c) => (
            <span key={c} className="rss-tag">
              {c}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function Description({ text }: { text: string }) {
  if (!text?.trim()) {
    return <p className="rss-muted">无摘要或正文片段。</p>;
  }
  if (isProbablyHtml(text)) {
    return (
      <div
        className="rss-html"
        dangerouslySetInnerHTML={{ __html: stripDangerousTags(text) }}
      />
    );
  }
  return (
    <div className="rss-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

const layout: Record<string, React.CSSProperties> = {
  shell: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: 'var(--fc-bg-app)',
  },
  errorWrap: {
    flexShrink: 0,
    padding: '8px var(--fc-page-pad-x) 0',
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '12px 16px',
    background: 'rgba(248,113,113,0.1)',
    border: '1px solid rgba(248,113,113,0.28)',
    borderRadius: 12,
    color: '#f87171',
    fontSize: 13,
  },
  dismissErr: {
    background: 'transparent',
    border: '1px solid rgba(248,113,113,0.4)',
    color: '#f87171',
    borderRadius: 6,
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: 12,
  },
};

const RSS_READER_CSS = `
.rss-workspace {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0 var(--fc-page-pad-x) var(--fc-page-pad-y);
  overflow: hidden;
}

.rss-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(232px, 17vw) minmax(292px, 380px) minmax(0, 1fr);
  gap: 14px;
  align-items: stretch;
}

@media (min-width: 1440px) {
  .rss-grid {
    grid-template-columns: 276px 384px minmax(0, 1fr);
    gap: 16px;
  }
}

.rss-col {
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-radius: var(--fc-radius-lg);
  border: 1px solid var(--fc-border);
  background: var(--fc-bg-raised);
  box-shadow: 0 2px 14px rgba(15, 23, 42, 0.05);
}

.rss-sidebar {
  background: var(--fc-bg-panel);
}

.rss-list {
  background: var(--fc-bg-raised);
}

.rss-detail {
  background: var(--fc-bg-raised);
  overflow: auto;
  -webkit-overflow-scrolling: touch;
}

.rss-panel-title {
  font-size: 10px;
  font-family: var(--fc-font-mono);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--fc-text-dim);
  padding: 14px 16px 10px;
  font-weight: 500;
  margin: 0;
}

.rss-sidebar > .rss-panel-title {
  position: sticky;
  top: 0;
  z-index: 4;
  background: rgba(249, 250, 252, 0.96);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--fc-border);
  flex-shrink: 0;
}

.rss-source-list {
  overflow: auto;
  flex: 1;
  padding: 6px 12px 16px;
  min-height: 0;
}

.rss-all-feeds {
  width: 100%;
  text-align: left;
  padding: 11px 14px;
  margin-bottom: 12px;
  border: 1px solid rgba(36,104,242,0.2);
  border-radius: 10px;
  background: var(--fc-primary-soft);
  color: var(--fc-primary);
  font-size: var(--fc-type-small);
  font-family: var(--fc-font-mono);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.rss-all-feeds:hover {
  background: #dbeafe;
  border-color: rgba(36,104,242,0.35);
}

.rss-all-feeds.active {
  background: rgba(36,104,242,0.12);
  border-color: rgba(36,104,242,0.45);
  color: var(--fc-primary-hover);
}

.rss-source-block {
  margin-bottom: 6px;
}

.rss-source-name {
  width: 100%;
  text-align: left;
  padding: 11px 14px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--fc-text);
  font-size: var(--fc-type-small);
  cursor: pointer;
  transition: background 0.15s ease;
  line-height: 1.35;
}

.rss-source-name:hover {
  background: var(--fc-bg-muted);
}

.rss-source-name.active {
  background: var(--fc-primary-soft);
  color: var(--fc-primary);
}

.rss-health-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  margin-right: 8px;
  vertical-align: middle;
  flex-shrink: 0;
}
.rss-health-dot.ok { background: #4ade80; box-shadow: 0 0 6px rgba(74,222,128,0.45); }
.rss-health-dot.bad { background: #f87171; box-shadow: 0 0 6px rgba(248,113,113,0.45); }
.rss-health-dot.unknown { background: #5a5a5e; }

.rss-sector-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 2px 8px 14px 14px;
}

.rss-chip {
  font-size: 11px;
  padding: 5px 11px;
  border-radius: 999px;
  border: 1px solid var(--fc-border-strong);
  background: var(--fc-bg-app);
  color: var(--fc-text-muted);
  cursor: pointer;
  font-family: var(--fc-font-mono);
}

.rss-chip:hover {
  border-color: rgba(36,104,242,0.3);
  color: var(--fc-primary);
}

.rss-chip.active {
  border-color: rgba(36,104,242,0.45);
  background: var(--fc-primary-soft);
  color: var(--fc-primary);
}

.rss-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 13px 16px 11px;
  border-bottom: 1px solid var(--fc-border);
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 4;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.rss-list-header .rss-panel-title {
  padding: 0;
  text-transform: none;
  letter-spacing: -0.02em;
  font-size: var(--fc-type-title);
  font-weight: 650;
  color: var(--fc-text);
  font-family: var(--fc-font-sans);
}

.rss-badge {
  font-size: 11px;
  font-family: var(--fc-font-mono);
  color: var(--fc-text-secondary);
  padding: 5px 11px;
  border-radius: 999px;
  border: 1px solid var(--fc-border);
  background: var(--fc-bg-muted);
  white-space: nowrap;
}

.rss-article-list {
  list-style: none;
  margin: 0;
  padding: 10px 12px 14px;
  overflow: auto;
  flex: 1;
  min-height: 0;
}

.rss-article-li {
  display: flex;
  align-items: stretch;
  gap: 4px;
  margin-bottom: 6px;
}

.rss-ai-cb-wrap {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  padding-left: 2px;
  cursor: pointer;
}

.rss-ai-checkbox {
  width: 16px;
  height: 16px;
  accent-color: var(--fc-accent-blue-soft);
  cursor: pointer;
}

.rss-article-row {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
  padding: 13px 14px 13px 12px;
  border: none;
  border-radius: var(--fc-radius-md);
  background: var(--fc-bg-app);
  color: inherit;
  text-align: left;
  cursor: pointer;
  position: relative;
  transition: background 0.15s ease, box-shadow 0.15s ease;
}

.rss-article-row:hover {
  background: var(--fc-bg-muted);
}

.rss-article-row.active {
  background: var(--fc-primary-soft);
  box-shadow: inset 0 0 0 1px rgba(36,104,242,0.22);
}

.rss-article-row.read .rss-article-title {
  color: var(--fc-text-muted);
}

.rss-unread-dot {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--fc-primary);
  box-shadow: 0 0 8px rgba(36,104,242,0.45);
}

.rss-article-title {
  font-size: var(--fc-type-small);
  font-weight: 600;
  line-height: 1.45;
  padding-left: 12px;
  width: 100%;
  color: var(--fc-text);
}

.rss-article-meta {
  font-size: 11px;
  color: var(--fc-text-muted);
  font-family: var(--fc-font-mono);
  padding-left: 12px;
  line-height: 1.4;
}

.rss-muted { color: var(--fc-text-muted); font-size: var(--fc-type-small); line-height: 1.55; }
.rss-pad { padding: 20px 16px; }

.rss-empty-detail {
  padding: min(12vh, 64px) clamp(20px, 4vw, 40px);
  text-align: center;
  max-width: 400px;
  margin: 0 auto;
}

.rss-empty-title {
  font-size: 18px;
  font-weight: 650;
  color: var(--fc-text-secondary);
  margin-bottom: 10px;
  letter-spacing: -0.02em;
}

.rss-article-detail {
  padding: clamp(24px, 4vw, 36px) clamp(20px, 3.5vw, 44px) 56px;
  max-width: 720px;
  margin: 0 auto;
  width: 100%;
}

.rss-detail-head {
  margin-bottom: 24px;
}

.rss-detail-title {
  font-size: clamp(1.35rem, 2.8vw, 1.75rem);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.28;
  margin-bottom: 16px;
  color: var(--fc-text);
}

.rss-detail-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.rss-read-pill {
  font-size: 11px;
  font-family: var(--fc-font-mono);
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(74,222,128,0.12);
  color: #86efac;
}

.rss-read-pill.unread {
  background: rgba(36,104,242,0.1);
  color: var(--fc-primary);
}

.rss-text-btn {
  background: none;
  border: none;
  color: var(--fc-primary);
  font-size: var(--fc-type-small);
  cursor: pointer;
  padding: 0;
  font-family: inherit;
}

.rss-text-btn.link {
  text-decoration: none;
  border-bottom: 1px solid rgba(36,104,242,0.35);
}

.rss-feed-line {
  font-size: var(--fc-type-caption);
  font-family: var(--fc-font-mono);
  color: var(--fc-text-muted);
  margin-bottom: 12px;
  line-height: 1.45;
}

.rss-body-label {
  font-size: 10px;
  font-family: var(--fc-font-mono);
  color: var(--fc-text-dim);
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.rss-body {
  font-size: var(--fc-type-body);
  line-height: 1.75;
  color: var(--fc-text-secondary);
}

.rss-html {
  word-break: break-word;
}
.rss-html img { max-width: 100%; height: auto; border-radius: 10px; }
.rss-html a { color: var(--fc-primary); }
.rss-html p { margin-bottom: 14px; }

.rss-md p { margin-bottom: 14px; }
.rss-md a { color: var(--fc-primary); }

.rss-tags {
  margin-top: 28px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.rss-tag {
  font-size: var(--fc-type-caption);
  padding: 5px 11px;
  border-radius: 8px;
  background: var(--fc-bg-muted);
  color: var(--fc-text-muted);
}

.rss-back-mobile {
  display: none;
  margin: 12px 16px 0;
  padding: 10px 14px;
  width: calc(100% - 32px);
  border-radius: 10px;
  border: 1px solid var(--fc-border);
  background: var(--fc-bg-app);
  color: var(--fc-primary);
  cursor: pointer;
  font-size: var(--fc-type-small);
  font-weight: 500;
}

@media (max-width: 960px) {
  .rss-workspace {
    padding: 0 12px 12px;
  }
  .rss-grid {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(200px, 38vh) minmax(260px, 1fr);
    gap: 10px;
  }
  .rss-col {
    border-radius: 14px;
  }
  .rss-sidebar {
    max-height: min(220px, 32vh);
  }
  .rss-list {
    min-height: 180px;
  }
  .hide-mobile { display: none !important; }
  .show-mobile { display: flex !important; }
  .rss-back-mobile { display: block; }
}
`;
