import { canAnalyzeBacktest, type BacktestAnalysisTarget } from './strategyPlatforms.ts';

export type MentionRun = BacktestAnalysisTarget & {
  createdAt?: string;
};

export type BacktestMention = {
  start: number;
  end: number;
  query: string;
};

function isAt(ch: string | undefined): boolean {
  return ch === '@' || ch === '\uFF20';
}

/** Active @ token ending at the caret. The @ must start the text or follow whitespace. */
export function findBacktestMention(value: string, cursor: number): BacktestMention | null {
  const end = Math.max(0, Math.min(cursor, value.length));
  let at = -1;
  for (let i = end - 1; i >= 0; i -= 1) {
    const ch = value[i];
    if (isAt(ch)) {
      at = i;
      break;
    }
    if (/\s/.test(ch)) return null;
  }
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(value[at - 1])) return null;
  return { start: at, end, query: value.slice(at + 1, end) };
}

export function mentionKey(mention: BacktestMention): string {
  return `${mention.start}:${mention.query}`;
}

/** Drop the @query and collapse the space it sat between. */
export function removeBacktestMention(value: string, mention: BacktestMention): { value: string; cursor: number } {
  let next = value.slice(0, mention.start) + value.slice(mention.end);
  const cursor = mention.start;
  if (cursor > 0 && next[cursor - 1] === ' ' && next[cursor] === ' ') {
    next = next.slice(0, cursor) + next.slice(cursor + 1);
  }
  return { value: next, cursor };
}

export function mentionableBacktests(
  items: Array<{ id: string; name?: string | null; status: string; created_at?: string | null }>,
  displayName: (item: { name?: string | null }) => string,
): MentionRun[] {
  return items
    .filter((item) => canAnalyzeBacktest(item.status))
    .slice()
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    .map((item) => ({
      id: item.id,
      name: displayName(item) || item.id,
      status: item.status,
      createdAt: item.created_at || undefined,
    }));
}

export function filterMentionRuns(runs: MentionRun[], query: string): MentionRun[] {
  const q = query.trim().toLowerCase();
  if (!q) return runs;
  return runs.filter((run) => run.name.toLowerCase().includes(q));
}
