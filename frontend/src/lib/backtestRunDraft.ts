import type { MarketSymbol, UniverseKind } from '@/api/backtest';

const STORAGE_KEY = 'finclaw.backtestRunDraft';

export type BacktestRunParams = {
  initial_cash: string;
  start_time: string;
  end_time: string;
  commission_pct: string;
  min_commission: string;
  stamp_pct: string;
  transfer_pct: string;
  slippage_pct: string;
};

export type BacktestRunDraft = {
  params: BacktestRunParams;
  tab: UniverseKind;
  indexCode: string;
  picked: MarketSymbol[];
};

export const DEFAULT_BACKTEST_RUN_PARAMS: BacktestRunParams = {
  initial_cash: '100000',
  start_time: '2020-01-01',
  end_time: '2023-12-31',
  commission_pct: '0.03',
  min_commission: '5',
  stamp_pct: '0.1',
  transfer_pct: '0.001',
  slippage_pct: '0.02',
};

const UNIVERSE_TABS: UniverseKind[] = ['picks', 'index', 'all'];

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function asPicked(value: unknown): MarketSymbol[] {
  if (!Array.isArray(value)) return [];
  const items: MarketSymbol[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    if (typeof rec.code !== 'string' || !rec.code.trim()) continue;
    items.push({
      code: rec.code,
      name: typeof rec.name === 'string' && rec.name.trim() ? rec.name : rec.code,
      market: typeof rec.market === 'string' ? rec.market : '',
      kind: rec.kind === 'index' ? 'index' : 'stock',
    });
  }
  return items;
}

export function emptyBacktestRunDraft(): BacktestRunDraft {
  return {
    params: { ...DEFAULT_BACKTEST_RUN_PARAMS },
    tab: 'picks',
    indexCode: '000300',
    picked: [],
  };
}

export function loadBacktestRunDraft(): BacktestRunDraft {
  const fallback = emptyBacktestRunDraft();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<BacktestRunDraft> | null;
    if (!parsed || typeof parsed !== 'object') return fallback;
    const src = (parsed.params ?? {}) as Partial<BacktestRunParams>;
    const tab = UNIVERSE_TABS.includes(parsed.tab as UniverseKind) ? (parsed.tab as UniverseKind) : fallback.tab;
    return {
      params: {
        initial_cash: asString(src.initial_cash, fallback.params.initial_cash),
        start_time: asString(src.start_time, fallback.params.start_time),
        end_time: asString(src.end_time, fallback.params.end_time),
        commission_pct: asString(src.commission_pct, fallback.params.commission_pct),
        min_commission: asString(src.min_commission, fallback.params.min_commission),
        stamp_pct: asString(src.stamp_pct, fallback.params.stamp_pct),
        transfer_pct: asString(src.transfer_pct, fallback.params.transfer_pct),
        slippage_pct: asString(src.slippage_pct, fallback.params.slippage_pct),
      },
      tab,
      indexCode: asString(parsed.indexCode, fallback.indexCode) || fallback.indexCode,
      picked: asPicked(parsed.picked),
    };
  } catch {
    return fallback;
  }
}

export function saveBacktestRunDraft(draft: BacktestRunDraft): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // ignore quota / private mode
  }
}
