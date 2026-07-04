import { useEffect, useRef, useState } from 'react';
import { IconList } from '@tabler/icons-react';
import { MarkdownContent } from '@/components/MarkdownContent';
import { DocTocOverlay, DocTocSidebar } from '@/components/DocTocSidebar';
import { useTocHeadings } from '@/hooks/useTocHeadings';
import { useIsMobile } from '@/hooks/use-mobile';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/cn';
import { isMarkdownFile } from '@/components/asset-tree-rows';

const DOC_READING_CSS = `
.doc-share-body {
  position: relative;
  display: flex;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}
.doc-share-scroll {
  min-width: 0;
  flex: 1;
  overflow: hidden;
}
.doc-share-scroll [data-slot="scroll-area-viewport"] {
  overflow-x: hidden !important;
  max-width: 100%;
}
/* Radix ScrollArea 会把内容包一层 display: table 的 div，
   会保留内容最小宽度而不收缩；强制成 block 100% 才能让正文跟随外层宽度重排。 */
.doc-share-scroll [data-slot="scroll-area-viewport"] > div {
  display: block !important;
  width: 100% !important;
  min-width: 0 !important;
  max-width: 100% !important;
  box-sizing: border-box;
  overflow-x: hidden;
}
.doc-share-article {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  margin-inline: auto;
  box-sizing: border-box;
}
@media (max-width: 767px) {
  .doc-share-article {
    padding-inline: 12px;
    padding-block: 16px;
    overflow-x: hidden;
  }
  .doc-share-article .doc-reading-prose {
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;
  }
  .doc-share-article .doc-reading-prose :is(th, td) {
    padding-inline: 8px;
    padding-block: 6px;
  }
  .doc-share-article .doc-reading-prose :is(.group\\/code pre, pre) {
    font-size: 12px;
  }
}
/* 与 DocReadingPanel 一致：平板及以上居中窄栏 */
@media (min-width: 768px) {
  .doc-share-article {
    max-width: 48rem;
    padding-inline: 24px;
    padding-block: 24px;
  }
}
@media (min-width: 1024px) {
  .doc-share-article {
    max-width: 52rem;
    padding-inline: 32px;
    padding-block: 28px;
  }
}
@media (min-width: 1280px) {
  .doc-share-article {
    max-width: 56rem;
  }
}
.doc-reading-prose {
  max-width: 100%;
  min-width: 0;
  word-break: break-word;
  overflow-wrap: anywhere;
}
.doc-reading-prose :is(pre, table, img, video, iframe) {
  max-width: 100%;
}
.doc-reading-prose :is(.group\\/code, pre, .markdown-body > div) {
  max-width: 100%;
}
.doc-reading-prose .markdown-body {
  max-width: 100%;
  min-width: 0;
  overflow-x: hidden;
}
.doc-reading-prose :is(.group\\/code, table) {
  -webkit-overflow-scrolling: touch;
}
.doc-dock-toc-trigger {
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: 6px;
  border: none;
  background: transparent;
  padding: 4px 8px;
  font-size: 12px;
  color: var(--muted-foreground);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.doc-dock-toc-trigger:hover {
  background: var(--muted);
  color: var(--foreground);
}
.doc-dock-toc-sidebar {
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  background: color-mix(in oklch, var(--muted) 40%, var(--card));
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.doc-dock-toc-inner {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.doc-dock-toc-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted-foreground);
  padding: 10px 8px 8px 14px;
  border-bottom: 1px solid var(--border);
}
.doc-dock-toc-collapse {
  display: flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 5px;
  background: transparent; border: none; cursor: pointer;
  color: var(--muted-foreground);
  flex-shrink: 0;
  transition: background 0.12s, color 0.12s;
}
.doc-dock-toc-collapse:hover {
  background: rgba(139,92,246,0.1);
  color: #7c3aed;
}
.doc-dock-toc-rail {
  flex-shrink: 0;
  width: 34px;
  border-right: 1px solid var(--border);
  background: color-mix(in oklch, var(--muted) 40%, var(--card));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding-top: 6px;
}
.doc-dock-toc-expand {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 30px; border-radius: 6px;
  background: transparent; border: none; cursor: pointer;
  color: var(--muted-foreground);
  transition: background 0.12s, color 0.12s;
}
.doc-dock-toc-expand:hover {
  background: rgba(139,92,246,0.1);
  color: #7c3aed;
}
.doc-dock-toc-rail-label {
  writing-mode: vertical-rl;
  text-orientation: upright;
  font-size: 10px;
  letter-spacing: 0.15em;
  color: var(--muted-foreground);
  user-select: none;
}
.doc-dock-toc-item {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  border-left: 2px solid transparent;
  padding: 5px 12px 5px 12px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--muted-foreground);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.doc-dock-toc-item:hover {
  background: rgba(139,92,246,0.07);
  color: var(--foreground);
}
.doc-dock-toc-item--active {
  border-left-color: #8b5cf6;
  background: rgba(139,92,246,0.09);
  color: #7c3aed;
  font-weight: 600;
}
.doc-dock-toc-overlay {
  position: absolute;
  inset: 0;
  z-index: 6;
  pointer-events: none;
}
.doc-dock-toc-overlay--open {
  pointer-events: auto;
}
.doc-dock-toc-overlay-backdrop {
  position: absolute;
  inset: 0;
  border: none;
  background: rgba(0, 0, 0, 0.28);
  opacity: 0;
  transition: opacity 0.18s ease;
  cursor: default;
}
.doc-dock-toc-overlay--open .doc-dock-toc-overlay-backdrop {
  opacity: 1;
}
.doc-dock-toc-overlay-panel {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--card);
  border-right: 1px solid var(--border);
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.12);
  transform: translateX(-100%);
  transition: transform 0.2s ease;
}
.doc-dock-toc-overlay--open .doc-dock-toc-overlay-panel {
  transform: translateX(0);
}
`;

interface SharedMarkdownReaderProps {
  content: string;
  fileName: string;
  className?: string;
}

/** 与 Finclaw 内部文档阅读器一致的文件展示（Markdown 含目录，纯文本用等宽 pre）。 */
export function SharedMarkdownReader({ content, fileName, className }: SharedMarkdownReaderProps) {
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const isMobile = useIsMobile();
  const [tocOverlayOpen, setTocOverlayOpen] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1024,
  );

  const isMd = isMarkdownFile(fileName);

  const { headings, activeId, scrollToHeading } = useTocHeadings(
    scrollAreaRef,
    isMd ? content : null,
    isMd,
  );

  const showToc = isMd && headings.length > 0;
  const useOverlayToc = showToc && (isMobile || viewportWidth < 900);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!useOverlayToc) setTocOverlayOpen(false);
  }, [useOverlayToc]);

  return (
    <>
      <style>{DOC_READING_CSS}</style>
      <div
        className={cn(
          'flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-card',
          className,
        )}
      >
        {useOverlayToc && (
          <div className="flex shrink-0 justify-end border-b border-border/40 px-3 py-2">
            <button
              type="button"
              className="doc-dock-toc-trigger"
              onClick={() => setTocOverlayOpen(true)}
              title="打开目录"
              aria-label="打开目录"
            >
              <IconList className="size-3.5" />
              目录
            </button>
          </div>
        )}
        <div className="doc-share-body min-h-0 flex-1">
          {showToc && !useOverlayToc && (
            <DocTocSidebar
              headings={headings}
              activeId={activeId}
              onHeadingClick={scrollToHeading}
              storageKey="finclaw.share.tocCollapsed"
            />
          )}
          {useOverlayToc && (
            <DocTocOverlay
              open={tocOverlayOpen}
              onOpenChange={setTocOverlayOpen}
              headings={headings}
              activeId={activeId}
              onHeadingClick={scrollToHeading}
            />
          )}
          <ScrollArea ref={scrollAreaRef} className="doc-share-scroll min-h-0 flex-1">
            {isMd ? (
              <div className="doc-share-article">
                <MarkdownContent
                  copyableCode
                  size={isMobile ? 'sm' : 'md'}
                  className="doc-reading-prose"
                >
                  {content}
                </MarkdownContent>
              </div>
            ) : (
              <pre className="doc-share-article overflow-x-auto text-sm leading-relaxed whitespace-pre-wrap break-words font-mono text-foreground/90">
                {content}
              </pre>
            )}
          </ScrollArea>
        </div>
      </div>
    </>
  );
}
