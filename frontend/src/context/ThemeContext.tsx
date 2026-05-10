import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type Scheme = 'light' | 'dark';

const STORAGE = 'finclaw.theme';

type ThemeContextValue = {
  scheme: Scheme;
  toggle: () => void;
  setScheme: (s: Scheme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStored(): Scheme {
  try {
    const v = localStorage.getItem(STORAGE);
    if (v === 'dark' || v === 'light') return v;
  } catch {
    /* ignore */
  }
  return 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [scheme, setSchemeState] = useState<Scheme>(() =>
    typeof document !== 'undefined' ? readStored() : 'light',
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', scheme === 'dark');
    document.documentElement.style.colorScheme = scheme === 'dark' ? 'dark' : 'light';
    try {
      localStorage.setItem(STORAGE, scheme);
    } catch {
      /* ignore */
    }
  }, [scheme]);

  const setScheme = useCallback((s: Scheme) => setSchemeState(s), []);
  const toggle = useCallback(() => setSchemeState((prev) => (prev === 'dark' ? 'light' : 'dark')), []);

  const value = useMemo(() => ({ scheme, toggle, setScheme }), [scheme, toggle, setScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
