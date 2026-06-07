import { useRef, useLayoutEffect, useState, type Ref } from 'react';
import { IconChevronRight, IconTimeline } from '@tabler/icons-react';
import type { ChatMessage, ProcessSegment } from '../types';
import { formatElapsedSeconds } from '../hooks/useElapsedSeconds';
import { MarkdownContent } from './MarkdownContent';
import { AGGREGATED_TOOL_FEEDBACK_JOIN, isPicoclawToolFeedbackContent } from '../utils/foldPicoclawToolFeedback';
import { AGGREGATED_THOUGHT_JOIN } from '../utils/foldThoughtMessages';
import { getProcessSegments, isProcessMessage } from '../utils/foldProcessMessages';
import { splitAssistantContent } from '../utils/splitAssistantContent';
import { ThinkingIndicator, ThinkingIndicatorShell } from './ThinkingIndicator';
interface MessageBubbleProps {
  message: ChatMessage;
  variant?: 'default' | 'dock';
  processOutputActive?: boolean;
  /** 由 ChatContainer 统一计时，避免首个工具到达时重置 */
  taskElapsedSeconds?: number;
  taskElapsedCompleted?: boolean;
}

function parseToolFeedbackParts(content: string): string[] {
  return content.split(AGGREGATED_TOOL_FEEDBACK_JOIN).map((s) => s.trim()).filter(Boolean);
}

function parseThoughtParts(content: string): string[] {
  return content.split(AGGREGATED_THOUGHT_JOIN).map((s) => s.trim()).filter(Boolean);
}

function AssistantMarkdownBody({ messageId, content }: { messageId: string; content: string }) {
  return (
    <MarkdownContent idPrefix={messageId} size="md">
      {content}
    </MarkdownContent>
  );
}

function ThoughtBody({ messageId, content }: { messageId: string; content: string }) {
  const parts = parseThoughtParts(content);
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
        <div key={index} className={index > 0 ? 'border-t border-border/40 pt-1' : undefined}>
          <MarkdownContent idPrefix={`${messageId}-thought-${index}`} size="sm" compact>
            {part}
          </MarkdownContent>
        </div>
      ))}
    </div>
  );
}

function ToolFeedbackBody({ messageId, content }: { messageId: string; content: string }) {
  const parts = parseToolFeedbackParts(content);
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
        <div key={index} className={index > 0 ? 'border-t border-border/40 pt-1' : undefined}>
          <MarkdownContent idPrefix={`${messageId}-tool-${index}`} size="sm" compact>
            {part}
          </MarkdownContent>
        </div>
      ))}
    </div>
  );
}

function ProcessSegmentBody({
  segment,
  index,
  messageId,
}: {
  segment: ProcessSegment;
  index: number;
  messageId: string;
}) {
  if (segment.type === 'tool') {
    return <ToolFeedbackBody messageId={`${messageId}-seg-${index}`} content={segment.content} />;
  }
  return <ThoughtBody messageId={`${messageId}-seg-${index}`} content={segment.content} />;
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
  const showSegmentLabels = segments.length > 1;
  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className={`max-h-[min(320px,50vh)] overflow-y-auto overflow-x-hidden scroll-smooth text-[13px] leading-relaxed text-muted-foreground [scrollbar-gutter:stable] ${className}`}
    >
      {segments.map((segment, idx) => (
        <div
          key={idx}
          className={idx > 0 ? 'mt-1.5 border-t border-border/40 pt-1.5' : undefined}
        >
          {showSegmentLabels && (
            <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-600/65 dark:text-violet-400/65">
              {segment.type === 'tool' ? '\u5de5\u5177' : '\u601d\u8003'}
            </div>
          )}
          <ProcessSegmentBody segment={segment} index={idx} messageId={messageId} />
        </div>
      ))}
    </div>
  );
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
      <ThinkingIndicator seconds={seconds} />
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
  taskElapsedCompleted,
}: {
  segments: ProcessSegment[];
  messageId: string;
  taskElapsedSeconds?: number;
  taskElapsedCompleted?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const userPinnedRef = useRef(false);
  const [open, setOpen] = useState(false);
  const contentKey = segments.map((s) => s.content).join('\u0000');

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

  return (
    <div className="w-full overflow-hidden rounded-xl border border-violet-500/25 bg-violet-500/[0.05]">
      <button
        type="button"
        onClick={handleToggle}
        className={`flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-violet-500/10 ${open ? 'border-b border-violet-500/15' : ''}`}
      >
        <IconChevronRight
          className={`size-3 shrink-0 text-violet-500/70 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
          stroke={2}
        />
        <IconTimeline className="size-3.5 shrink-0 text-violet-500/80" stroke={1.75} />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-violet-700/90 dark:text-violet-300/90">
          工作过程
        </span>
        {taskElapsedCompleted && taskElapsedSeconds !== undefined && taskElapsedSeconds > 0 && (
          <span className="shrink-0 font-mono text-[10px] tabular-nums text-violet-600/70 dark:text-violet-400/70">
            {formatElapsedSeconds(taskElapsedSeconds)}
          </span>
        )}
      </button>
      {open && (
        <ProcessStreamBody
          segments={segments}
          messageId={messageId}
          scrollRef={scrollRef}
          onScroll={handleScroll}
          className="px-3 py-2"
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
    return (
      <div className="flex min-w-0 w-full animate-in flex-col gap-1 duration-200 fade-in-0 slide-in-from-bottom-1">
        <AgentProcessPanel
          segments={segments}
          messageId={`${message.id}-process`}
          taskElapsedSeconds={taskElapsedSeconds}
          taskElapsedCompleted={taskElapsedCompleted}
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
          <div className="rounded-2xl rounded-tr-sm bg-violet-500 px-4 py-3 text-[15px] leading-relaxed text-white">
            <span>{message.content}</span>
          </div>
        ) : (
          <div className="flex w-full flex-col gap-2">
            {thought && !processOutputActive && (
              <AgentProcessPanel
                segments={[{ type: 'thought', content: thought }]}
                messageId={`${message.id}-thinking`}
                taskElapsedSeconds={taskElapsedSeconds}
                taskElapsedCompleted={taskElapsedCompleted}
              />
            )}
            {body && (
              <div className="rounded-2xl rounded-tl-sm border border-border/60 bg-card px-4 py-3 text-[15px] leading-relaxed text-foreground">
                {renderMarkdown(body, '-body')}
              </div>
            )}
          </div>
        )}
        <span className="px-1 font-mono text-[10px] text-muted-foreground/60">{time}</span>
      </div>
    </div>
  );
}
