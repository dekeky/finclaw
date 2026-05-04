import type { CSSProperties } from 'react';
import markPng from '../assets/branding/finclaw-mark.png';
import logoPng from '../assets/branding/finclaw-logo.png';

export type FinclawMarkProps = {
  /** `mark`：小图标（约 128px 资源缩放）；`logo`：较大展示（约 256px 资源） */
  variant?: 'mark' | 'logo';
  size?: number;
  className?: string;
  style?: CSSProperties;
  /** 作为装饰图时设 true，配合父级 aria-label */
  decorative?: boolean;
};

export function FinclawMark({
  variant = 'mark',
  size = 32,
  className,
  style,
  decorative,
}: FinclawMarkProps) {
  const src = variant === 'logo' ? logoPng : markPng;
  return (
    <img
      src={src}
      alt={decorative ? '' : 'Finclaw'}
      width={size}
      height={size}
      className={className}
      style={{ display: 'block', objectFit: 'contain', flexShrink: 0, ...style }}
      decoding="async"
      loading="eager"
    />
  );
}
