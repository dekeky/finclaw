import type { CSSProperties } from 'react';
import mascotPng from '@/assets/chat/finclaw-anime-mascot.png';

export type ChatMascotProps = {
  size?: number;
  className?: string;
  style?: CSSProperties;
  /** 作为装饰图时设 true，配合父级 aria-label */
  decorative?: boolean;
};

/** 对话区二次元助手形象（空状态、助手头像等） */
export function ChatMascot({ size = 64, className, style, decorative }: ChatMascotProps) {
  return (
    <img
      src={mascotPng}
      alt={decorative ? '' : 'Finclaw 助手'}
      width={size}
      height={size}
      className={className}
      style={{ display: 'block', objectFit: 'cover', flexShrink: 0, ...style }}
      decoding="async"
      loading="eager"
    />
  );
}

/** 消息列表中的助手头像（36px） */
export function AssistantAvatar({ className }: { className?: string }) {
  return (
    <ChatMascot
      size={36}
      decorative
      className={`h-9 w-9 shrink-0 rounded-xl ring-1 ring-border/40 ${className ?? ''}`}
    />
  );
}
