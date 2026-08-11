/**
 * 首屏加载完成后的「后台预加载」。
 *
 * 把首次访问较慢/较重、但用户很可能会用到的 chunk（回测页、Monaco 编辑器、
 * markdown 渲染）在空闲时提前下载并缓存到浏览器，用户真正点击进入时即可秒开，
 * 避免「等到点击才加载」的卡顿。同时减少用户在浏览中途动态拉 chunk 时因
 * HTTP/1.1 连接不稳定导致的失败。
 */
type IdleTask = () => Promise<unknown>;

const RUNNING_KEY = 'finclaw.preload.started';

const TASKS: IdleTask[] = [
  // 回测页策略编辑器（Monaco）——体积最大、首开最慢
  () => import('./monacoSetup'),
  // 回测页自身 chunk
  () => import('../pages/BacktestPage'),
  // 聊天默认页的 markdown 渲染
  () => import('react-markdown'),
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runQueue(tasks: IdleTask[]): Promise<void> {
  for (const task of tasks) {
    try {
      await task();
    } catch {
      // 预加载是尽力而为，失败静默，不影响主流程
    }
    // 错开请求，避免瞬间并发拉取多个大 chunk 触发连接中断
    await delay(300);
  }
}

/** 在浏览器空闲时启动后台预加载；每次页面加载只执行一次。 */
export function scheduleIdlePreload(): void {
  if (sessionStorage.getItem(RUNNING_KEY)) return;
  try {
    sessionStorage.setItem(RUNNING_KEY, '1');
  } catch {
    // ignore quota / privacy mode
  }

  const start = () => {
    void runQueue(TASKS);
  };

  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(start, { timeout: 3000 });
  } else {
    // 低版本浏览器兜底：延后执行，避免与首屏关键渲染竞争
    setTimeout(start, 1500);
  }
}
