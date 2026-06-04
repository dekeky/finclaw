import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

export interface CodeBlockProps {
  code: string;
  lang: string;
  dark: boolean;
}

export default function CodeBlock({ code, lang, dark }: CodeBlockProps) {
  return (
    <SyntaxHighlighter
      style={dark ? oneDark : oneLight}
      language={lang}
      PreTag="div"
      customStyle={{
        margin: 0,
        padding: '12px 14px',
        fontSize: '13px',
        lineHeight: 1.55,
        background: 'transparent',
      }}
      codeTagProps={{
        style: {
          // Ensure code text inherits proper color from the syntax theme
          // rather than being overridden by prose styles
        },
      }}
    >
      {code}
    </SyntaxHighlighter>
  );
}
