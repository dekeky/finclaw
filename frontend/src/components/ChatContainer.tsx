import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../types';
import { MessageBubble } from './MessageBubble';
import { formatElapsedSeconds, useElapsedSeconds } from '../hooks/useElapsedSeconds';
import { isToolMessage } from '../utils/foldPicoclawToolFeedback';
import { isThoughtMessage } from '../utils/foldThoughtMessages';
import { splitAssistantContent } from '../utils/splitAssistantContent';
import { AgentAvatar } from './AgentAvatar';
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
  /** 当前对话 Agent，用于助手头像字母与配色 */
  agentName?: string | null;
  variant?: 'default' | 'dock';
  onQuickPrompt?: (text: string) => void;
  quickPrompts?: string[];
  /** 仅展示历史记录，不显示「清空」等操作 */
  readOnly?: boolean;
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
}: ChatContainerProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);

  function isThoughtOutputActive(msg: ChatMessage, index: number): boolean {
    if (index !== messages.length - 1) return false;
    if (isThoughtMessage(msg)) return true;
    if (isTyping && msg.role === 'assistant') {
      return Boolean(splitAssistantContent(msg.content).thought);
    }
    return false;
  }

  const lastMsg = messages.length > 0 ? messages[messages.length - 1] : undefined;
  const thoughtPanelActive =
    lastMsg != null && isThoughtOutputActive(lastMsg, messages.length - 1);
  const showTypingBubble = isTyping && !readOnly && !thoughtPanelActive;
  const typingTiming = useElapsedSeconds(showTypingBubble);

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
          {agentName ? (
            <AgentAvatar name={agentName} size="lg" className="mb-3 shadow-md shadow-violet-500/15" />
          ) : (
            <ChatMascot
              size={72}
              decorative
              className="mb-3 rounded-2xl shadow-md ring-2 ring-violet-500/15"
            />
          )}
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
                  className="rounded-full border border-violet-500/20 bg-violet-500/5 px-3 py-1.5 text-xs text-violet-600 transition-colors hover:bg-violet-500/10 hover:border-violet-500/30"
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
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16">
        {agentName ? (
          <AgentAvatar name={agentName} size="xl" className="shadow-lg shadow-violet-500/20" />
        ) : (
          <ChatMascot
            size={112}
            decorative
            className="rounded-3xl shadow-lg shadow-violet-500/15 ring-2 ring-violet-500/20"
          />
        )}
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

      {messages.map((msg, index) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          agentName={agentName ?? 'Agent'}
          variant={variant === 'dock' ? 'dock' : 'default'}
          toolOutputActive={index === messages.length - 1 && isToolMessage(msg)}
          thoughtOutputActive={isThoughtOutputActive(msg, index)}
        />
      ))}

      {showTypingBubble && (
        <div className="flex items-start gap-3">
          <AgentAvatar name={agentName ?? 'Agent'} />
          <div className="rounded-2xl rounded-tl-sm border border-border/60 bg-card px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium tabular-nums text-muted-foreground">
                努力工作中 · {formatElapsedSeconds(typingTiming.seconds)}
              </span>
              <div className="flex gap-1">
                {[0, 0.2, 0.4].map((delay) => (
                  <span
                    key={delay}
                    className="h-2 w-2 rounded-full bg-violet-400/70 animate-bounce"
                    style={{ animationDelay: `${delay}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}