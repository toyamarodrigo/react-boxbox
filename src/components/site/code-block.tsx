import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../ui/button';

type Language = 'tsx' | 'ts' | 'bash' | 'css';

export function CodeBlock({ code, language }: { code: string; language: Language }) {
  const [highlighted, setHighlighted] = useState<{ key: string; html: string }>();
  const key = `${language}:${code}`;
  const html = highlighted?.key === key ? highlighted.html : undefined;
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let active = true;
    async function highlight() {
      const [{ createHighlighterCore }, { createOnigurumaEngine }, theme, tsx, ts, bash, css] =
        await Promise.all([
          import('shiki/core'),
          import('shiki/engine/oniguruma'),
          import('@shikijs/themes/github-dark'),
          import('@shikijs/langs/tsx'),
          import('@shikijs/langs/ts'),
          import('@shikijs/langs/bash'),
          import('@shikijs/langs/css'),
        ]);
      const highlighter = await createHighlighterCore({
        themes: [theme.default],
        langs: [tsx.default, ts.default, bash.default, css.default],
        engine: createOnigurumaEngine(import('shiki/wasm')),
      });
      if (active)
        setHighlighted({
          key,
          html: highlighter.codeToHtml(code, { lang: language, theme: 'github-dark' }),
        });
      highlighter.dispose();
    }
    void highlight().catch(() => {
      /* Plain source remains readable. */
    });
    return () => {
      active = false;
    };
  }, [code, language, key]);
  async function copy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  return (
    <div className="relative overflow-hidden border border-border bg-[#0d1117] text-sm text-white">
      <Button
        className="absolute right-2 top-2 z-10"
        variant="secondary"
        size="sm"
        onClick={() => void copy()}
        aria-label={copied ? 'Copied' : 'Copy code'}
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        {/* The word costs half the width of a 375px code block; the button
            keeps its accessible name from `aria-label`. */}
        <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
      </Button>
      <div
        className="max-h-[460px] overflow-auto p-4 pr-16 font-mono text-xs leading-6 sm:pr-24"
        {...(html
          ? { dangerouslySetInnerHTML: { __html: html } }
          : { children: <pre className="whitespace-pre-wrap">{code}</pre> })}
      />
    </div>
  );
}
