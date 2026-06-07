import { useEffect, useRef, useState } from 'react';

export interface ElapsedTiming {
  /** 当前秒数（进行中实时更新，结束后为冻结值） */
  seconds: number;
  /** 是否正在计时 */
  running: boolean;
  /** 是否已完成至少一轮计时（active 由 true 变为 false） */
  completed: boolean;
}

export interface ElapsedOptions {
  /**
   * 自定义任务起始时间戳（ms）。
   * - 传 number 时，elapsed = (now - startedAtMs) / 1000，秒数从该时间点延续；
   * - 传 null / undefined 时，沿用「active 起算」策略，相当于本次 active 起点为 Date.now()。
   */
  startedAtMs?: number | null;
  /** active 由 false 变 true 时回调，参数为本次最终采用的起始时间戳（ms）。 */
  onStart?: (startedAtMs: number) => void;
}

/**
 * active 为 true 时计时；可通过 `options.startedAtMs` 把起点固定为外部时间戳，
 * 用于刷新页面后从 localStorage 恢复总耗时（避免归零）。结束后冻结总耗时供展示。
 */
export function useElapsedSeconds(active: boolean, options?: ElapsedOptions): ElapsedTiming {
  const startedAtMs = options?.startedAtMs ?? null;
  const onStart = options?.onStart;
  const onStartRef = useRef(onStart);
  onStartRef.current = onStart;

  const [seconds, setSeconds] = useState(0);
  const [completed, setCompleted] = useState(false);
  const startRef = useRef(Date.now());
  const wasActiveRef = useRef(false);

  useEffect(() => {
    if (active) {
      const now = Date.now();
      const start = startedAtMs != null ? startedAtMs : now;
      startRef.current = start;
      wasActiveRef.current = true;
      const initial = Math.max(0, Math.floor((now - start) / 1000));
      setSeconds(initial);
      setCompleted(false);
      onStartRef.current?.(start);
      const id = setInterval(() => {
        setSeconds(Math.max(0, Math.floor((Date.now() - startRef.current) / 1000)));
      }, 1000);
      return () => clearInterval(id);
    }

    if (wasActiveRef.current) {
      const final = Math.max(0, Math.floor((Date.now() - startRef.current) / 1000));
      setSeconds(final);
      setCompleted(true);
      wasActiveRef.current = false;
    }
  }, [active, startedAtMs]);

  return { seconds, running: active, completed };
}

export function formatElapsedSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}分${secs}秒`;
}
