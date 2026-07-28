import { useCallback, useMemo, useRef, type CSSProperties } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '@/lib/cn';

const EDITOR_FONT = "'JetBrains Mono', ui-monospace, monospace";
const EDITOR_PADDING = '1rem';
const EDITOR_FONT_SIZE = '13px';
const EDITOR_LINE_HEIGHT = 1.625;

const sharedEditorTypography = {
  margin: 0,
  padding: EDITOR_PADDING,
  fontFamily: EDITOR_FONT,
  fontSize: EDITOR_FONT_SIZE,
  lineHeight: EDITOR_LINE_HEIGHT,
  fontWeight: 'normal' as const,
  fontStyle: 'normal' as const,
  letterSpacing: 0,
  tabSize: 4,
  MozTabSize: 4,
  whiteSpace: 'pre' as const,
  wordWrap: 'normal' as const,
  overflowWrap: 'normal' as const,
};

/** Token styles must not change glyph width, or the caret drifts from highlighted text. */
function flattenHighlightStyle(
  style: Record<string, CSSProperties>,
): Record<string, CSSProperties> {
  const flattened: Record<string, React.CSSProperties> = {};
  for (const [key, value] of Object.entries(style)) {
    flattened[key] = {
      ...value,
      fontFamily: EDITOR_FONT,
      fontSize: EDITOR_FONT_SIZE,
      lineHeight: EDITOR_LINE_HEIGHT,
      fontWeight: 'normal',
      fontStyle: 'normal',
      letterSpacing: 0,
    };
  }
  return flattened;
}

interface StrategyCodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  placeholder?: string;
}

export function StrategyCodeEditor({
  value,
  onChange,
  disabled,
  readOnly = false,
  className,
  placeholder = '# Python 策略文件',
}: StrategyCodeEditorProps) {
  const highlightRef = useRef<HTMLDivElement>(null);
  const highlightStyle = useMemo(() => flattenHighlightStyle(oneDark), []);

  const syncScroll = useCallback((el: HTMLTextAreaElement) => {
    const layer = highlightRef.current;
    if (!layer) return;
    layer.scrollTop = el.scrollTop;
    layer.scrollLeft = el.scrollLeft;
  }, []);

  if (readOnly) {
    return (
      <div
        className={cn(
          'min-h-0 flex-1 overflow-auto bg-[#1e1e1e] dark:bg-[#0d0d0d]',
          className,
        )}
      >
        <SyntaxHighlighter
          language="python"
          style={highlightStyle}
          PreTag="div"
          wrapLongLines={false}
          customStyle={{
            ...sharedEditorTypography,
            background: 'transparent',
            minHeight: '100%',
          }}
          codeTagProps={{
            style: {
              ...sharedEditorTypography,
              background: 'transparent',
            },
          }}
        >
          {value.length > 0 ? value : ' '}
        </SyntaxHighlighter>
      </div>
    );
  }

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
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <SyntaxHighlighter
          language="python"
          style={highlightStyle}
          PreTag="div"
          wrapLongLines={false}
          customStyle={{
            ...sharedEditorTypography,
            background: 'transparent',
            minHeight: '100%',
          }}
          codeTagProps={{
            style: {
              ...sharedEditorTypography,
              background: 'transparent',
            },
          }}
        >
          {value.length > 0 ? value : ' '}
        </SyntaxHighlighter>
      </div>

      <textarea
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onScroll={(e) => syncScroll(e.currentTarget)}
        disabled={disabled}
        readOnly={readOnly}
        spellCheck={false}
        wrap="off"
        placeholder={placeholder}
        className={cn(
          'relative z-10 block h-full min-h-full w-full resize-none overflow-auto border-0 bg-transparent outline-none',
          readOnly ? 'cursor-default text-transparent caret-transparent' : 'text-transparent caret-[#d4d4d4]',
          'placeholder:text-[#6b7280]',
        )}
        style={sharedEditorTypography}
      />
    </div>
  );
}
