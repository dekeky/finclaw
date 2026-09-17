import assert from 'node:assert/strict';
import test from 'node:test';
import type { MarketSymbol } from '../api/backtest.ts';
import {
  deleteCustomUniverse,
  looksLikeCodeList,
  loadCustomUniverses,
  nextCustomUniverseName,
  parsePastedCodes,
  resolvePastedSymbols,
  saveCustomUniverse,
  setCustomUniverseStorage,
} from './customUniverses.ts';

function memoryStore() {
  const data = new Map<string, string>();
  return {
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
}

test.afterEach(() => {
  setCustomUniverseStorage(null);
});

const catalog: MarketSymbol[] = [
  { code: '600000', name: '浦发银行', market: 'SH', kind: 'stock' },
  { code: '000001', name: '平安银行', market: 'SZ', kind: 'stock' },
  { code: '300750', name: '宁德时代', market: 'SZ', kind: 'stock' },
];

test('parses pasted codes across separators and market prefixes', () => {
  assert.deepEqual(parsePastedCodes('600000,000001 300750'), ['600000', '000001', '300750']);
  assert.deepEqual(parsePastedCodes('sh600000，SZ000001;300750.SZ'), ['600000', '000001', '300750']);
  assert.deepEqual(parsePastedCodes('600000.XSHG\n000001.XSHE'), ['600000', '000001']);
  assert.deepEqual(parsePastedCodes('600000, 600000, 000001'), ['600000', '000001']);
});

test('treats multi-code paste as a list, not a search query', () => {
  assert.equal(looksLikeCodeList('浦发'), false);
  assert.equal(looksLikeCodeList('600000'), false);
  assert.equal(looksLikeCodeList('600000,000001'), true);
  assert.equal(looksLikeCodeList('600000 000001'), true);
});

test('resolves pasted codes against the catalog and reports unknowns', () => {
  const result = resolvePastedSymbols('600000, 999999, sz000001', catalog);
  assert.deepEqual(
    result.matched.map((row) => row.code),
    ['600000', '000001'],
  );
  assert.deepEqual(result.unknown, ['999999']);
});

test('saves named universes and overwrites by id or same name', () => {
  setCustomUniverseStorage(memoryStore());
  const created = saveCustomUniverse({
    name: '银行股',
    symbols: [catalog[0], catalog[1]],
  });
  assert.equal(created.name, '银行股');
  assert.equal(loadCustomUniverses().length, 1);

  const renamed = saveCustomUniverse({
    id: created.id,
    name: '银行核心',
    symbols: [catalog[0]],
  });
  assert.equal(renamed.id, created.id);
  assert.equal(loadCustomUniverses()[0].name, '银行核心');
  assert.equal(loadCustomUniverses()[0].symbols.length, 1);

  saveCustomUniverse({
    name: '银行核心',
    symbols: catalog,
  });
  assert.equal(loadCustomUniverses().length, 1);
  assert.equal(loadCustomUniverses()[0].symbols.length, 3);
});

test('deletes a saved universe', () => {
  setCustomUniverseStorage(memoryStore());
  const created = saveCustomUniverse({ name: '临时', symbols: [catalog[0]] });
  deleteCustomUniverse(created.id);
  assert.deepEqual(loadCustomUniverses(), []);
});

test('rejects an empty pool name', () => {
  setCustomUniverseStorage(memoryStore());
  assert.throws(() => saveCustomUniverse({ name: '  ', symbols: [catalog[0]] }), /名称/);
});

test('picks the next unused default pool name', () => {
  assert.equal(nextCustomUniverseName([]), '股票池 1');
  assert.equal(
    nextCustomUniverseName([
      { id: 'a', name: '股票池 1', symbols: [] },
      { id: 'b', name: '银行股', symbols: [] },
    ]),
    '股票池 2',
  );
});
