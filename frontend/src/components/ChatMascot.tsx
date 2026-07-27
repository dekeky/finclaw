import type { CSSProperties } from 'react';
import { FinclawMark } from '@/components/FinclawMark';

export type ChatMascotProps = {
  size?: number;
  className?: string;
  style?: CSSProperties;
  /** 作为装饰图时设 true，配合父级 aria-label */
  decorative?: boolean;
};

/** 对话区助手形象（空状态等），统一使用 Finclaw 品牌图标 */
export function ChatMascot({ size = 64, className, style, decorative }: ChatMascotProps) {
  return (
    <FinclawMark
      variant="mark"
      size={size}
      className={className}
      style={style}
      decorative={decorative}
    />
  );
}
