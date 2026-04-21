import { useCallback, useState } from 'react';

/** Scoped keys: `sourceName|sector|guidOrLink`（与全量待读一致，避免跨订阅 guid 冲突） */
const STORAGE_KEY = 'finclaw-rss-read-scoped-v1';

function loadSet(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveSet(s: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...s]));
}

export function useReadGuids() {
  const [read, setRead] = useState<Set<string>>(() =>
    typeof localStorage === 'undefined' ? new Set() : loadSet(),
  );

  const markRead = useCallback((key: string) => {
    setRead((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      saveSet(next);
      return next;
    });
  }, []);

  const markUnread = useCallback((key: string) => {
    setRead((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      saveSet(next);
      return next;
    });
  }, []);

  const isRead = useCallback((key: string) => read.has(key), [read]);

  return { read, markRead, markUnread, isRead };
}
