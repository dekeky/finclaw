import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeSlug from 'rehype-slug';
import type { PluggableList } from 'unified';
import { useTheme } from '../context/ThemeContext';
import { cn } from '../lib/cn';

const CodeBlock = lazy(() => import('./CodeBlock'));
const MermaidDiagram = lazy(() => import('./MermaidDiagram'));

export type MarkdownSize = 'sm' | 'md';

export interface MarkdownContentProps {
  children: string;
  /** 用于代码块复制按钮 id 前缀 */
  idPrefix?: string;
  size?: MarkdownSize;
  className?: string;
  /** 是否显示代码块复制按钮 */
  copyableCode?: boolean;
  /** 工具输出等密集文本：更紧的行距 */
  compact?: boolean;
  /**
   * 是否将单个换行渲染为 <br>（remark-breaks）。
   * 默认 true；仅极密集的工具日志可设为 false。
   */
  lineBreaks?: boolean;
  /** 额外的 rehype 插件（rehype-slug 已内置） */
  rehypePlugins?: PluggableList;
}

const SIZE_CLASS: Record<MarkdownSize, string> = {
  sm: 'prose-sm text-[13px] leading-relaxed',
  md: 'text-[15px] leading-relaxed',
};

function CopyCodeButton({
  code,
  id,
  copied,
  onCopy,
}: {
  code: string;
  id: string;
  copied: boolean;
  onCopy: (code: string, id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onCopy(code, id)}
      title="复制代码"
      aria-label="复制代码"
      className="rounded-md bg-muted/90 p-1.5 text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

export function MarkdownContent({
  children,
  idPrefix = 'md',
  size = 'md',
  className,
  copyableCode = true,
  compact = false,
  lineBreaks = true,
  rehypePlugins,
}: MarkdownContentProps) {
  const { scheme } = useTheme();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const dark = scheme === 'dark';

  const handleCopy = useCallback((code: string, id: string) => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

  const components = useMemo<Components>(
    () => ({
      pre({ children }) {
        return <>{children}</>;
      },
      code({ className: codeClassName, children, ...props }) {
        const match = /language-(\w+)/.exec(codeClassName || '');
        const code = String(children).replace(/\n$/, '');
        // react-markdown v10 移除了 inline 属性；无语言标记的围栏块需用换行判断
        const isBlock = Boolean(match) || code.includes('\n');
        const codeId = `${idPrefix}-${match ? match[1] : isBlock ? 'block' : 'inline'}-${code.slice(0, 24)}`;

        if (isBlock) {
          const lang = match?.[1];
          const isMermaid = lang === 'mermaid';

          if (isMermaid) {
            return (
              <div className="not-prose my-3 max-w-full min-w-0">
                <div className="group/code relative max-w-full min-w-0 overflow-x-auto rounded-lg border border-border/60 bg-muted/30 dark:bg-muted/50">
                  <div className="flex items-center justify-between border-b border-border/50 bg-muted/50 px-3 py-1.5 dark:bg-muted/70">
                    <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                      mermaid
                    </span>
                    {copyableCode && (
                      <CopyCodeButton code={code} id={codeId} copied={copiedId === codeId} onCopy={handleCopy} />
                    )}
                  </div>
                  <Suspense
                    fallback={
                      <div className="px-3.5 py-6 text-center text-xs text-muted-foreground">加载图表…</div>
                    }
                  >
                    <MermaidDiagram chart={code} dark={dark} className="px-3.5 py-3" />
                  </Suspense>
                </div>
              </div>
            );
          }

          return (
            <div className="not-prose my-3 max-w-full min-w-0">
              <div className="group/code relative max-w-full min-w-0 overflow-x-auto rounded-lg border border-border/60 bg-muted/30 dark:bg-muted/50">
                <div
                  className={cn(
                    'flex items-center border-b border-border/50 bg-muted/50 px-3 py-1.5 dark:bg-muted/70',
                    lang ? 'justify-between' : 'justify-end',
                  )}
                >
                  {lang ? (
                    <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
                      {lang}
                    </span>
                  ) : null}
                  {copyableCode && (
                    <CopyCodeButton code={code} id={codeId} copied={copiedId === codeId} onCopy={handleCopy} />
                  )}
                </div>
                {lang ? (
                  <Suspense
                    fallback={
                      <pre className="overflow-x-auto whitespace-pre px-3.5 py-3 font-mono text-[13px] leading-relaxed">
                        <code>{code}</code>
                      </pre>
                    }
                  >
                    <CodeBlock code={code} lang={lang} dark={dark} />
                  </Suspense>
                ) : (
                  <pre className="overflow-x-auto whitespace-pre px-3.5 py-3 font-mono text-[13px] leading-relaxed">
                    <code className="bg-transparent p-0 font-normal text-foreground before:content-none after:content-none">
                      {code}
                    </code>
                  </pre>
                )}
              </div>
            </div>
          );
        }

        return (
          <code
            className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.9em] font-normal text-foreground before:content-none after:content-none dark:bg-muted/80"
            {...props}
          >
            {children}
          </code>
        );
      },
      a({ href, children }) {
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-violet-500 underline decoration-violet-500/30 underline-offset-2 transition-colors hover:text-violet-600 dark:text-violet-400 dark:hover:text-violet-300 dark:decoration-violet-400/30"
          >
            {children}
          </a>
        );
      },
      table({ children }) {
        return (
          <div className="not-prose my-4 max-w-full min-w-0 overflow-x-auto rounded-lg border border-border/60">
            <table className="w-max min-w-full border-collapse text-[13px]">{children}</table>
          </div>
        );
      },
      thead({ children }) {
        return <thead className="bg-muted/60">{children}</thead>;
      },
      th({ children }) {
        return (
          <th className="border-b border-border/60 px-3 py-2 text-left font-semibold text-foreground">
            {children}
          </th>
        );
      },
      td({ children }) {
        return <td className="border-b border-border/40 px-3 py-2 text-foreground/90">{children}</td>;
      },
      tr({ children }) {
        return <tr className="even:bg-muted/20">{children}</tr>;
      },
      blockquote({ children }) {
        return (
          <blockquote
            className={cn(
              'my-2 border-l-4 border-violet-500/50 pl-4 text-muted-foreground not-italic',
              compact ? 'py-0.5' : 'py-1',
            )}
          >
            {children}
          </blockquote>
        );
      },
      strong({ children }) {
        return <strong className="font-semibold text-foreground">{children}</strong>;
      },
      img({ src, alt }) {
        return (
          <img
            src={src}
            alt={alt ?? ''}
            loading="lazy"
            className="my-3 max-w-full rounded-lg border border-border/50"
          />
        );
      },
      ul({ children, className: listClassName }) {
        const isTask = listClassName?.includes('contains-task-list');
        return (
          <ul className={cn('my-2 pl-5', isTask && 'list-none space-y-1 pl-1')}>{children}</ul>
        );
      },
      ol({ children }) {
        return <ol className="my-2 list-decimal pl-5">{children}</ol>;
      },
      li({ children, className: itemClassName }) {
        const isTask = itemClassName?.includes('task-list-item');
        return (
          <li className={cn('my-0.5', isTask && 'flex list-none items-start gap-2')}>{children}</li>
        );
      },
      input({ checked, disabled, type }) {
        if (type === 'checkbox') {
          return (
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              readOnly
              className="mt-1 size-3.5 shrink-0 rounded border-border accent-violet-500"
            />
          );
        }
        return <input type={type} checked={checked} disabled={disabled} readOnly />;
      },
      hr() {
        return <hr className={compact ? 'my-2 border-border/40' : 'my-6 border-border/60'} />;
      },
    }),
    [compact, copiedId, copyableCode, dark, handleCopy, idPrefix],
  );

  const remarkPlugins = lineBreaks ? [remarkGfm, remarkBreaks] : [remarkGfm];

  if (!children?.trim()) {
    return null;
  }

  return (
    <div
      className={cn(
        'markdown-body prose max-w-none min-w-0 w-full break-words [overflow-wrap:anywhere] dark:prose-invert',
        '[&_pre]:max-w-full [&_pre]:overflow-x-auto',
        'prose-headings:scroll-mt-20 prose-headings:font-semibold prose-headings:tracking-tight',
        compact ? 'prose-p:my-0.5 prose-p:leading-snug' : 'prose-p:my-2 prose-p:leading-relaxed',
        'prose-pre:bg-transparent prose-pre:p-0',
        'prose-code:before:content-none prose-code:after:content-none',
        'prose-strong:font-semibold prose-strong:text-foreground',
	        'prose-a:text-violet-500 dark:prose-a:text-violet-400',
        SIZE_CLASS[size],
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={[rehypeSlug, ...(rehypePlugins ?? [])]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
