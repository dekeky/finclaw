import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function Hint({ text }: { text: string }) {
  const markRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, below: false });

  function show() {
    const el = markRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = 220;
    const gap = 8;
    const below = rect.top < 88;
    const half = width / 2;
    const left = Math.min(Math.max(rect.left + rect.width / 2, half + 12), window.innerWidth - half - 12);
    setPos({
      top: below ? rect.bottom + gap : rect.top - gap,
      left,
      below,
    });
    setOpen(true);
  }

  return (
    <span
      className="hint"
      tabIndex={0}
      ref={markRef}
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
      onFocus={show}
      onBlur={() => setOpen(false)}
    >
      <span className="hint-mark" aria-label={text}>
        ?
      </span>
      {open
        ? createPortal(
            <span
              className={`hint-pop ${pos.below ? 'below' : 'above'}`}
              role="tooltip"
              style={{ top: pos.top, left: pos.left }}
            >
              {text}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
