import Editor, { type BeforeMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useCallback } from 'react';
import { cn } from '@/lib/cn';

const EDITOR_FONT = "'JetBrains Mono', ui-monospace, monospace";
const EDITOR_BG = '#1e1e1e';
const THEME_NAME = 'finclaw-strategy-dark';

const editorOptions: editor.IStandaloneEditorConstructionOptions = {
  language: 'python',
  theme: THEME_NAME,
  fontFamily: EDITOR_FONT,
  fontSize: 13,
  lineHeight: 21,
  padding: { top: 16, bottom: 16 },
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  wordWrap: 'on',
  automaticLayout: true,
  tabSize: 4,
  insertSpaces: true,
  renderLineHighlight: 'line',
  lineNumbers: 'on',
  folding: false,
  glyphMargin: false,
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  scrollbar: {
    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10,
  },
};

function defineStrategyTheme(monaco: typeof import('monaco-editor')) {
  monaco.editor.defineTheme(THEME_NAME, {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': EDITOR_BG,
      'editor.lineHighlightBackground': '#ffffff0a',
      'editorGutter.background': EDITOR_BG,
    },
  });
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
  placeholder: placeholderText = '# Python 策略文件',
}: StrategyCodeEditorProps) {
  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    defineStrategyTheme(monaco);
  }, []);

  const isReadOnly = readOnly || disabled;

  return (
    <div
      className={cn(
        'min-h-0 flex-1 overflow-hidden bg-[#1e1e1e] dark:bg-[#0d0d0d]',
        className,
      )}
    >
      <Editor
        height="100%"
        language="python"
        theme={THEME_NAME}
        value={value}
        beforeMount={handleBeforeMount}
        onChange={isReadOnly ? undefined : (next) => onChange?.(next ?? '')}
        loading={
          <div className="flex h-full items-center justify-center text-sm text-[#6b7280]">
            加载编辑器…
          </div>
        }
        options={{
          ...editorOptions,
          readOnly: isReadOnly,
          domReadOnly: isReadOnly,
          placeholder: value.length === 0 ? placeholderText : undefined,
        }}
      />
    </div>
  );
}
