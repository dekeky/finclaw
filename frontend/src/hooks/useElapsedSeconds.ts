import { useEffect, useRef, useState } from 'react';

export interface ElapsedTiming {
  /** 当前秒数（进行中实时更新，结束后为冻结值） */
  seconds: number;
  /** 是否正在计时 */
  running: boolean;
  /** 是否已完成至少一轮计时（active 由 true 变为 false） */
  completed: boolean;
}

/** active 为 true 时从 0 递增；结束后冻结总耗时供展示 */
export function useElapsedSeconds(active: boolean): ElapsedTiming {
  const [seconds, setSeconds] = useState(0);
  const [completed, setCompleted] = useState(false);
  const startRef = useRef(Date.now());
  const wasActiveRef = useRef(false);

  useEffect(() => {
    if (active) {
      wasActiveRef.current = true;
      startRef.current = Date.now();
      setSeconds(0);
      setCompleted(false);
      const id = setInterval(() => {
        setSeconds(Math.floor((Date.now() - startRef.current) / 1000));
      }, 1000);
      return () => clearInterval(id);
    }

    if (wasActiveRef.current) {
      const final = Math.max(0, Math.floor((Date.now() - startRef.current) / 1000));
      setSeconds(final);
      setCompleted(true);
      wasActiveRef.current = false;
    }
  }, [active]);

  return { seconds, running: active, completed };
}

export function formatElapsedSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}分${secs}秒`;
}
