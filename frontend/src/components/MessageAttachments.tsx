import { IconDownload, IconFile, IconMusic, IconVideo } from '@tabler/icons-react';
import type { Attachment } from '../types';
import { getToken } from '../api/auth';

/** 把同源下载路径补上鉴权 token；data:/blob: 等内联 URL 原样返回。 */
function resolveAttachmentUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;
  const token = getToken();
  if (!token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}

function ImageAttachment({ att }: { att: Attachment }) {
  const src = resolveAttachmentUrl(att.url);
  return (
    <a href={src} target="_blank" rel="noreferrer" className="block">
      <img
        src={src}
        alt={att.filename || att.caption || 'image'}
        loading="lazy"
        className="max-h-72 max-w-full rounded-xl border border-border/50 object-contain"
      />
    </a>
  );
}

function FileAttachment({ att }: { att: Attachment }) {
  const href = resolveAttachmentUrl(att.url);
  const Icon = att.type === 'audio' ? IconMusic : att.type === 'video' ? IconVideo : IconFile;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      download={att.filename}
      className="inline-flex max-w-full items-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
    >
      <Icon className="size-4 shrink-0 text-violet-600 dark:text-violet-400" stroke={1.75} />
      <span className="min-w-0 flex-1 truncate">{att.filename || att.caption || '附件'}</span>
      <IconDownload className="size-4 shrink-0 text-muted-foreground" stroke={1.75} />
    </a>
  );
}

export function MessageAttachments({ attachments }: { attachments: Attachment[] }) {
  if (!attachments || attachments.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {attachments.map((att, i) => (
        <div key={`${att.url}-${i}`} className="min-w-0">
          {att.type === 'image' ? <ImageAttachment att={att} /> : <FileAttachment att={att} />}
          {att.caption && att.type === 'image' && (
            <p className="mt-1 text-xs text-muted-foreground">{att.caption}</p>
          )}
        </div>
      ))}
    </div>
  );
}
