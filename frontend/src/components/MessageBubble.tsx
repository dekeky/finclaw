import { useRef, useLayoutEffect, useEffect, useState } from 'react';
import type { ChatMessage } from '../types';
import { formatElapsedSeconds, useElapsedSeconds } from '../hooks/useElapsedSeconds';
import { MarkdownContent } from './MarkdownContent';
import { AGGREGATED_TOOL_FEEDBACK_JOIN, isPicoclawToolFeedbackContent } from '../utils/foldPicoclawToolFeedback';
import { splitAssistantContent } from '../utils/splitAssistantContent';
import * as Collapsible from '@radix-ui/react-collapsible';
import { AgentAvatar } from './AgentAvatar';

const TOOL_EMOJI = '\u{1F527}';

interface MessageBubbleProps {
  message: ChatMessage;
  agentName: string;
  variant?: 'default' | 'dock';
  toolOutputActive?: boolean;
  thoughtOutputActive?: boolean;
}

function ellipsisOneLine(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trimEnd()}\u2026`;
}

function parseToolFeedbackParts(content: string): string[] {
  return content.split(AGGREGATED_TOOL_FEEDBACK_JOIN).map((s) => s.trim()).filter(Boolean);
}

function summarizeToolFeedback(content: string): string {
  const parts = parseToolFeedbackParts(content);
  if (parts.length <= 1) {
    const line = content.split('\n')[0]?.trim() || '';
    if (!line) return '\u5de5\u5177\u6267\u884c';
    const one = ellipsisOneLine(line, 88);
    return one.startsWith(TOOL_EMOJI)
      ? `\u5de5\u5177\u6267\u884c ${one.replace(new RegExp(`^${TOOL_EMOJI}\\s*`), '')}`
      : `\u5de5\u5177\u6267\u884c ${one}`;
  }
  const names: string[] = [];
  for (const p of parts) {
    const first = p.split('\n')[0]?.trim() || '';
    const m = new RegExp(`^${TOOL_EMOJI}\\s*\`([^\`]+)\``).exec(first);
    if (m) names.push(m[1]);
  }
  if (names.length > 0) {
    const head = names.slice(0, 3).join('\u3001');
    const suf = names.length > 3 ? ` \u7b49 ${names.length} \u4e2a` : '';
    return `\u5de5\u5177\u6267\u884c ${head}${suf}`;
  }
  return `\u5de5\u5177\u6267\u884c ${parts.length} \u9879`;
}

function AssistantMarkdownBody({ messageId, content }: { messageId: string; content: string }) {
  return (
    <MarkdownContent idPrefix={messageId} size="md">
      {content}
    </MarkdownContent>
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
    <div className="flex flex-col gap-2">
      {parts.map((part, index) => (
        <div key={index} className={index > 0 ? 'border-t border-border/40 pt-2' : undefined}>
          <MarkdownContent idPrefix={`${messageId}-tool-${index}`} size="sm" compact>
            {part}
          </MarkdownContent>
        </div>
      ))}
    </div>
  );
}

type ProcessPanelTone = 'thought' | 'tool';

function CollapsibleProcessPanel({
  tone,
  summaryLabel,
  content,
  isActive,
  children,
}: {
  tone: ProcessPanelTone;
  summaryLabel: string;
  content: string;
  isActive?: boolean;
  children: React.ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const userPinnedRef = useRef(false);
  const userExpandedRef = useRef(false);
  const [open, setOpen] = useState(Boolean(isActive));

  useEffect(() => {
    if (isActive) {
      setOpen(true);
      userExpandedRef.current = false;
      userPinnedRef.current = false;
    } else if (!userExpandedRef.current) {
      setOpen(false);
    }
  }, [isActive]);

  useLayoutEffect(() => {
    if (!open || !isActive) return;
    const el = scrollRef.current;
    if (!el || userPinnedRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [content, open, isActive]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    userPinnedRef.current = !atBottom;
  };

  const handleToggle = () => {
    userExpandedRef.current = true;
    setOpen((v) => !v);
  };

  const timing = useElapsedSeconds(Boolean(isActive));
  const isThought = tone === 'thought';
  const shellClass = isThought
    ? 'border-amber-500/25 bg-amber-500/5'
    : 'border-border/50 bg-muted/15';
  const headerClass = isThought
    ? 'border-amber-500/20 bg-amber-500/10 hover:bg-amber-500/15'
    : 'border-border/30 bg-muted/25 hover:bg-muted/35';
  const pulseClass = isThought ? 'bg-amber-500' : 'bg-emerald-500';
  const statusClass = isThought
    ? 'text-amber-700/80 dark:text-amber-300/80'
    : 'text-emerald-600/80 dark:text-emerald-400/80';

  return (
    <div className={`w-full overflow-hidden rounded-lg border ${shellClass}`}>
      <button
        type="button"
        onClick={handleToggle}
        className={`flex w-full items-center gap-2 border-b px-3 py-2 text-left transition-colors ${headerClass}`}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        {isActive && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${pulseClass} animate-pulse`} aria-hidden />}
        <span
          className={`min-w-0 flex-1 truncate text-xs font-medium ${
            isThought ? 'text-amber-800/90 dark:text-amber-200/90' : 'text-muted-foreground'
          }`}
        >
          {summaryLabel}
        </span>
        {timing.running && (
          <span className={`shrink-0 text-[10px] tabular-nums ${statusClass}`}>
            {isThought ? '\u52aa\u529b\u5de5\u4f5c\u4e2d' : '\u5de5\u5177\u6267\u884c\u4e2d'} {formatElapsedSeconds(timing.seconds)}
          </span>
        )}
        {timing.completed && timing.seconds > 0 && (
          <span className={`shrink-0 text-[10px] tabular-nums ${statusClass}`}>
            耗时 {formatElapsedSeconds(timing.seconds)}
          </span>
        )}
      </button>
      {open && (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className={`overflow-y-auto overflow-x-hidden px-3 py-3 text-[13px] leading-relaxed scroll-smooth [scrollbar-gutter:stable] ${
            isThought
              ? 'max-h-[min(280px,45vh)] text-muted-foreground'
              : 'max-h-[min(360px,50vh)] text-foreground'
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

interface ReasoningStep {
  icon: string;
  label: string;
  content: string;
}

const STEP_INDICATORS: Record<string, string> = {
  search: '\u{1F50D}',
  '\u5206\u6790': '\u{1F4CA}',
  '\u63a8\u7406': '\u{1F4A1}',
  '\u7ed3\u8bba': '\u2713',
  '\u9a8c\u8bc1': '\u2705',
  default: '\u{1F4AD}',
};

function parseThinkingSteps(content: string): ReasoningStep[] {
  const steps: ReasoningStep[] = [];
  const lines = content.split('\n');
  let currentStep: ReasoningStep | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const stepMatch = /^([\u{1F50D}\u{1F4CA}\u{1F4A1}\u2713\u2705\u2753])\s*([^\n:]+)[:：]?\s*(.*)$/u.exec(trimmed);
    const headerMatch = /^##?\s*([^\n]+)$/.exec(trimmed);

    if (stepMatch) {
      if (currentStep) {
        currentStep.content = currentContent.join('\n').trim();
        steps.push(currentStep);
      }
      currentStep = { icon: stepMatch[1], label: stepMatch[2] || '\u6b65\u9aa4', content: stepMatch[3] || '' };
      currentContent = [];
    } else if (headerMatch && currentStep) {
      const headerText = headerMatch[1].toLowerCase();
      let icon = STEP_INDICATORS.default;
      for (const [key, val] of Object.entries(STEP_INDICATORS)) {
        if (headerText.includes(key)) {
          icon = val;
          break;
        }
      }
      currentStep.icon = icon;
      currentStep.label = headerMatch[1];
    } else if (currentStep) {
      currentContent.push(trimmed);
    } else {
      currentStep = { icon: '\u{1F4AD}', label: '\u601d\u8003', content: trimmed };
      currentContent = [];
    }
  }

  if (currentStep) {
    currentStep.content = currentContent.join('\n').trim() || currentStep.content;
    if (currentStep.content) steps.push(currentStep);
  }

  if (steps.length === 0 && content.trim()) {
    steps.push({ icon: '\u{1F4AD}', label: '\u601d\u8003\u8fc7\u7a0b', content: content.trim() });
  }

  return steps;
}

function ThinkingPanel({
  content,
  isActive,
  messageId,
}: {
  content: string;
  isActive?: boolean;
  messageId: string;
}) {
  const steps = parseThinkingSteps(content);
  const [collapsed, setCollapsed] = useState(!isActive);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set([0]));
  const timing = useElapsedSeconds(Boolean(isActive));
  const scrollRef = useRef<HTMLDivElement>(null);
  const userPinnedRef = useRef(false);

  useEffect(() => {
    if (isActive) setCollapsed(false);
  }, [isActive]);

  useLayoutEffect(() => {
    if (collapsed || !isActive) return;
    const el = scrollRef.current;
    if (!el || userPinnedRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [content, collapsed, isActive]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    userPinnedRef.current = !atBottom;
  };

  const toggleStep = (idx: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const isSingleStep = steps.length <= 1;

  return (
    <Collapsible.Root open={!collapsed} onOpenChange={(open) => setCollapsed(!open)}>
      <div className="overflow-hidden rounded-lg border border-amber-500/25 bg-amber-500/5">
        <Collapsible.Trigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-3 py-2 text-left transition-colors hover:bg-amber-500/15"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={`shrink-0 text-muted-foreground transition-transform ${collapsed ? '' : 'rotate-90'}`}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            {isActive && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500 animate-pulse" aria-hidden />}
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-amber-800/90 dark:text-amber-200/90">
              思考过程{steps.length > 1 ? ` · ${steps.length} 个步骤` : ''}
            </span>
            {timing.running && (
              <span className="shrink-0 text-[10px] tabular-nums text-amber-700/80 dark:text-amber-300/80">
                努力工作中 · {formatElapsedSeconds(timing.seconds)}
              </span>
            )}
            {timing.completed && timing.seconds > 0 && (
              <span className="shrink-0 text-[10px] tabular-nums text-amber-700/80 dark:text-amber-300/80">
                耗时 {formatElapsedSeconds(timing.seconds)}
              </span>
            )}
            {!timing.running && !timing.completed && !collapsed && (
              <span className="shrink-0 text-[10px] text-amber-700/80 dark:text-amber-300/80">点击折叠</span>
            )}
          </button>
        </Collapsible.Trigger>

        <Collapsible.Content>
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="max-h-[min(320px,50vh)] overflow-y-auto overflow-x-hidden scroll-smooth px-3 py-3 text-[13px] leading-relaxed text-muted-foreground [scrollbar-gutter:stable]"
          >
            {steps.map((step, idx) => {
              const isExpanded = expandedSteps.has(idx);
              const isLastActive = isActive && idx === steps.length - 1;

              if (isSingleStep) {
                return (
                  <div key={idx} className="space-y-2">
                    <AssistantMarkdownBody messageId={`${messageId}-step-${idx}`} content={step.content} />
                  </div>
                );
              }

              return (
                <div key={idx} className="mb-3 last:mb-0">
                  <button type="button" onClick={() => toggleStep(idx)} className="group flex w-full items-center gap-2 text-left">
                    <span className="shrink-0 text-base">{step.icon}</span>
                    <span className="text-xs font-medium text-amber-700/90 transition-colors group-hover:text-amber-600/90 dark:text-amber-300/90">
                      {step.label}
                    </span>
                    {isLastActive && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500 animate-pulse" aria-hidden />}
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className={`ml-auto shrink-0 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                  {isExpanded && (
                    <div className="mt-2 border-l border-amber-500/20 pl-6">
                      <AssistantMarkdownBody messageId={`${messageId}-step-${idx}`} content={step.content} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Collapsible.Content>
      </div>
    </Collapsible.Root>
  );
}

export function MessageBubble({ message, agentName, toolOutputActive, thoughtOutputActive }: MessageBubbleProps) {
  const time = message.timestamp.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const isUser = message.role === 'user';
  const isThoughtMessage = !isUser && message.kind === 'thought';
  const isToolFeedback = !isUser && (message.kind === 'tool' || isPicoclawToolFeedbackContent(message.content));
  const { thought, body } =
    !isUser && !isToolFeedback && !isThoughtMessage
      ? splitAssistantContent(message.content)
      : { thought: null as string | null, body: isThoughtMessage ? '' : message.content };

  const renderMarkdown = (content: string, suffix = '') => (
    <AssistantMarkdownBody messageId={`${message.id}${suffix}`} content={content} />
  );

  if (isThoughtMessage || isToolFeedback) {
    const panel = isThoughtMessage ? (
      <ThinkingPanel content={message.content} isActive={thoughtOutputActive} messageId={`${message.id}-thinking`} />
    ) : (
      <CollapsibleProcessPanel
        tone="tool"
        summaryLabel={summarizeToolFeedback(message.content)}
        content={message.content}
        isActive={toolOutputActive}
      >
        <ToolFeedbackBody messageId={message.id} content={message.content} />
      </CollapsibleProcessPanel>
    );

    return (
      <div className="ml-10 flex min-w-0 w-full animate-in flex-col gap-1 duration-200 fade-in-0 slide-in-from-bottom-1">
        {panel}
        <span className="px-1 font-mono text-[10px] text-muted-foreground/60">{time}</span>
      </div>
    );
  }

  return (
    <div
      className={`flex w-full gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} animate-in duration-300 fade-in-0 slide-in-from-bottom-2`}
    >
      {isUser ? (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 text-xs font-semibold text-white shadow-sm shadow-violet-500/25">
          我
        </div>
      ) : (
        <AgentAvatar name={agentName} />
      )}

      <div className={`flex flex-col gap-1.5 ${isUser ? 'max-w-[85%] items-end' : 'min-w-0 flex-1 items-start'}`}>
        {isUser ? (
          <div className="rounded-2xl rounded-tr-sm bg-violet-500 px-4 py-3 text-[15px] leading-relaxed text-white">
            <span>{message.content}</span>
          </div>
        ) : (
          <div className="flex w-full flex-col gap-2">
            {thought && (
              <ThinkingPanel content={thought} isActive={thoughtOutputActive} messageId={`${message.id}-thinking`} />
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
