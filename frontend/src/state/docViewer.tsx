import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface DocViewerState {
  refreshRev: number;
  bumpRefresh: () => void;
  /** 当前选中文档的完整路径，如 "research/strategy.md" */
  selectedDocPath: string | null;
  setSelectedDocPath: (path: string | null) => void;
}

const DocViewerContext = createContext<DocViewerState | null>(null);

export function DocViewerProvider({ children }: { children: ReactNode }) {
  const [refreshRev, setRefreshRev] = useState(0);
  const bumpRefresh = useCallback(() => setRefreshRev((n) => n + 1), []);

  const [selectedDocPath, setSelectedDocPath] = useState<string | null>(null);

  const value = useMemo(
    () => ({ refreshRev, bumpRefresh, selectedDocPath, setSelectedDocPath }),
    [refreshRev, bumpRefresh, selectedDocPath],
  );
  return <DocViewerContext.Provider value={value}>{children}</DocViewerContext.Provider>;
}

export function useDocViewer(): DocViewerState {
  const ctx = useContext(DocViewerContext);
  if (!ctx) throw new Error('useDocViewer must be used within DocViewerProvider');
  return ctx;
}
