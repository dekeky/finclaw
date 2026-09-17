import type { MarketSymbol } from '@/api/backtest';

export type CustomUniverse = {
  id: string;
  name: string;
  symbols: MarketSymbol[];
};

type KVStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const STORAGE_KEY = 'finclaw.customUniverses';
const CODE_RE = /(?:(?:SH|SZ|BJ|SS)[-.]?)?(\d{6})(?:\.(?:SH|SZ|BJ|SS|XSHG|XSHE|XBEI))?/i;
const SPLIT_RE = /[\s,，;；|、]+/;

let storageOverride: KVStore | null = null;

export function setCustomUniverseStorage(store: KVStore | null): void {
  storageOverride = store;
}

function store(): KVStore {
  if (storageOverride) return storageOverride;
  if (typeof localStorage !== 'undefined') return localStorage;
  return { getItem: () => null, setItem: () => {} };
}

export function normalizeStockCode(token: string): string | null {
  const raw = token.trim().replace(/^['"]+|['"]+$/g, '');
  if (!raw) return null;
  const compact = raw.toUpperCase().replace(/^(SH|SZ|BJ|SS)[-.]?/, '$1');
  const prefixed = compact.match(/^(?:SH|SZ|BJ|SS)(\d{6})$/);
  if (prefixed) return prefixed[1];
  const suffixed = compact.match(/^(\d{6})(?:\.(?:SH|SZ|BJ|SS|XSHG|XSHE|XBEI))?$/);
  if (suffixed) return suffixed[1];
  if (/^\d{6}$/.test(compact)) return compact;
  const fallback = compact.match(CODE_RE);
  return fallback ? fallback[1] : null;
}

export function parsePastedCodes(raw: string): string[] {
  const tokens = raw.split(SPLIT_RE).map((part) => part.trim()).filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const code = normalizeStockCode(token);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

export function looksLikeCodeList(raw: string): boolean {
  const codes = parsePastedCodes(raw);
  if (codes.length >= 2) return true;
  if (codes.length === 1 && SPLIT_RE.test(raw.trim())) return true;
  return false;
}

export function resolvePastedSymbols(
  raw: string,
  catalog: MarketSymbol[],
): { matched: MarketSymbol[]; unknown: string[] } {
  const byCode = new Map(catalog.map((item) => [item.code, item]));
  const matched: MarketSymbol[] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (const code of parsePastedCodes(raw)) {
    if (seen.has(code)) continue;
    seen.add(code);
    const item = byCode.get(code);
    if (!item) {
      unknown.push(code);
      continue;
    }
    matched.push(item);
  }
  return { matched, unknown };
}

function asPools(value: unknown): CustomUniverse[] {
  if (!Array.isArray(value)) return [];
  const out: CustomUniverse[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    const id = typeof rec.id === 'string' ? rec.id.trim() : '';
    const name = typeof rec.name === 'string' ? rec.name.trim() : '';
    if (!id || !name) continue;
    const symbols = Array.isArray(rec.symbols) ? rec.symbols : [];
    const items: MarketSymbol[] = [];
    for (const symbol of symbols) {
      if (!symbol || typeof symbol !== 'object') continue;
      const item = symbol as Record<string, unknown>;
      if (typeof item.code !== 'string' || !item.code.trim()) continue;
      items.push({
        code: item.code.trim(),
        name: typeof item.name === 'string' && item.name.trim() ? item.name : item.code,
        market: typeof item.market === 'string' ? item.market : '',
        kind: item.kind === 'index' ? 'index' : 'stock',
      });
    }
    out.push({ id, name, symbols: items });
  }
  return out;
}

export function loadCustomUniverses(): CustomUniverse[] {
  try {
    const raw = store().getItem(STORAGE_KEY);
    if (!raw) return [];
    return asPools(JSON.parse(raw));
  } catch {
    return [];
  }
}

function persist(pools: CustomUniverse[]): void {
  try {
    store().setItem(STORAGE_KEY, JSON.stringify(pools));
  } catch {
    // ignore quota / private mode
  }
}

function nextId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `pool_${Date.now()}`;
}

export function saveCustomUniverse(input: {
  id?: string;
  name: string;
  symbols: MarketSymbol[];
}): CustomUniverse {
  const name = input.name.trim();
  if (!name) throw new Error('请填写股票池名称');
  const symbols = input.symbols.filter((item) => item?.code);
  const pools = loadCustomUniverses();
  const byId = input.id ? pools.findIndex((row) => row.id === input.id) : -1;
  const byName = pools.findIndex((row) => row.name === name);
  const index = byId >= 0 ? byId : byName;
  const saved: CustomUniverse = {
    id: index >= 0 ? pools[index].id : nextId(),
    name,
    symbols,
  };
  if (index >= 0) pools[index] = saved;
  else pools.push(saved);
  persist(pools);
  return saved;
}

export function deleteCustomUniverse(id: string): void {
  persist(loadCustomUniverses().filter((row) => row.id !== id));
}

export function nextCustomUniverseName(pools: CustomUniverse[] = loadCustomUniverses()): string {
  const used = new Set(pools.map((row) => row.name));
  for (let i = 1; i < 1000; i += 1) {
    const name = `股票池 ${i}`;
    if (!used.has(name)) return name;
  }
  return '股票池';
}
