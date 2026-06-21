import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '../lib/cn';

export interface MermaidDiagramProps {
  chart: string;
  dark: boolean;
  className?: string;
}

async function renderMermaid(id: string, chart: string, dark: boolean): Promise<string> {
  const mermaid = (await import('mermaid')).default;
  mermaid.initialize({
    startOnLoad: false,
    theme: dark ? 'dark' : 'default',
    securityLevel: 'strict',
    fontFamily: 'inherit',
  });
  const { svg } = await mermaid.render(id, chart);
  return svg;
}

export default function MermaidDiagram({ chart, dark, className }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reactId = useId().replace(/:/g, '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const id = `mermaid-${reactId}-${Date.now()}`;
    setError(null);

    void renderMermaid(id, chart, dark)
      .then((svg) => {
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = svg;
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [chart, dark, reactId]);

  if (error) {
    return (
      <div className={cn('space-y-2', className)}>
        <p className="text-xs text-destructive">Mermaid 图表渲染失败：{error}</p>
        <pre className="overflow-x-auto whitespace-pre rounded-md bg-muted/40 px-3 py-2 font-mono text-[12px] leading-relaxed text-foreground/90">
          {chart}
        </pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex min-h-[4rem] w-full items-center justify-center overflow-x-auto py-2 [&_svg]:max-w-full',
        className,
      )}
      aria-label="Mermaid diagram"
    />
  );
}
