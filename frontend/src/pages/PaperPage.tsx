import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  IconArrowLeft,
  IconChartCandle,
  IconLoader2,
  IconPencil,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconRefresh,
  IconRotateClockwise,
} from '@tabler/icons-react';
import {
  createPaperSession,
  deletePaperSession,
  getPaperSession,
  listPaperSessions,
  pausePaperSession,
  renamePaperSession,
  restartPaperSession,
  resumePaperSession,
  syncPaperSession,
  type PaperSession,
  type PaperSessionDetail,
} from '@/api/paper';
import { listBacktestRuns, type RunListItem, type UniverseSelection } from '@/api/backtest';
import { listStrategies, type StrategySummary } from '@/api/strategies';
import { UniverseDialog } from '@/components/backtest/UniverseDialog';
import { PaperSessionView } from '@/components/paper/PaperSessionView';
import { PaperStrategyPickDialog } from '@/components/paper/PaperStrategyPickDialog';
import { StrategyGallerySkeleton } from '@/components/strategy/StrategyGallerySkeleton';
import { StrategyGalleryTile } from '@/components/strategy/StrategyGalleryTile';
import { galleryShellClassName } from '@/components/strategy/strategyGallery';
import { SidebarExpandTrigger } from '@/components/chrome/SidebarExpandTrigger';
import { ThemeToggle } from '@/components/chrome/ThemeToggle';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import type { BacktestRunParams } from '@/lib/backtestRunDraft';
import { runBelongsToStrategy } from '@/lib/backtestStrategy';
import { cn } from '@/lib/cn';
import { hasUsableReturnCurve, returnSeriesFromEquity } from '@/lib/galleryReturn';
import {
  formatPaperMoney,
  formatPaperReturn,
  paperCardMeta,
  paperDisplayReturn,
  paperSignedClass,
  paperStatusLabel,
  samePaperPollSnapshot,
} from '@/lib/paperSession';
import { loadBacktestViewState, saveBacktestViewState, type BacktestViewState } from '@/lib/backtestViewState';
import { parseReturnTo, withReturnTo } from '@/lib/navigationReturn';
import { PRIMARY_BUTTON_CLASS } from '@/lib/primaryButton';
import { useAuth } from '@/state/auth';
import { toast } from 'sonner';

export default function PaperPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { requireAuth } = useRequireAuth();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const strategyFilter = searchParams.get('strategy')?.trim() || '';
  const returnTo = parseReturnTo(location.state);

  const [items, setItems] = useState<PaperSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detail, setDetail] = useState<PaperSessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [pickOpen, setPickOpen] = useState(false);
  const [universeOpen, setUniverseOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [pickedStrategy, setPickedStrategy] = useState<StrategySummary | null>(null);
  const [finclawStrategies, setFinclawStrategies] = useState<StrategySummary[]>([]);
  const [strategyRuns, setStrategyRuns] = useState<RunListItem[]>([]);

  const visibleItems = useMemo(
    () => (strategyFilter ? items.filter((item) => item.strategy_name === strategyFilter) : items),
    [items, strategyFilter],
  );

  const refreshList = useCallback(async () => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoadError(null);
    try {
      const next = await listPaperSessions();
      const hydrated = await Promise.all(
        next.map(async (item) => {
          if (hasUsableReturnCurve(item.equity_curve, item.initial_cash, item.go_live)) return item;
          const detail = await getPaperSession(item.id).catch(() => null);
          const curve = detail?.equity_curve?.length ? detail.equity_curve : detail?.result?.equity_curve;
          if (!curve?.length) return item;
          return { ...item, equity_curve: curve };
        }),
      );
      setItems(hydrated);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    setLoading(true);
    void refreshList();
  }, [refreshList]);

  useEffect(() => {
    if (!id) {
      setDetail(null);
      return;
    }
    if (!user) return;
    let cancelled = false;
    setDetailLoading(true);
    getPaperSession(id)
      .then((session) => {
        if (!cancelled) setDetail(session);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        toast.error(err instanceof Error ? err.message : '加载失败');
        navigate('/paper', { replace: true });
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, user, navigate]);

  useEffect(() => {
    if (!detail || (detail.status !== 'catching_up' && detail.status !== 'running')) return;
    const timer = window.setInterval(() => {
      void getPaperSession(detail.id)
        .then((session) => {
          let changed = false;
          setDetail((current) => {
            if (samePaperPollSnapshot(current, session)) return current;
            changed = true;
            return session;
          });
          if (!changed) return;
          setItems((list) => list.map((row) => (row.id === session.id ? { ...row, ...session } : row)));
        })
        .catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [detail?.id, detail?.status]);

  useEffect(() => {
    if (!user || !detail?.strategy_name) {
      setStrategyRuns([]);
      return;
    }
    let cancelled = false;
    listBacktestRuns()
      .then((list) => {
        if (cancelled) return;
        setStrategyRuns(
          list.filter((item) =>
            runBelongsToStrategy(item, { id: detail.strategy_id, name: detail.strategy_name }),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setStrategyRuns([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user, detail?.strategy_id, detail?.strategy_name]);

  const startCreate = async () => {
    if (!requireAuth()) return;
    try {
      const strategies = (await listStrategies()).filter((item) => item.platform === 'finclaw');
      setFinclawStrategies(strategies);
      if (strategies.length === 0) {
        toast.error('请先在量化中创建一个 FinClaw 策略');
        return;
      }
      if (strategies.length === 1) {
        setPickedStrategy(strategies[0]);
        setUniverseOpen(true);
        return;
      }
      setPickOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '加载策略失败');
    }
  };

  const handleConfirmUniverse = async (selection: UniverseSelection, params: BacktestRunParams) => {
    if (!pickedStrategy) return;
    setCreateBusy(true);
    try {
      const session = await createPaperSession({
        strategy_name: pickedStrategy.name,
        strategy_id: pickedStrategy.id,
        initial_cash: Number(params.initial_cash),
        universe: selection.universe,
        symbols: selection.symbols,
        index: selection.index,
        commission_rate: Number(params.commission_pct) / 100,
        min_commission: Number(params.min_commission),
        stamp_tax_rate: Number(params.stamp_pct) / 100,
        transfer_fee_rate: Number(params.transfer_pct) / 100,
        slippage: Number(params.slippage_pct) / 100,
      });
      setUniverseOpen(false);
      setPickOpen(false);
      setPickedStrategy(null);
      await refreshList();
      navigate(`/paper/${session.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '开启失败');
    } finally {
      setCreateBusy(false);
    }
  };

  const commitRename = async (session: PaperSession) => {
    const next = draftName.trim();
    setEditingId(null);
    if (!next || next === session.name) return;
    try {
      const updated = await renamePaperSession(session.id, next);
      setItems((list) => list.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
      setDetail((current) => (current?.id === updated.id ? { ...current, ...updated } : current));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '重命名失败');
    }
  };

  const onRenameKey = (event: KeyboardEvent<HTMLInputElement>, session: PaperSession) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void commitRename(session);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setEditingId(null);
    }
  };

  const handleDelete = async (session: PaperSession) => {
    if (!requireAuth()) return;
    const ok = await confirm({
      title: `删除「${session.name}」`,
      description: '将删除该实盘模拟账户，操作不可恢复。',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await deletePaperSession(session.id);
      toast.success('已删除');
      setItems((list) => list.filter((row) => row.id !== session.id));
      if (id === session.id) navigate('/paper');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const runAction = async (label: string, task: () => Promise<PaperSessionDetail>) => {
    if (!requireAuth() || actionBusy) return;
    setActionBusy(true);
    try {
      const next = await task();
      setDetail(next);
      setItems((list) => list.map((row) => (row.id === next.id ? { ...row, ...next } : row)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `${label}失败`);
    } finally {
      setActionBusy(false);
    }
  };

  const handleRestart = async () => {
    if (!detail) return;
    const ok = await confirm({
      title: `用当前代码重启「${detail.name}」`,
      description: '将用策略最新保存的代码重新开盘，虚拟资金回到初始值，已有持仓不会保留。',
      confirmText: '重启',
    });
    if (!ok) return;
    await runAction('重启', () => restartPaperSession(detail.id));
  };

  const browsing = !id;

  const goToBacktest = (patch: Partial<BacktestViewState>) => {
    if (!detail) return;
    saveBacktestViewState({
      ...loadBacktestViewState(),
      ...patch,
    });
    navigate('/backtest', { state: withReturnTo(`/paper/${detail.id}`) });
  };

  const openStrategyRun = (runId?: string) => {
    if (!detail?.strategy_name) return;
    goToBacktest({
      selectedName: detail.strategy_name,
      strategyPane: 'runs',
      selectedRunId: runId ?? null,
      runsReady: true,
    });
  };

  const handleBack = () => {
    navigate(returnTo || '/paper');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border/50 px-3">
        <SidebarExpandTrigger />
        {detail ? (
          <div className="flex min-w-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              onClick={handleBack}
              aria-label={returnTo ? '返回来源页' : '返回列表'}
            >
              <IconArrowLeft className="size-4" />
            </Button>
            {editingId === detail.id ? (
              <input
                className="h-[26px] max-w-[200px] rounded-sm border border-violet-500 bg-background px-1.5 text-[13px] font-medium"
                value={draftName}
                autoFocus
                maxLength={64}
                onChange={(event) => setDraftName(event.target.value)}
                onBlur={() => void commitRename(detail)}
                onKeyDown={(event) => onRenameKey(event, detail)}
                aria-label="账户名称"
              />
            ) : (
              <>
                <span
                  className="max-w-[200px] truncate px-1.5 text-[13px] font-medium"
                  title="双击重命名"
                  onDoubleClick={() => {
                    setEditingId(detail.id);
                    setDraftName(detail.name);
                  }}
                >
                  {detail.name}
                </span>
                <button
                  type="button"
                  className="flex size-[22px] shrink-0 items-center justify-center rounded-sm text-muted-foreground/70 hover:bg-muted hover:text-foreground"
                  title="重命名"
                  aria-label={`重命名 ${detail.name}`}
                  onClick={() => {
                    setEditingId(detail.id);
                    setDraftName(detail.name);
                  }}
                >
                  <IconPencil className="size-3.5" stroke={1.75} />
                </button>
              </>
            )}
            {detail.strategy_name ? (
              <button
                type="button"
                className="max-w-[160px] truncate px-1 text-xs text-muted-foreground hover:text-foreground"
                title="打开来源策略"
                onClick={() => {
                  goToBacktest({
                    selectedName: detail.strategy_name,
                    strategyPane: 'code',
                  });
                }}
              >
                {detail.strategy_name}
              </button>
            ) : null}
            <Badge variant="outline" className="ml-1 shrink-0 text-[11px]">
              {paperStatusLabel(detail.status)}
            </Badge>
          </div>
        ) : returnTo ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            onClick={handleBack}
            aria-label="返回来源页"
          >
            <IconArrowLeft className="size-4" />
          </Button>
        ) : null}
        <div className="ml-auto flex items-center gap-1.5">
          {detail ? (
            <>
              {detail.status === 'paused' ? (
                <Button
                  type="button"
                  size="xs"
                  className={PRIMARY_BUTTON_CLASS}
                  disabled={actionBusy}
                  onClick={() => void runAction('恢复', () => resumePaperSession(detail.id))}
                >
                  <IconPlayerPlay className="size-3.5" />
                  恢复
                </Button>
              ) : (
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={actionBusy || detail.status === 'catching_up'}
                  onClick={() => void runAction('暂停', () => pausePaperSession(detail.id))}
                >
                  <IconPlayerPause className="size-3.5" />
                  暂停
                </Button>
              )}
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={actionBusy}
                onClick={() => void runAction('同步', () => syncPaperSession(detail.id))}
              >
                <IconRefresh className="size-3.5" />
                同步
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={actionBusy || detail.strategy_missing}
                title={detail.strategy_missing ? '来源策略已删除，无法重启' : '用当前代码重启'}
                onClick={() => void handleRestart()}
              >
                <IconRotateClockwise className="size-3.5" />
                重启
              </Button>
            </>
          ) : null}
          <ThemeToggle />
        </div>
      </div>

      {browsing ? (
        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
            {loading ? (
              <StrategyGallerySkeleton />
            ) : loadError ? (
              <div className="space-y-3 py-16 text-center">
                <p className="text-sm text-destructive">{loadError}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void refreshList()}>
                  重试
                </Button>
              </div>
            ) : visibleItems.length === 0 ? (
              <div className="px-4 py-16 text-center">
                <div className="mx-auto flex max-w-md flex-col items-center gap-4">
                  <div className="flex size-16 items-center justify-center rounded-2xl border border-border/60 bg-card shadow-sm">
                    <IconChartCandle className="size-7 text-primary" stroke={1.5} />
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="text-base font-semibold tracking-tight">
                      {strategyFilter ? `还没有「${strategyFilter}」的实盘模拟` : '把回测过的策略用起来'}
                    </h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      用虚拟资金按日线追赶运行，查看持仓与净值。也可在量化回测成功后一键开启。
                    </p>
                  </div>
                  <Button type="button" className={PRIMARY_BUTTON_CLASS} onClick={() => void startCreate()}>
                    <IconPlus className="size-4" />
                    新建实盘模拟
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visibleItems.map((session) => {
                  const meta = paperCardMeta(session);
                  const editing = editingId === session.id;
                  return (
                    <StrategyGalleryTile
                      key={session.id}
                      title={session.name}
                      platform="finclaw"
                      subtitle={`${formatPaperMoney(session.equity)} · ${paperStatusLabel(session.status)}`}
                      returnSeries={returnSeriesFromEquity(session.equity_curve, session.initial_cash, session.go_live)}
                      metaLeft={meta.left}
                      metaRight={formatPaperReturn(paperDisplayReturn(session))}
                      metaRightClass={paperSignedClass(paperDisplayReturn(session))}
                      updatedAt={session.updated_at}
                      editing={editing}
                      draftName={draftName}
                      onDraftNameChange={setDraftName}
                      onCommitRename={() => void commitRename(session)}
                      onRenameKeyDown={(event) => onRenameKey(event, session)}
                      onOpen={() => navigate(`/paper/${session.id}`, { state: location.state })}
                      onRename={(event: MouseEvent) => {
                        event.stopPropagation();
                        setEditingId(session.id);
                        setDraftName(session.name);
                      }}
                      onDelete={() => void handleDelete(session)}
                    />
                  );
                })}
                <button
                  type="button"
                  onClick={() => void startCreate()}
                  className={cn(
                    galleryShellClassName(),
                    'min-h-[120px] items-center justify-center border-dashed bg-transparent p-4 text-muted-foreground',
                    'hover:border-primary/40 hover:bg-muted/30 hover:text-foreground',
                  )}
                >
                  <IconPlus className="size-5" />
                  <span className="mt-2 text-sm">新建实盘模拟</span>
                </button>
              </div>
            )}
          </div>
        </ScrollArea>
      ) : detailLoading && !detail ? (
        <div className="flex flex-1 items-center justify-center">
          <IconLoader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : detail ? (
        <PaperSessionView session={detail} runs={strategyRuns} onOpenRun={openStrategyRun} />
      ) : null}

      <PaperStrategyPickDialog
        open={pickOpen}
        strategies={finclawStrategies}
        onOpenChange={setPickOpen}
        onPick={(strategy) => {
          setPickedStrategy(strategy);
          setPickOpen(false);
          setUniverseOpen(true);
        }}
      />
      <UniverseDialog
        open={universeOpen}
        busy={createBusy}
        hideDates
        title="实盘模拟设置"
        description="设置虚拟资金、费率与标的。策略按日线追赶到最新交易日。"
        confirmLabel="开启实盘模拟"
        confirmBusyLabel="开启中…"
        confirmHint={(count) => `将用 ${count} 只标的开启实盘模拟`}
        onOpenChange={setUniverseOpen}
        onConfirm={handleConfirmUniverse}
      />
      {confirmDialog}
    </div>
  );
}
