import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

type ModuleFactory = () => Promise<{ default: ComponentType<unknown> }>;

/**
 * 可重试的 React.lazy：动态 chunk 因瞬时网络问题拉取失败时自动重试，
 * 避免一失败就抛错触发整页刷新/白屏（本地静态服务器在 HTTP/1.1 下偶发连接中断）。
 */
export function lazyWithRetry(
  factory: ModuleFactory,
  options?: { retries?: number; intervalMs?: number },
): LazyExoticComponent<ComponentType<unknown>> {
  const { retries = 2, intervalMs = 1000 } = options ?? {};
  return lazy(() => retryFactory(factory, retries, intervalMs));
}

async function retryFactory(
  factory: ModuleFactory,
  retriesLeft: number,
  intervalMs: number,
): Promise<{ default: ComponentType<unknown> }> {
  try {
    return await factory();
  } catch (error) {
    if (retriesLeft <= 0) throw error;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    return retryFactory(factory, retriesLeft - 1, intervalMs);
  }
}
