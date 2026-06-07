import { useCallback, useEffect, useMemo, useState } from 'react';
import { MarkdownContent } from '../components/MarkdownContent';
import { fetchAllRssData, fetchRssSectorData, fetchRssSources } from '../api/rss';
import { useReadGuids } from '../hooks/useReadGuids';
import type { RssData, RssItem, RssSourceIndex } from '../types/rss';
import { isProbablyHtml, stripDangerousTags } from '../utils/html';
import { rssScopedItemKey } from '../utils/rssScopedKey';
import { rssSourceDisplayLabel } from '../utils/rssSourceLabel';
import { useAiDock } from '../state/aiDock';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

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
  const [feedNonce, setFeedNonce] = useState(0);
  const dock = useAiDock();
  const { isRead, markRead, markUnread } = useReadGuids();

  useEffect(() => { dock.setListEntries(listEntries); }, [dock, listEntries]);

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

  useEffect(() => { void loadSources(); }, [loadSources]);

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
    if (!sourceName || !sector) { setListEntries([]); return; }
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
    if (feedScope === 'all') { void loadAllFeeds(); }
    else { void loadSectorFeeds(); }
  }, [feedScope, sourceName, sector, feedNonce, loadAllFeeds, loadSectorFeeds]);

  const unreadCount = useMemo(
    () => listEntries.filter((e) => !isRead(rssScopedItemKey(e.sourceName, e.sector, e.item))).length,
    [listEntries, isRead],
  );

  const onPickEntry = useCallback((entry: ListEntry) => {
    setSelected(entry);
    markRead(rssScopedItemKey(entry.sourceName, entry.sector, entry.item));
    setMobilePane('detail');
  }, [markRead]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/50 px-4">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-medium tracking-tight text-foreground/90">金融资讯</h1>
          {(sourcesLoading || listLoading) && (
            <Badge variant="outline" className="text-[10px] animate-pulse">同步中…</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && <Badge variant="secondary" className="text-xs">{unreadCount} 未读</Badge>}
          <Button variant="ghost" size="icon-sm" onClick={() => { void loadSources(); setFeedNonce((n) => n + 1); }} title="刷新">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={listLoading ? 'animate-spin' : ''}>
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mx-4 mt-3 flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5">
          <span className="text-xs text-destructive">{error}</span>
          <Button variant="ghost" size="sm" onClick={() => setError(null)} className="h-7 text-xs">关闭</Button>
        </div>
      )}

      {/* 3-Column Layout */}
      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden p-4">
        {/* Left: Source List */}
        <aside className="hidden w-[17rem] shrink-0 flex-col rounded-xl border border-border bg-card overflow-hidden md:flex">
          <div className="border-b border-border/50 px-4 py-3">
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">订阅与分组</h2>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3">
              <button
                type="button"
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${feedScope === 'all' ? 'bg-accent/80 text-foreground font-medium' : 'text-muted-foreground hover:bg-muted/60'}`}
                onClick={() => { setFeedScope('all'); setSelected(null); }}
              >
                全部待读
              </button>
              {sources.map((src) => (
                <div key={src.sourceName} className="mt-2">
                  <button
                    type="button"
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${feedScope === 'sector' && src.sourceName === sourceName ? 'bg-accent/80 text-foreground font-medium' : 'text-muted-foreground hover:bg-muted/60'}`}
                    onClick={() => { setFeedScope('sector'); setSourceName(src.sourceName); setSelected(null); }}
                  >
                    <span className={`inline-block mr-2 h-2 w-2 rounded-full ${src.health === false ? 'bg-red-500' : src.health === true ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
                    {rssSourceDisplayLabel(src)}
                  </button>
                  {feedScope === 'sector' && src.sourceName === sourceName && (
                    <div className="ml-4 mt-1 flex flex-wrap gap-1">
                      {src.sectors.map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          className={`rounded-md px-2 py-0.5 text-xs transition-colors ${sec === sector ? 'bg-primary/10 text-primary border border-primary/20' : 'text-muted-foreground hover:bg-muted/60'}`}
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
          </ScrollArea>
        </aside>

        {/* Middle: Article List */}
        <section className={`flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card overflow-hidden ${mobilePane === 'list' ? 'flex' : 'hidden md:flex'}`}>
          <div className="border-b border-border/50 px-4 py-3">
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
              {feedScope === 'all' ? '全部待读' : '分组条目'}
            </h2>
          </div>
          <ScrollArea className="flex-1">
            {listLoading ? (
              <div className="p-4 text-sm text-muted-foreground">加载中…</div>
            ) : listEntries.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                {feedScope === 'all' ? '暂无缓存文章' : '该分组下暂无文章'}
              </div>
            ) : (
              <ul>
                {listEntries.map((entry) => {
                  const k = rssScopedItemKey(entry.sourceName, entry.sector, entry.item);
                  const read = isRead(k);
                  const active = selected && rssScopedItemKey(selected.sourceName, selected.sector, selected.item) === k;
                  const it = entry.item;
                  const aiOn = dock.selectedKeys.has(k);
                  return (
                    <li key={k} className="flex items-center gap-2 border-b border-border/30 last:border-0">
                      <label className="shrink-0 pl-3" title="选入 AI 分析">
                        <input
                          type="checkbox"
                          checked={aiOn}
                          onChange={() => dock.toggleKey(k)}
                          className="h-4 w-4 rounded border-border text-violet-500 focus:ring-violet-500/30"
                        />
                      </label>
                      <button
                        type="button"
                        className={`flex min-h-[3rem] flex-1 items-center gap-2 px-3 py-2 text-left transition-colors ${active ? 'bg-accent/50' : read ? '' : 'bg-violet-500/5'} hover:bg-muted/60`}
                        onClick={() => onPickEntry(entry)}
                      >
                        {!read && <span className="h-2 w-2 shrink-0 rounded-full bg-violet-500" />}
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{it.title || '(无标题)'}</span>
                        <span className="hidden text-[10px] text-muted-foreground lg:block">{formatListMeta(entry)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
        </section>

        {/* Right: Article Detail */}
        <section className={`flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card overflow-hidden ${mobilePane === 'detail' ? 'flex' : 'hidden md:flex'}`}>
          {selected ? (
            <ArticleDetail
              entry={selected}
              read={isRead(rssScopedItemKey(selected.sourceName, selected.sector, selected.item))}
              onToggleRead={() => {
                const k = rssScopedItemKey(selected.sourceName, selected.sector, selected.item);
                if (isRead(k)) markUnread(k);
                else markRead(k);
              }}
              onBack={() => setMobilePane('list')}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="text-4xl" aria-hidden>📖</div>
              <div className="text-sm font-medium text-foreground/70">选择一篇文章</div>
              <p className="max-w-xs text-xs text-muted-foreground">从中间列表打开条目，右侧显示摘要与正文</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function formatListMeta(entry: ListEntry): string {
  const it = entry.item;
  const parts: string[] = [`${rssSourceDisplayLabel(entry)}/${entry.sector}`];
  if (it.author) parts.push(it.author);
  if (it.pubDate) parts.push(it.pubDate);
  return parts.join(' · ') || '—';
}

function ArticleDetail({ entry, read, onToggleRead, onBack }: { entry: ListEntry; read: boolean; onToggleRead: () => void; onBack?: () => void }) {
  const item = entry.item;
  return (
    <>
      {onBack && (
        <div className="border-b border-border/50 px-4 py-2 lg:hidden">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-xs">
            ← 返回列表
          </Button>
        </div>
      )}
      <ScrollArea className="flex-1">
        <article className="p-6">
          <header className="mb-4">
            <p className="mb-2 text-xs text-muted-foreground">{rssSourceDisplayLabel(entry)} · {entry.sector}</p>
            <h1 className="mb-3 text-xl font-semibold leading-snug text-foreground/90">{item.title || '(无标题)'}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={read ? 'outline' : 'default'} className="text-[10px]">{read ? '已读' : '未读'}</Badge>
              <Button variant="ghost" size="sm" onClick={onToggleRead} className="h-6 text-xs">切换已读</Button>
              {item.link && (
                <a href={item.link} target="_blank" rel="noreferrer" className="text-xs text-violet-500 hover:underline">
                  原文打开 →
                </a>
              )}
            </div>
          </header>
          <div className="border-t border-border/30 pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground/70">摘要与正文</p>
            <Description text={item.description} />
          </div>
          {item.categories?.length ? (
            <div className="mt-4 flex flex-wrap gap-1">
              {item.categories.map((c) => (
                <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>
              ))}
            </div>
          ) : null}
        </article>
      </ScrollArea>
    </>
  );
}

function Description({ text }: { text: string }) {
  if (!text?.trim()) {
    return <p className="text-sm text-muted-foreground">无摘要或正文片段。</p>;
  }
  if (isProbablyHtml(text)) {
    return (
      <div
        className="prose prose-sm max-w-none dark:prose-invert text-foreground/80 text-[13px] leading-relaxed"
        dangerouslySetInnerHTML={{ __html: stripDangerousTags(text) }}
      />
    );
  }
  return (
    <MarkdownContent size="sm" className="text-foreground/80">
      {text}
    </MarkdownContent>
  );
}