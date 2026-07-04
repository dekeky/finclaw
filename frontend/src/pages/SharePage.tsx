import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  IconDownload,
  IconExternalLink,
  IconLoader2,
} from '@tabler/icons-react';
import { fetchPublicShare, publicShareDownloadUrl } from '../api/agentAssets';
import { SharedMarkdownReader } from '../components/SharedMarkdownReader';
import { FinclawMark } from '../components/FinclawMark';
import { GitHubMarkIcon } from '../components/icons/GitHubMarkIcon';
import { Button } from '@/components/ui/button';

const FINCLAW_GITHUB_URL = 'https://github.com/dekeky/finclaw';

/** 顶部品牌行：紧凑、去饱和，避免地推广告观感。 */
function BrandBar({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <a
        href={FINCLAW_GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="group inline-flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <FinclawMark variant="mark" size={18} decorative />
        <span className="font-semibold text-foreground/90">Finclaw</span>
        <span className="hidden text-muted-foreground/70 sm:inline">·</span>
        <span className="hidden text-muted-foreground sm:inline">
          AI × 金融 · 开源多 Agent 投研平台
        </span>
        <GitHubMarkIcon className="size-3.5 opacity-60 transition-opacity group-hover:opacity-100" />
      </a>
      {children}
    </div>
  );
}

/** 底部 attribution：一行文字 + 链接，无色块。 */
function FinclawAttribution() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      <span>
        由{' '}
        <a
          href={FINCLAW_GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-foreground/80 transition-colors hover:text-foreground hover:underline"
        >
          Finclaw
        </a>{' '}
        提供 · 开源 · Apache-2.0
      </span>
      <a
        href={FINCLAW_GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground hover:underline"
      >
        <GitHubMarkIcon className="size-3" />
        github.com/dekeky/finclaw
        <IconExternalLink className="size-3" />
      </a>
    </div>
  );
}

export default function SharePage() {
  const { token = '' } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<Awaited<ReturnType<typeof fetchPublicShare>> | null>(null);

  useEffect(() => {
    if (!token) {
      setError('无效的分享链接');
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPublicShare(token)
      .then((body) => {
        if (cancelled) return;
        if (body.is_dir) {
          setError('暂不支持分享文件夹，请分享单个文件。');
          setMeta(null);
          return;
        }
        setMeta(body);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : '加载失败');
        setMeta(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const displayName = meta?.name || meta?.path || '';

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b border-border/50 bg-muted/10 px-3 py-2 sm:px-4 sm:py-2.5">
        <div className="mx-auto w-full max-w-7xl">
          <BrandBar>
          {meta && (
            <div className="flex min-w-0 items-center gap-2">
              <span className="hidden text-[11px] text-muted-foreground sm:inline">
                分享文件
              </span>
              <span
                className="max-w-[10rem] truncate text-xs font-medium text-foreground sm:max-w-[20rem]"
                title={meta.name}
              >
                {meta.name}
              </span>
              <a
                href={publicShareDownloadUrl(token)}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="下载原文件"
                aria-label="下载原文件"
              >
                <IconDownload className="size-3.5" />
              </a>
            </div>
          )}
          </BrandBar>
        </div>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-7xl min-w-0 flex-1 flex-col px-3 py-3 sm:px-4 sm:py-4">
        {loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <IconLoader2 className="size-5 animate-spin" />
            加载分享内容…
          </div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-8 text-center text-sm text-destructive">
            {error}
          </div>
        ) : meta?.content ? (
          <SharedMarkdownReader
            content={meta.content}
            fileName={displayName}
            className="min-h-0 flex-1"
          />
        ) : (
          <div className="rounded-lg border border-border/60 bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            <p className="mb-4">该文件无法在线预览，请下载原文件后查看。</p>
            <Button asChild variant="outline" size="sm">
              <a href={publicShareDownloadUrl(token)}>
                <IconDownload className="mr-1 size-3.5" />
                下载原文件
              </a>
            </Button>
          </div>
        )}
      </main>

      <footer className="shrink-0 border-t border-border/40 px-3 py-2 sm:px-4 sm:py-2.5">
        <div className="mx-auto w-full max-w-7xl">
          <FinclawAttribution />
        </div>
      </footer>
    </div>
  );
}
