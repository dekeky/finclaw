import { useCallback, useRef } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '@/lib/cn';

const EDITOR_FONT = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
const EDITOR_PADDING = '1rem';
const EDITOR_FONT_SIZE = '13px';
const EDITOR_LINE_HEIGHT = 1.625;

interface StrategyCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

export function StrategyCodeEditor({
  value,
  onChange,
  disabled,
  className,
  placeholder = '# Python 策略文件',
}: StrategyCodeEditorProps) {
  const highlightRef = useRef<HTMLDivElement>(null);

  const syncScroll = useCallback((el: HTMLTextAreaElement) => {
    const layer = highlightRef.current;
    if (!layer) return;
    layer.scrollTop = el.scrollTop;
    layer.scrollLeft = el.scrollLeft;
  }, []);

  return (
    <div
      className={cn(
        'relative min-h-0 flex-1 overflow-hidden bg-[#1e1e1e] dark:bg-[#0d0d0d]',
        className,
      )}
    >
      <div
        ref={highlightRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-auto"
      >
        <SyntaxHighlighter
          language="python"
          style={oneDark}
          PreTag="div"
          customStyle={{
            margin: 0,
            padding: EDITOR_PADDING,
            fontSize: EDITOR_FONT_SIZE,
            lineHeight: EDITOR_LINE_HEIGHT,
            fontFamily: EDITOR_FONT,
            background: 'transparent',
            minHeight: '100%',
          }}
          codeTagProps={{
            style: {
              fontFamily: EDITOR_FONT,
              fontSize: EDITOR_FONT_SIZE,
              lineHeight: EDITOR_LINE_HEIGHT,
            },
          }}
        >
          {value.length > 0 ? value : ' '}
        </SyntaxHighlighter>
      </div>

      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => syncScroll(e.currentTarget)}
        disabled={disabled}
        spellCheck={false}
        placeholder={placeholder}
        className={cn(
          'relative z-10 block h-full min-h-full w-full resize-none border-0 bg-transparent outline-none',
          'font-mono text-[13px] leading-relaxed text-transparent caret-[#d4d4d4]',
          'placeholder:text-[#6b7280]',
        )}
        style={{
          padding: EDITOR_PADDING,
          lineHeight: EDITOR_LINE_HEIGHT,
          tabSize: 4,
        }}
      />
    </div>
  );
}
