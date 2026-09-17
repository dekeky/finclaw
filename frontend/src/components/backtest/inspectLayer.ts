import type { CSSProperties } from 'react';

export type ParentDialogOpenChange = 'open' | 'close-inspect' | 'close' | 'ignore';

export function inspectOverlayStyle(extra?: CSSProperties): CSSProperties {
  return { ...extra, pointerEvents: 'auto' };
}

export function parentDialogOpenChange(
  nextOpen: boolean,
  inspectOpen: boolean,
  busy: boolean,
): ParentDialogOpenChange {
  if (nextOpen) return 'open';
  if (inspectOpen) return 'close-inspect';
  if (busy) return 'ignore';
  return 'close';
}
