import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fetchAllRssData, fetchRssSectorData, fetchRssSources } from '../api/rss';
import { useReadGuids } from '../hooks/useReadGuids';
import { GLOBAL_CSS } from '../styles/globalCss';
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
      <style>{GLOBAL_CSS}</style>
      <style>{RSS_READER_CSS}</style>
      <div style={layout.shell}>
        <Header
          mode="rss"
          rssRefreshing={sourcesLoading || listLoading}
          onRssRefresh={() => {
            void loadSources();
            setFeedNonce((n) => n + 1);
          }}
        />

        {error && (
          <div style={layout.errorBanner}>
            <span>{error}</span>
            <button type="button" style={layout.dismissErr} onClick={() => setError(null)}>
              关闭
            </button>
          </div>
        )}

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
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#0c0c0e',
  },
  errorBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 20px',
    background: 'rgba(248,113,113,0.1)',
    borderBottom: '1px solid rgba(248,113,113,0.25)',
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
.rss-grid {
  flex: 1;
  display: grid;
  grid-template-columns: 220px minmax(260px, 340px) 1fr;
  gap: 0;
  min-height: 0;
  border-top: 1px solid rgba(255,255,255,0.06);
}

.rss-col {
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.rss-sidebar {
  border-right: 1px solid rgba(255,255,255,0.06);
  background: rgba(12,12,14,0.98);
}

.rss-list {
  border-right: 1px solid rgba(255,255,255,0.06);
  background: #0e0e12;
}

.rss-detail {
  background: #0a0a0d;
  overflow: auto;
}

.rss-panel-title {
  font-size: 11px;
  font-family: JetBrains Mono, monospace;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #6a6a72;
  padding: 14px 16px 8px;
}

.rss-source-list {
  overflow: auto;
  flex: 1;
  padding: 0 8px 16px;
}

.rss-all-feeds {
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  margin-bottom: 10px;
  border: 1px solid rgba(91,155,213,0.25);
  border-radius: 8px;
  background: rgba(91,155,213,0.06);
  color: #9ec5ee;
  font-size: 13px;
  font-family: JetBrains Mono, monospace;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.rss-all-feeds:hover {
  background: rgba(91,155,213,0.1);
  border-color: rgba(91,155,213,0.4);
}

.rss-all-feeds.active {
  background: rgba(91,155,213,0.15);
  border-color: rgba(91,155,213,0.45);
  color: #b8d9f5;
}

.rss-source-block {
  margin-bottom: 4px;
}

.rss-source-name {
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #e4e4e8;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.rss-source-name:hover {
  background: rgba(255,255,255,0.04);
}

.rss-source-name.active {
  background: rgba(201,168,76,0.12);
  color: #e8c96a;
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
  padding: 4px 8px 12px 12px;
}

.rss-chip {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
  color: #a0a0a8;
  cursor: pointer;
  font-family: JetBrains Mono, monospace;
}

.rss-chip:hover {
  border-color: rgba(201,168,76,0.35);
  color: #c9a84c;
}

.rss-chip.active {
  border-color: rgba(201,168,76,0.5);
  background: rgba(201,168,76,0.1);
  color: #e8c96a;
}

.rss-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px 8px;
  border-bottom: 1px solid rgba(255,255,255,0.05);
}

.rss-badge {
  font-size: 11px;
  font-family: JetBrains Mono, monospace;
  color: #7a7a82;
}

.rss-article-list {
  list-style: none;
  margin: 0;
  padding: 8px;
  overflow: auto;
  flex: 1;
}

.rss-article-li {
  display: flex;
  align-items: stretch;
  gap: 2px;
  margin-bottom: 4px;
}

.rss-ai-cb-wrap {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  padding-left: 2px;
  cursor: pointer;
}

.rss-ai-checkbox {
  width: 16px;
  height: 16px;
  accent-color: #7ab8e8;
  cursor: pointer;
}

.rss-article-row {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 12px 12px 12px 10px;
  border: none;
  border-radius: 10px;
  background: rgba(255,255,255,0.02);
  color: inherit;
  text-align: left;
  cursor: pointer;
  position: relative;
  transition: background 0.15s ease;
}

.rss-article-row:hover {
  background: rgba(255,255,255,0.05);
}

.rss-article-row.active {
  background: rgba(201,168,76,0.1);
  outline: 1px solid rgba(201,168,76,0.25);
}

.rss-article-row.read .rss-article-title {
  color: #8a8a92;
}

.rss-unread-dot {
  position: absolute;
  left: 6px;
  top: 50%;
  transform: translateY(-50%);
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #5b9bd5;
  box-shadow: 0 0 8px rgba(91,155,213,0.5);
}

.rss-article-title {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.35;
  padding-left: 10px;
  width: 100%;
}

.rss-article-meta {
  font-size: 11px;
  color: #6a6a72;
  font-family: JetBrains Mono, monospace;
  padding-left: 10px;
}

.rss-pad { padding: 20px 16px; }
.rss-muted { color: #6a6a72; font-size: 13px; }

.rss-empty-detail {
  padding: 48px 32px;
  text-align: center;
}

.rss-empty-title {
  font-size: 16px;
  color: #a8a8b0;
  margin-bottom: 8px;
}

.rss-article-detail {
  padding: 24px 28px 48px;
  max-width: 720px;
}

.rss-detail-head {
  margin-bottom: 20px;
}

.rss-detail-title {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.3;
  margin-bottom: 12px;
}

.rss-detail-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.rss-read-pill {
  font-size: 11px;
  font-family: JetBrains Mono, monospace;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(74,222,128,0.12);
  color: #86efac;
}

.rss-read-pill.unread {
  background: rgba(91,155,213,0.15);
  color: #7ab8e8;
}

.rss-text-btn {
  background: none;
  border: none;
  color: #c9a84c;
  font-size: 13px;
  cursor: pointer;
  padding: 0;
  font-family: inherit;
}

.rss-text-btn.link {
  text-decoration: none;
  border-bottom: 1px solid rgba(201,168,76,0.35);
}

.rss-feed-line {
  font-size: 12px;
  font-family: JetBrains Mono, monospace;
  color: #7a7a82;
  margin-bottom: 10px;
}

.rss-body-label {
  font-size: 11px;
  font-family: JetBrains Mono, monospace;
  color: #6a6a72;
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.rss-body {
  font-size: 15px;
  line-height: 1.65;
  color: #d8d8de;
}

.rss-html {
  word-break: break-word;
}
.rss-html img { max-width: 100%; height: auto; border-radius: 8px; }
.rss-html a { color: #c9a84c; }
.rss-html p { margin-bottom: 12px; }

.rss-md p { margin-bottom: 12px; }
.rss-md a { color: #c9a84c; }

.rss-tags {
  margin-top: 24px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.rss-tag {
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 6px;
  background: rgba(255,255,255,0.05);
  color: #9a9aa2;
}

.rss-back-mobile {
  display: none;
  margin: 12px 16px 0;
  padding: 8px 12px;
  width: calc(100% - 32px);
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.04);
  color: #c9a84c;
  cursor: pointer;
  font-size: 13px;
}

@media (max-width: 960px) {
  .rss-grid {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr 1fr;
  }
  .rss-sidebar {
    border-right: none;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    max-height: 200px;
  }
  .rss-list {
    border-right: none;
    min-height: 200px;
  }
  .hide-mobile { display: none !important; }
  .show-mobile { display: flex !important; }
  .rss-back-mobile { display: block; }
}
`;
