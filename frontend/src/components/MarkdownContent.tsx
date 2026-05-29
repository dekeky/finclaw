import { useCallback, useMemo, useState } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from '../context/ThemeContext';
import { cn } from '../lib/cn';

export type MarkdownSize = 'sm' | 'md';

export interface MarkdownContentProps {
  children: string;
  /** 用于代码块复制按钮 id 前缀 */
  idPrefix?: string;
  size?: MarkdownSize;
  className?: string;
  /** 是否显示代码块复制按钮 */
  copyableCode?: boolean;
  /** 工具输出等密集文本：更紧的行距，且不将单换行转 <br> */
  compact?: boolean;
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
}: MarkdownContentProps) {
  const { scheme } = useTheme();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const syntaxStyle = scheme === 'dark' ? oneDark : oneLight;

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
        const codeId = `${idPrefix}-${match ? match[1] : 'inline'}-${code.slice(0, 24)}`;

        if (match) {
          const lang = match[1];
          return (
            <div className="not-prose my-3">
              <div className="group/code relative overflow-hidden rounded-lg border border-border/60 bg-muted/30">
                <div className="flex items-center justify-between border-b border-border/50 bg-muted/50 px-3 py-1.5">
                  <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{lang}</span>
                  {copyableCode && (
                    <CopyCodeButton code={code} id={codeId} copied={copiedId === codeId} onCopy={handleCopy} />
                  )}
                </div>
                <SyntaxHighlighter
                  style={syntaxStyle}
                  language={lang}
                  PreTag="div"
                  customStyle={{
                    margin: 0,
                    padding: '12px 14px',
                    fontSize: '13px',
                    lineHeight: 1.55,
                    background: 'transparent',
                  }}
                >
                  {code}
                </SyntaxHighlighter>
              </div>
            </div>
          );
        }

        return (
          <code
            className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.9em] font-normal text-foreground before:content-none after:content-none"
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
            className="font-medium text-violet-500 underline decoration-violet-500/30 underline-offset-2 transition-colors hover:text-violet-600"
          >
            {children}
          </a>
        );
      },
      table({ children }) {
        return (
          <div className="not-prose my-4 overflow-x-auto rounded-lg border border-border/60">
            <table className="w-full border-collapse text-[13px]">{children}</table>
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
          <blockquote className="border-l-4 border-violet-500/35 pl-4 text-muted-foreground not-italic">
            {children}
          </blockquote>
        );
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
    [compact, copiedId, copyableCode, handleCopy, idPrefix, syntaxStyle],
  );

  const remarkPlugins = compact ? [remarkGfm] : [remarkGfm, remarkBreaks];

  if (!children?.trim()) {
    return null;
  }

  return (
    <div
      className={cn(
        'markdown-body prose max-w-none dark:prose-invert',
        'prose-headings:scroll-mt-20 prose-headings:font-semibold prose-headings:tracking-tight',
        compact ? 'prose-p:my-0.5 prose-p:leading-snug' : 'prose-p:my-2 prose-p:leading-relaxed',
        'prose-pre:bg-transparent prose-pre:p-0',
        'prose-code:before:content-none prose-code:after:content-none',
        'prose-strong:font-semibold prose-strong:text-foreground',
        SIZE_CLASS[size],
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
