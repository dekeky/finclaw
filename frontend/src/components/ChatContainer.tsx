import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../types';
import { ActiveTaskPanel, MessageBubble } from './MessageBubble';
import { useElapsedSeconds } from '../hooks/useElapsedSeconds';
import {
  findCompleteReplyIndexInTurn,
  findLastProcessIndexInTurn,
  isChatTaskActive,
} from '../utils/chatTaskState';
import {
  collectActiveTaskSegments,
  findLastUserIndex,
  isProcessMessage,
} from '../utils/foldProcessMessages';
import { splitAssistantContent } from '../utils/splitAssistantContent';
import { ChatMascot } from './ChatMascot';

const DOCK_QUICK_PROMPTS = [
  '用要点列表总结我已选文章',
  '这些资讯里有没有明显风险或矛盾？',
  '结合链接原文，给出简要解读',
  '还有哪些角度值得深挖？',
];

interface ChatContainerProps {
  messages: ChatMessage[];
  isTyping: boolean;
  onClear: () => void;
  /** 当前对话 Agent，用于空状态文案 */
  agentName?: string | null;
  variant?: 'default' | 'dock';
  onQuickPrompt?: (text: string) => void;
  quickPrompts?: string[];
  /** 仅展示历史记录，不显示「清空」等操作 */
  readOnly?: boolean;
  /** 当前思考任务的起始时间（ms）；用于刷新后让计时延续 */
  taskStartedAt?: number | null;
  /** 上一轮已完成任务的总耗时（秒）；刷新后供工作过程面板展示 */
  completedTaskElapsedSec?: number | null;
}

export function ChatContainer({
  messages,
  isTyping,
  onClear,
  agentName,
  variant = 'default',
  onQuickPrompt,
  quickPrompts = DOCK_QUICK_PROMPTS,
  readOnly = false,
  taskStartedAt = null,
  completedTaskElapsedSec = null,
}: ChatContainerProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);

  const taskActive = !readOnly && isChatTaskActive(messages, isTyping);

  const lastUserIdx = findLastUserIndex(messages);

  function isProcessOutputActive(msg: ChatMessage, index: number): boolean {
    if (!taskActive || index <= lastUserIdx) return false;
    if (isProcessMessage(msg)) return true;
    if (msg.role === 'assistant' && index === messages.length - 1) {
      return Boolean(splitAssistantContent(msg.content).thought);
    }
    return false;
  }

  const taskTiming = useElapsedSeconds(taskActive, { startedAtMs: taskStartedAt });
  const finishedElapsedSec = !taskActive
    ? (completedTaskElapsedSec ??
        (taskTiming.completed || taskTiming.seconds > 0 ? taskTiming.seconds : null))
    : null;
  const lastMsg = messages.length > 0 ? messages[messages.length - 1] : undefined;
  const activeTaskSegments = taskActive ? collectActiveTaskSegments(messages) : [];

  const completeReplyIdx = findCompleteReplyIndexInTurn(messages);
  const lastProcessIdx = findLastProcessIndexInTurn(messages);

  function sharesTaskTiming(msg: ChatMessage, index: number): boolean {
    if (!taskActive) {
      // 完成后把总耗时挂在「工作过程」面板上（独立 process 消息）
      if (lastProcessIdx >= 0) return index === lastProcessIdx;
      // 无独立过程消息时挂在本轮正文回复（思考块可能已合并进正文）
      if (completeReplyIdx >= 0) return index === completeReplyIdx;
      return false;
    }
    if (index !== messages.length - 1) return false;
    return isProcessOutputActive(msg, index) || lastMsg?.role === 'user';
  }

  useEffect(() => {
    const el = bottomRef.current?.parentElement;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    userScrolledUpRef.current = !isAtBottom;
    if (!userScrolledUpRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [messages, isTyping]);

  if (messages.length === 0) {
    if (variant === 'dock') {
      return (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
          <ChatMascot
            size={72}
            decorative
            className="mb-3 rounded-2xl shadow-md ring-2 ring-violet-500/15"
          />
          <h3 className="mb-2 text-base font-medium text-foreground">想问点什么？</h3>
          <p className="mb-4 max-w-xs text-xs text-muted-foreground leading-relaxed">
            可直接输入问题；在资讯列表勾选文章后提问，会自动带上原文链接。
          </p>
          {onQuickPrompt && quickPrompts.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2">
              {quickPrompts.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="rounded-full border border-violet-500/20 bg-violet-500/5 px-3 py-1.5 text-xs text-violet-600 transition-colors hover:bg-violet-500/10 hover:border-violet-500/30 dark:text-violet-300"
                  onClick={() => onQuickPrompt(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
        <div className="text-center">
          <h2 className="mb-2 text-xl font-medium text-foreground/90">
            {agentName ? `与 ${agentName} 开始对话` : '欢迎使用 Finclaw'}
          </h2>
          {!agentName && (
            <p className="max-w-sm text-sm text-muted-foreground">
              你的 AI 金融助手。可以问我市场、分析或任何财经相关的问题。
            </p>
          )}
        </div>
      </div>
    );
  }

  const hasUserMessages = messages.some((m) => m.role === 'user');

  return (
    <div className="flex flex-col gap-4">
      {hasUserMessages && variant !== 'dock' && !readOnly && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onClear}
            className="rounded-md px-3 py-1 text-[11px] font-mono text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            清空对话
          </button>
        </div>
      )}

      {messages.map((msg, index) => {
        const attachTaskTiming = sharesTaskTiming(msg, index);
        return (
          <MessageBubble
            key={msg.id}
            message={msg}
            processOutputActive={isProcessOutputActive(msg, index)}
            taskElapsedSeconds={
              attachTaskTiming
                ? taskActive
                  ? taskTiming.seconds
                  : (finishedElapsedSec ?? undefined)
                : undefined
            }
            taskElapsedCompleted={attachTaskTiming && !taskActive}
          />
        );
      })}

      {taskActive && (
        <div className="flex w-full items-start">
          <ActiveTaskPanel
            seconds={taskTiming.seconds}
            segments={activeTaskSegments}
            messageId={lastMsg?.id ?? 'task'}
          />
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}