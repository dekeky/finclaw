import { useRef, useLayoutEffect, useState, type ReactNode, type Ref } from 'react';
import {
  IconBrowser,
  IconChevronRight,
  IconFileText,
  IconFolderOpen,
  IconPencil,
  IconSearch,
  IconSparkles,
  IconTerminal2,
  IconTimeline,
  IconTool,
  IconWorld,
  IconWriting,
} from '@tabler/icons-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ChatMessage, ProcessSegment } from '../types';
import { MarkdownContent } from './MarkdownContent';
import { MessageAttachments } from './MessageAttachments';
import { isPicoclawToolFeedbackContent } from '../utils/foldPicoclawToolFeedback';
import { getProcessSegments, isProcessMessage } from '../utils/foldProcessMessages';
import {
  formatToolFeedback,
  groupProcessSegmentsIntoActions,
  splitProcessParts,
  summarizeProcessPreview,
  type ProcessActionGroup,
  type ToolIconName,
} from '../utils/formatProcessDisplay';
import { splitAssistantContent } from '../utils/splitAssistantContent';
import {
  ElapsedTimeBadge,
  ThinkingIndicator,
  ThinkingIndicatorShell,
  PROCESS_PANEL_SHELL_CLASS,
} from './ThinkingIndicator';

interface MessageBubbleProps {
  message: ChatMessage;
  variant?: 'default' | 'dock';
  processOutputActive?: boolean;
  /** 由 ChatContainer 统一计时，避免首个工具到达时重置 */
  taskElapsedSeconds?: number;
  taskElapsedCompleted?: boolean;
}

function AssistantMarkdownBody({ messageId, content }: { messageId: string; content: string }) {
  return (
    <MarkdownContent idPrefix={messageId} size="md">
      {content}
    </MarkdownContent>
  );
}

function ThoughtBody({ messageId, content }: { messageId: string; content: string }) {
  const parts = splitProcessParts(content, 'thought');
  if (parts.length <= 1) {
    return (
      <MarkdownContent idPrefix={messageId} size="sm" compact>
        {content}
      </MarkdownContent>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      {parts.map((part, index) => (
        <div key={index} className={index > 0 ? 'border-t border-border/30 pt-1' : undefined}>
          <MarkdownContent idPrefix={`${messageId}-thought-${index}`} size="sm" compact>
            {part}
          </MarkdownContent>
        </div>
      ))}
    </div>
  );
}

function ToolIconInline({ iconName }: { iconName: ToolIconName }) {
  const iconProps = {
    className: 'size-3.5 shrink-0 text-violet-600 dark:text-violet-400',
    stroke: 1.75 as const,
  };
  if (iconName === 'exec') return <IconTerminal2 {...iconProps} />;
  if (iconName === 'read_file') return <IconFileText {...iconProps} />;
  if (iconName === 'write_file') return <IconWriting {...iconProps} />;
  if (iconName === 'edit_file') return <IconPencil {...iconProps} />;
  if (iconName === 'list_dir') return <IconFolderOpen {...iconProps} />;
  if (iconName === 'web_search' || iconName === 'search') return <IconSearch {...iconProps} />;
  if (iconName === 'fetch') return <IconWorld {...iconProps} />;
  if (iconName === 'browser') return <IconBrowser {...iconProps} />;
  return <IconTool {...iconProps} />;
}

function formatToolInlineDetail(detail: string): { inline: string | null; extra: string | null } {
  const fileWriteMatch = detail.match(/^文件：(.+?)(?:\n\n内容：\n([\s\S]+))?$/);
  if (fileWriteMatch) {
    return {
      inline: fileWriteMatch[1]?.trim() || null,
      extra: fileWriteMatch[2]?.trim() || null,
    };
  }

  const oneLine = detail.replace(/\s+/g, ' ').trim();
  return { inline: oneLine || null, extra: null };
}

function formatToolInlineSummary(detail: string): string | null {
  const { inline, extra } = formatToolInlineDetail(detail);
  const parts = [inline, extra ? extra.replace(/\s+/g, ' ').trim() : null].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function ToolItem({ content, bordered }: { content: string; bordered?: boolean }) {
  const tool = formatToolFeedback(content);
  const summary = tool.detail ? formatToolInlineSummary(tool.detail) : null;

  return (
    <div className={bordered ? 'border-t border-violet-500/15 pt-1.5' : undefined}>
      <div className="flex min-w-0 items-center gap-1.5 text-xs leading-relaxed">
        <ToolIconInline iconName={tool.iconName} />
        <span className="shrink-0 font-medium text-foreground/90">{tool.label}</span>
        {summary ? (
          <>
            <span className="shrink-0 text-muted-foreground/50">·</span>
            <span
              className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground/90"
              title={summary}
            >
              {summary}
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
}

const PROCESS_STAT_ICON_CLASS = 'size-2.5 text-violet-600 dark:text-violet-400';

function ProcessStatIconBadge({
  tooltip,
  icon,
  count,
  className = 'border-violet-500/20 bg-background',
}: {
  tooltip: string;
  icon: ReactNode;
  count: number;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 ${className}`}
          tabIndex={0}
        >
          {icon}
          <span className="text-[10px] font-medium text-foreground/80">{count}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function ProcessScrollContainer({
  scrollRef,
  onScroll,
  className = '',
  children,
}: {
  scrollRef?: Ref<HTMLDivElement>;
  onScroll?: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className={`fc-process-scroll max-h-[min(320px,50vh)] overflow-y-auto overflow-x-hidden scroll-smooth [scrollbar-gutter:stable] ${className}`}
    >
      {children}
    </div>
  );
}

function ToolGroupBody({ items }: { items: string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((content, index) => (
        <ToolItem key={index} content={content} bordered={index > 0} />
      ))}
    </div>
  );
}

/** 轮次内：思考正文 → 分隔线 → 工具列表，不再单独占行的「思考/执行」标题 */
function ProcessActionBlock({
  action,
  actionIndex,
  messageId,
  showRoundLabel,
}: {
  action: ProcessActionGroup;
  actionIndex: number;
  messageId: string;
  showRoundLabel: boolean;
}) {
  const hasThought = action.thoughts.length > 0;
  const hasTools = action.tools.length > 0;

  return (
    <div className="overflow-hidden rounded-lg border border-violet-500/25 bg-background shadow-[0_2px_6px_rgb(88_28_135/0.08)] dark:border-violet-400/20 dark:bg-background dark:shadow-[0_2px_8px_rgb(0_0_0/0.35)]">
      {showRoundLabel && (
        <div className="border-b border-violet-500/15 bg-violet-500/[0.06] px-2.5 py-1">
          <span className="text-[10px] font-semibold text-violet-700/85 dark:text-violet-300/85">
            第 {actionIndex + 1} 轮
          </span>
        </div>
      )}

      {hasThought && (
        <div
          className="px-3 py-2.5 text-[13px] leading-relaxed text-foreground/88 [&_.markdown-body]:text-inherit"
          aria-label="思考"
        >
          <div className="flex flex-col gap-2">
            {action.thoughts.map((step, idx) => (
              <div key={idx} className={idx > 0 ? 'border-t border-violet-500/12 pt-2' : undefined}>
                <ThoughtBody
                  messageId={`${messageId}-action-${actionIndex}-thought-${idx}`}
                  content={step.raw}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {hasThought && hasTools && <div className="border-t border-violet-500/18" aria-hidden />}

      {hasTools && (
        <div
          className="bg-violet-500/[0.07] px-3 py-2.5 dark:bg-violet-500/10"
          aria-label={action.tools.length > 1 ? `执行 ${action.tools.length} 次` : '执行'}
        >
          <ToolGroupBody items={action.tools.map((s) => s.raw)} />
        </div>
      )}
    </div>
  );
}

function ProcessStreamBody({
  segments,
  messageId,
  scrollRef,
  onScroll,
  className = '',
}: {
  segments: ProcessSegment[];
  messageId: string;
  scrollRef?: Ref<HTMLDivElement>;
  onScroll?: () => void;
  className?: string;
}) {
  const actions = groupProcessSegmentsIntoActions(segments);

  return (
    <ProcessScrollContainer scrollRef={scrollRef} onScroll={onScroll} className={className}>
      {actions.length === 0 ? null : (
        <div className="flex flex-col gap-3">
          {actions.map((action, idx) => (
            <ProcessActionBlock
              key={idx}
              action={action}
              actionIndex={idx}
              messageId={messageId}
              showRoundLabel={actions.length > 1}
            />
          ))}
        </div>
      )}
    </ProcessScrollContainer>
  );
}

function resolveActiveStatusLabel(segments: ProcessSegment[]): string {
  if (segments.length === 0) return '努力工作中';

  const last = segments[segments.length - 1];
  if (last.type === 'tool') {
    const parts = splitProcessParts(last.content, 'tool');
    const current = parts[parts.length - 1] ?? last.content;
    const { label } = formatToolFeedback(current);
    return `正在${label}…`;
  }

  return '思考中…';
}

/** 进行中：思考标题 + 过程流式内容，同一容器 */
export function ActiveTaskPanel({
  seconds,
  segments,
  messageId,
}: {
  seconds: number;
  segments: ProcessSegment[];
  messageId: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const userPinnedRef = useRef(false);
  const contentKey = segments.map((s) => s.content).join('\u0000');
  const statusLabel = resolveActiveStatusLabel(segments);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || userPinnedRef.current || segments.length === 0) return;
    el.scrollTop = el.scrollHeight;
  }, [contentKey, segments.length]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    userPinnedRef.current = !atBottom;
  };

  return (
    <ThinkingIndicatorShell>
      <ThinkingIndicator seconds={seconds} statusLabel={statusLabel} />
      {segments.length > 0 && (
        <ProcessStreamBody
          segments={segments}
          messageId={messageId}
          scrollRef={scrollRef}
          onScroll={handleScroll}
          className="mt-3 border-t border-violet-500/15 pt-3"
        />
      )}
    </ThinkingIndicatorShell>
  );
}

export function getActiveProcessSegments(message: ChatMessage): ProcessSegment[] {
  if (message.role !== 'assistant') return [];
  if (isProcessMessage(message)) return getProcessSegments(message);
  const { thought } = splitAssistantContent(message.content);
  if (thought) return [{ type: 'thought', content: thought }];
  return [];
}

function AgentProcessPanel({
  segments,
  messageId,
  taskElapsedSeconds,
  completed = false,
}: {
  segments: ProcessSegment[];
  messageId: string;
  taskElapsedSeconds?: number;
  completed?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const userPinnedRef = useRef(false);
  const [open, setOpen] = useState(false);
  const contentKey = segments.map((s) => s.content).join('\u0000');
  const actions = groupProcessSegmentsIntoActions(segments);
  const actionCount = actions.length;
  const thoughtCount = actions.reduce((n, a) => n + a.thoughts.length, 0);
  const toolCount = actions.reduce((n, a) => n + a.tools.length, 0);

  useLayoutEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el || userPinnedRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [contentKey, open]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    userPinnedRef.current = !atBottom;
  };

  const handleToggle = () => {
    setOpen((v) => {
      if (!v) userPinnedRef.current = false;
      return !v;
    });
  };

  // 无任何实际过程内容（思考 / 工具）时不渲染空的「工作过程」面板
  if (actionCount === 0) return null;

  return (
    <div className={`${PROCESS_PANEL_SHELL_CLASS} overflow-hidden`}>
      <button
        type="button"
        onClick={handleToggle}
        className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-violet-500/10 ${open ? 'border-b border-violet-500/15' : ''}`}
      >
        <IconChevronRight
          className={`size-3 shrink-0 text-violet-500/70 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
          stroke={2}
        />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-violet-700/90 dark:text-violet-300/90">
          {completed ? '工作过程' : summarizeProcessPreview(segments)}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {actionCount > 0 && (
            <ProcessStatIconBadge
              tooltip={`行动轮次：${actionCount}`}
              count={actionCount}
              icon={<IconTimeline className={PROCESS_STAT_ICON_CLASS} stroke={1.75} aria-hidden />}
            />
          )}
          {thoughtCount > 0 && (
            <ProcessStatIconBadge
              tooltip={`思考步数：${thoughtCount}`}
              count={thoughtCount}
              icon={<IconSparkles className={PROCESS_STAT_ICON_CLASS} stroke={1.75} aria-hidden />}
            />
          )}
          {toolCount > 0 && (
            <ProcessStatIconBadge
              tooltip={`工具调用：${toolCount}`}
              count={toolCount}
              icon={<IconTool className={PROCESS_STAT_ICON_CLASS} stroke={1.75} aria-hidden />}
            />
          )}
          {taskElapsedSeconds !== undefined && (
            <ElapsedTimeBadge seconds={taskElapsedSeconds} />
          )}
        </div>
      </button>
      {open && (
        <ProcessStreamBody
          segments={segments}
          messageId={messageId}
          scrollRef={scrollRef}
          onScroll={handleScroll}
          className="border-t border-violet-500/15 px-3 py-2"
        />
      )}
    </div>
  );
}

export function MessageBubble({
  message,
  processOutputActive,
  taskElapsedSeconds,
  taskElapsedCompleted,
}: MessageBubbleProps) {
  const time = message.timestamp.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const isUser = message.role === 'user';
  const isProcess = !isUser && isProcessMessage(message);
  const isLegacyTool =
    !isUser && !isProcess && (message.kind === 'tool' || isPicoclawToolFeedbackContent(message.content));
  const { thought, body } =
    !isUser && !isLegacyTool && !isProcess
      ? splitAssistantContent(message.content)
      : { thought: null as string | null, body: message.content };

  const renderMarkdown = (content: string, suffix = '') => (
    <AssistantMarkdownBody messageId={`${message.id}${suffix}`} content={content} />
  );

  if (isProcess || isLegacyTool) {
    if (processOutputActive) return null;
    const segments = isProcess ? getProcessSegments(message) : [{ type: 'tool' as const, content: message.content }];
    // 过程内容为空时整条消息都不展示，避免出现只有时间戳的空「工作过程」
    if (groupProcessSegmentsIntoActions(segments).length === 0) return null;
    return (
      <div className="flex min-w-0 w-full flex-col gap-1">
        <AgentProcessPanel
          segments={segments}
          messageId={`${message.id}-process`}
          taskElapsedSeconds={taskElapsedSeconds}
          completed={taskElapsedCompleted}
        />
        <span className="px-1 font-mono text-[10px] text-muted-foreground/60">{time}</span>
      </div>
    );
  }

  return (
    <div
      className={`flex w-full animate-in duration-300 fade-in-0 slide-in-from-bottom-2 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`flex flex-col gap-1.5 ${isUser ? 'max-w-[85%] items-end' : 'min-w-0 w-full items-start'}`}>
        {isUser ? (
          <div className="flex flex-col items-end gap-1.5">
            {message.attachments && message.attachments.length > 0 && (
              <MessageAttachments attachments={message.attachments} />
            )}
            {message.content && (
              <div className="rounded-2xl rounded-tr-sm bg-violet-500 px-4 py-3 text-[15px] leading-relaxed text-white">
                <span>{message.content}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex w-full flex-col gap-2">
            {!processOutputActive && thought && (
              <AgentProcessPanel
                segments={[{ type: 'thought', content: thought }]}
                messageId={`${message.id}-thinking`}
                taskElapsedSeconds={taskElapsedSeconds}
                completed={taskElapsedCompleted}
              />
            )}
            {body && (
              <div className="min-w-0 max-w-full overflow-hidden rounded-2xl rounded-tl-sm border border-border/60 bg-card px-4 py-3 text-[15px] leading-relaxed text-foreground">
                {renderMarkdown(body, '-body')}
              </div>
            )}
            {message.attachments && message.attachments.length > 0 && (
              <MessageAttachments attachments={message.attachments} />
            )}
          </div>
        )}
        <span className="px-1 font-mono text-[10px] text-muted-foreground/60">{time}</span>
      </div>
    </div>
  );
}
