import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { EntryForAnalysis } from '../utils/analysisPrompt';
import { rssScopedItemKey } from '../utils/rssScopedKey';

type AiDockState = {
  /** 当前页面可供分析的条目列表（例如金融资讯页的文章列表）。 */
  listEntries: EntryForAnalysis[];
  /** 勾选集合（key 由 rssScopedItemKey 生成）。 */
  selectedKeys: Set<string>;
  setListEntries: (entries: EntryForAnalysis[]) => void;
  toggleKey: (key: string) => void;
  clearSelection: () => void;
};

const AiDockContext = createContext<AiDockState | null>(null);

export function AiDockProvider({ children }: { children: React.ReactNode }) {
  const [listEntries, setListEntriesRaw] = useState<EntryForAnalysis[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());

  const setListEntries = useCallback((entries: EntryForAnalysis[]) => {
    setListEntriesRaw(entries);
    setSelectedKeys((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(entries.map((e) => rssScopedItemKey(e.sourceName, e.sector, e.item)));
      const next = new Set<string>();
      for (const k of prev) {
        if (valid.has(k)) next.add(k);
      }
      return next;
    });
  }, []);

  const toggleKey = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedKeys(new Set()), []);

  const value = useMemo<AiDockState>(
    () => ({ listEntries, selectedKeys, setListEntries, toggleKey, clearSelection }),
    [listEntries, selectedKeys, setListEntries, toggleKey, clearSelection],
  );

  return <AiDockContext.Provider value={value}>{children}</AiDockContext.Provider>;
}

export function useAiDock(): AiDockState {
  const ctx = useContext(AiDockContext);
  if (!ctx) {
    throw new Error('useAiDock must be used within AiDockProvider');
  }
  return ctx;
}

