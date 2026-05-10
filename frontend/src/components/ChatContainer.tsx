import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../types';
import { MessageBubble } from './MessageBubble';

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
  variant = 'default',
  onQuickPrompt,
  quickPrompts = DOCK_QUICK_PROMPTS,
  readOnly = false,
}: ChatContainerProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  if (messages.length === 0) {
    if (variant === 'dock') {
      return (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
          <div className="mb-3 text-4xl" aria-hidden>✨</div>
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
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-violet-600 text-3xl text-white shadow-lg shadow-violet-500/20">
          💼
        </div>
        <div className="text-center">
          <h2 className="mb-2 text-xl font-medium text-foreground/90">Welcome to Finclaw</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Your AI-powered financial assistant. Ask questions about markets, analysis, or any financial topic.
          </p>
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

      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} variant={variant === 'dock' ? 'dock' : 'default'} />
      ))}

      {isTyping && !readOnly && (
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-100 to-amber-200 text-xs font-semibold text-amber-700 dark:from-amber-900/50 dark:to-amber-950/30">
            AI
          </div>
          <div className="rounded-2xl rounded-tl-sm border border-border/60 bg-card px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">正在思考…</span>
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