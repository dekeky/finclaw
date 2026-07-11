import { useEffect, useRef, type ReactNode } from 'react';
import type { ChatMessage } from '../types';
import { ActiveTaskPanel, MessageBubble, TurnProcessPanel } from './MessageBubble';
import { useElapsedSeconds } from '../hooks/useElapsedSeconds';
import {
  findCompleteReplyIndexAfterUser,
  findCompleteReplyIndexInTurn,
  findLastProcessIndexAfterUser,
  isTaskTimingActive,
} from '../utils/chatTaskState';
import {
  collectProcessSegmentsForTurn,
  findLastUserIndex,
  isProcessMessage,
} from '../utils/foldProcessMessages';
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
}

function getTurnElapsedSec(messages: ChatMessage[], userIdx: number): number | undefined {
  const processIdx = findLastProcessIndexAfterUser(messages, userIdx);
  if (processIdx >= 0 && messages[processIdx].taskElapsedSec != null) {
    return messages[processIdx].taskElapsedSec;
  }
  const replyIdx = findCompleteReplyIndexAfterUser(messages, userIdx);
  if (replyIdx >= 0 && messages[replyIdx].taskElapsedSec != null) {
    return messages[replyIdx].taskElapsedSec;
  }
  return undefined;
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
}: ChatContainerProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  /** 上次已跟随滚动的正文回复快照；过程消息更新不触发视口滚动 */
  const lastReplyScrollKeyRef = useRef<string | null>(null);

  const taskActive = !readOnly && isTaskTimingActive(messages, isTyping, taskStartedAt);
  const lastUserIdx = findLastUserIndex(messages);
  const taskTiming = useElapsedSeconds(taskActive, { startedAtMs: taskStartedAt });
  const activeTaskSegments = taskActive
    ? collectProcessSegmentsForTurn(messages, lastUserIdx)
    : [];

  useEffect(() => {
    const replyIdx = findCompleteReplyIndexInTurn(messages);
    if (replyIdx < 0) return;

    const reply = messages[replyIdx];
    const scrollKey = `${reply.id}:${reply.content.length}`;
    if (scrollKey === lastReplyScrollKeyRef.current) return;
    lastReplyScrollKeyRef.current = scrollKey;

    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages]);

  function renderTurnMessages(): ReactNode[] {
    const userIndices: number[] = [];
    messages.forEach((m, i) => {
      if (m.role === 'user') userIndices.push(i);
    });

    const nodes: ReactNode[] = [];
    for (let t = 0; t < userIndices.length; t++) {
      const userIdx = userIndices[t];
      const turnEnd = userIndices[t + 1] ?? messages.length;
      const isCurrentTurn = userIdx === lastUserIdx;
      const turnSegments = collectProcessSegmentsForTurn(messages, userIdx);
      const showTurnProcess = turnSegments.length > 0 && !(taskActive && isCurrentTurn);

      nodes.push(<MessageBubble key={messages[userIdx].id} message={messages[userIdx]} />);

      if (showTurnProcess) {
        nodes.push(
          <div key={`turn-process-${userIdx}`} className="flex min-w-0 w-full flex-col gap-1">
            <TurnProcessPanel
              segments={turnSegments}
              messageId={`turn-${userIdx}`}
              taskElapsedSeconds={getTurnElapsedSec(messages, userIdx)}
            />
          </div>,
        );
      }

      for (let i = userIdx + 1; i < turnEnd; i++) {
        const msg = messages[i];
        if (isProcessMessage(msg)) continue;

        nodes.push(<MessageBubble key={msg.id} message={msg} />);
      }
    }
    return nodes;
  }

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

      {renderTurnMessages()}

      {taskActive && (
        <div className="flex w-full items-start">
          <ActiveTaskPanel
            seconds={taskTiming.seconds}
            segments={activeTaskSegments}
            messageId={`turn-${lastUserIdx}`}
          />
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
