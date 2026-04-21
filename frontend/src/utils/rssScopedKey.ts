import type { RssItem } from '../types/rss';

export function rssScopedItemKey(sourceName: string, sector: string, it: RssItem): string {
  const base = it.guid || it.link || it.title;
  return `${sourceName}|${sector}|${base}`;
}
