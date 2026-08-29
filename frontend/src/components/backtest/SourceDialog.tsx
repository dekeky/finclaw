import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { StrategyCodeEditor } from '@/components/StrategyCodeEditor';
import { copyToClipboard } from '@/lib/clipboard';

const FONT_MIN = 11;
const FONT_MAX = 22;
const FONT_STEP = 1;
const FONT_DEFAULT = 13;

export default function SourceDialog({
  source,
  title,
  onClose,
}: {
  source: string;
  title: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [fontSize, setFontSize] = useState(FONT_DEFAULT);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopImmediatePropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copySource() {
    try {
      await copyToClipboard(source);
      setCopied(true);
    } catch {
      // keep label unchanged if copy fails
    }
  }

  return createPortal(
    <div className="fquant-ui modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal source-modal"
        role="dialog"
        aria-labelledby="source-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <strong id="source-title">{title} · 回测源码</strong>
          <div className="modal-head-actions">
            <button className="source-copy-btn" type="button" onClick={() => void copySource()} title="复制源码">
              {copied ? '已复制' : '复制'}
            </button>
            <button
              className="icon-btn"
              type="button"
              onClick={() => setFontSize((size) => Math.max(FONT_MIN, size - FONT_STEP))}
              disabled={fontSize <= FONT_MIN}
              title="缩小字号"
              aria-label="缩小字号"
            >
              −
            </button>
            <button
              className="icon-btn"
              type="button"
              onClick={() => setFontSize((size) => Math.min(FONT_MAX, size + FONT_STEP))}
              disabled={fontSize >= FONT_MAX}
              title="放大字号"
              aria-label="放大字号"
            >
              +
            </button>
            <button className="icon-btn" type="button" onClick={onClose} aria-label="关闭">
              ×
            </button>
          </div>
        </div>
        <div className="source-modal-body">
          <StrategyCodeEditor value={source} readOnly fontSize={fontSize} mouseWheelZoom />
        </div>
      </div>
    </div>,
    document.body,
  );
}
