import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react';
import type { IDisposable, editor, languages, Position } from 'monaco-editor';
import { useCallback, useEffect, useRef } from 'react';
import { api, type IndicatorItem } from '@/api/backtest';
import { cn } from '@/lib/cn';
import '@/lib/monacoSetup';

const EDITOR_FONT = "'JetBrains Mono', ui-monospace, monospace";
const EDITOR_BG = '#1e1e1e';
const THEME_NAME = 'finclaw-strategy-dark';

type Monaco = Parameters<OnMount>[1];

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
  suggest: { showWords: true },
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

let indicatorItems: IndicatorItem[] = [];
let completionProvider: IDisposable | null = null;

function wantsIndicatorCompletion(line: string): boolean {
  return line.includes('fquant.indicators') || /\bextra\b/.test(line);
}

function installIndicatorCompletions(monaco: Monaco) {
  if (!indicatorItems.length) return;
  completionProvider?.dispose();
  completionProvider = monaco.languages.registerCompletionItemProvider('python', {
    triggerCharacters: [',', '[', ' '],
    provideCompletionItems(model: editor.ITextModel, position: Position) {
      const line = model.getLineContent(position.lineNumber);
      if (!wantsIndicatorCompletion(line)) return { suggestions: [] };
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const suggestions: languages.CompletionItem[] = indicatorItems.map((item) => ({
        label: item.id,
        kind: monaco.languages.CompletionItemKind.Constant,
        insertText: item.id,
        detail: item.label,
        documentation: `${item.group} · ${item.source}`,
        range,
      }));
      return { suggestions };
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
  fontSize?: number;
  mouseWheelZoom?: boolean;
}

export function StrategyCodeEditor({
  value,
  onChange,
  disabled,
  readOnly = false,
  className,
  placeholder: placeholderText = '# Python 策略文件',
  fontSize,
  mouseWheelZoom = false,
}: StrategyCodeEditorProps) {
  const monacoRef = useRef<Monaco | null>(null);

  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    defineStrategyTheme(monaco);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .listIndicators()
      .then((payload) => {
        if (cancelled) return;
        indicatorItems = payload.items ?? [];
        if (monacoRef.current) installIndicatorCompletions(monacoRef.current);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const handleMount: OnMount = (_editor, monaco) => {
    monacoRef.current = monaco;
    installIndicatorCompletions(monaco);
  };

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
        onMount={handleMount}
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
          fontSize: fontSize ?? editorOptions.fontSize,
          mouseWheelZoom,
          placeholder: value.length === 0 ? placeholderText : undefined,
        }}
      />
    </div>
  );
}
