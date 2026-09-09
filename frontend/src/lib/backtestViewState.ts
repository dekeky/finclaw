export type BacktestViewState = {
  selectedName: string | null;
  strategyPane: 'code' | 'runs';
  selectedRunId: string | null;
  runsReady: boolean;
};

const STORAGE_KEY = 'finclaw.backtest.view';

export const EMPTY_BACKTEST_VIEW: BacktestViewState = {
  selectedName: null,
  strategyPane: 'code',
  selectedRunId: null,
  runsReady: false,
};

export function parseBacktestViewState(raw: string | null): BacktestViewState {
  if (!raw) return { ...EMPTY_BACKTEST_VIEW };
  try {
    const parsed = JSON.parse(raw) as Partial<BacktestViewState>;
    const strategyPane = parsed.strategyPane === 'runs' ? 'runs' : 'code';
    const selectedName =
      typeof parsed.selectedName === 'string' && parsed.selectedName.trim()
        ? parsed.selectedName
        : null;
    const selectedRunId =
      typeof parsed.selectedRunId === 'string' && parsed.selectedRunId.trim()
        ? parsed.selectedRunId
        : null;
    return {
      selectedName,
      strategyPane,
      selectedRunId,
      runsReady: Boolean(parsed.runsReady) || strategyPane === 'runs',
    };
  } catch {
    return { ...EMPTY_BACKTEST_VIEW };
  }
}

export function loadBacktestViewState(): BacktestViewState {
  try {
    return parseBacktestViewState(sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return { ...EMPTY_BACKTEST_VIEW };
  }
}

export function saveBacktestViewState(patch: Partial<BacktestViewState>): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...loadBacktestViewState(), ...patch }));
  } catch {
    // private mode / quota
  }
}
