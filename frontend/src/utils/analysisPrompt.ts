import type { RssItem } from '../types/rss';
import { rssSourceDisplayLabel } from './rssSourceLabel';

export type EntryForAnalysis = {
  sourceName: string;
  sourceDisplayName?: string;
  sector: string;
  item: RssItem;
};

export function buildAnalysisUserMessage(question: string, entries: EntryForAnalysis[]): string {
  const q = question.trim();
  const withLinks = entries.filter((e) => e.item.link?.trim());
  if (withLinks.length === 0) return q;
  const linkBlock = withLinks
    .map((e, i) => {
      const src = rssSourceDisplayLabel(e);
      return `${i + 1}. [${src} · ${e.sector}] ${e.item.title || '(无标题)'}\n   ${e.item.link!.trim()}`;
    })
    .join('\n');
  return `【用户问题】\n${q}\n\n【以下是与分析相关的文章原文链接（请结合标题与链接理解上下文）】\n${linkBlock}`;
}
