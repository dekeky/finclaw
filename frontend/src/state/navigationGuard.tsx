import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react';

type NavigationGuard = () => Promise<boolean>;

interface NavigationGuardState {
  setNavigationGuard: (guard: NavigationGuard | null) => void;
  confirmNavigation: () => Promise<boolean>;
}

const NavigationGuardContext = createContext<NavigationGuardState | null>(null);

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const guardRef = useRef<NavigationGuard | null>(null);

  const setNavigationGuard = useCallback((guard: NavigationGuard | null) => {
    guardRef.current = guard;
  }, []);

  const confirmNavigation = useCallback(async () => {
    const guard = guardRef.current;
    if (!guard) return true;
    return guard();
  }, []);

  const value = useMemo(
    () => ({ setNavigationGuard, confirmNavigation }),
    [setNavigationGuard, confirmNavigation],
  );

  return <NavigationGuardContext.Provider value={value}>{children}</NavigationGuardContext.Provider>;
}

export function useNavigationGuard(): NavigationGuardState {
  const ctx = useContext(NavigationGuardContext);
  if (!ctx) throw new Error('useNavigationGuard must be used within NavigationGuardProvider');
  return ctx;
}
