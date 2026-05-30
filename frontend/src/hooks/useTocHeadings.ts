import { useEffect, useState, useCallback, type RefObject } from 'react';

/* ─── 类型 ─── */

export interface TocHeading {
  id: string;
  text: string;
  level: number; // 1-6
}

interface UseTocHeadingsReturn {
  headings: TocHeading[];
  activeId: string | null;
  scrollToHeading: (id: string) => void;
}

const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6';

/**
 * 在指定的滚动容器内解析 markdown 标题，生成目录。
 *
 * 标题 id 直接读取自渲染后的 DOM（由 rehype-slug 注入），
 * 因此点击跳转与高亮始终与正文锚点一致，无需自行复刻 slug 算法。
 * 所有查询都限定在面板的 viewport 内，避免与页面其它 markdown（如聊天消息）冲突。
 */
export function useTocHeadings(
  scrollAreaRef: RefObject<HTMLDivElement | null>,
  content: string | null,
  enabled: boolean,
): UseTocHeadingsReturn {
  const [headings, setHeadings] = useState<TocHeading[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const getViewport = useCallback((): HTMLElement | null => {
    const root = scrollAreaRef.current;
    if (!root) return null;
    return (
      root.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]') ??
      root.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]') ??
      root
    );
  }, [scrollAreaRef]);

  /* ── 从渲染后的 DOM 提取标题 ── */
  useEffect(() => {
    if (!enabled || !content) {
      setHeadings([]);
      setActiveId(null);
      return;
    }

    let raf2 = 0;
    const extract = () => {
      const viewport = getViewport();
      const scope = viewport?.querySelector<HTMLElement>('.markdown-body') ?? viewport;
      if (!scope) return;

      const items: TocHeading[] = Array.from(
        scope.querySelectorAll<HTMLElement>(HEADING_SELECTOR),
      )
        .filter((el) => el.id)
        .map((el) => ({
          id: el.id,
          text: (el.textContent ?? '').trim(),
          level: Number(el.tagName.slice(1)) || 1,
        }))
        .filter((h) => h.text.length > 0);

      setHeadings(items);
      setActiveId((cur) => (cur && items.some((h) => h.id === cur) ? cur : items[0]?.id ?? null));
    };

    // 等待 ReactMarkdown 完成渲染后再读取 DOM
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(extract);
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [content, enabled, getViewport]);

  /* ── 滚动时高亮当前标题 ── */
  useEffect(() => {
    if (!enabled || headings.length === 0) return;

    const viewport = getViewport();
    const scope = viewport?.querySelector<HTMLElement>('.markdown-body') ?? viewport;
    if (!scope) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const top = visible.reduce((prev, cur) =>
          cur.boundingClientRect.top < prev.boundingClientRect.top ? cur : prev,
        );
        setActiveId((top.target as HTMLElement).id);
      },
      { root: viewport ?? null, rootMargin: '0px 0px -70% 0px', threshold: 0 },
    );

    headings.forEach((h) => {
      const el = scope.querySelector<HTMLElement>(`#${CSS.escape(h.id)}`);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [headings, enabled, getViewport]);

  /* ── 点击跳转 ── */
  const scrollToHeading = useCallback(
    (id: string) => {
      const viewport = getViewport();
      const scope = viewport?.querySelector<HTMLElement>('.markdown-body') ?? viewport;
      const el = scope?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActiveId(id);
      }
    },
    [getViewport],
  );

  return { headings, activeId, scrollToHeading };
}
