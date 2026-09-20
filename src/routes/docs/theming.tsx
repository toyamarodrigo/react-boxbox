import { createFileRoute } from '@tanstack/react-router';
import registry from '../../../registry.json';
import { CodeBlock } from '../../components/site/code-block';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';

export const Route = createFileRoute('/docs/theming')({ component: Theming });

const theme = registry.items.find((item) => item.name === 'boxbox-theme');
const light: Record<string, string> = theme?.cssVars?.light ?? {};
const dark: Record<string, string> = theme?.cssVars?.dark ?? {};
const tokens = Object.entries(light).filter(([key]) =>
  /^(sector|status|tyre|flag|font)-/.test(key),
);

function Theming() {
  return (
    <article>
      <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-primary">
        Getting started
      </p>
      <h1 className="font-display text-5xl font-black tracking-tight">Theming</h1>
      <p className="my-8 max-w-2xl text-lg text-muted-foreground">
        The theme extends shadcn tokens with race semantics. Each token has a light and dark value,
        so components adapt to the class on <code className="font-mono text-sm">&lt;html&gt;</code>.
      </p>
      <h2 className="mb-4 font-display text-2xl font-bold">Broadcast tokens</h2>
      <div className="overflow-x-auto border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Token</TableHead>
              <TableHead>Light</TableHead>
              <TableHead>Dark</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tokens.map(([key, value]) => (
              <TableRow key={key}>
                <TableCell className="font-mono text-xs">--{key}</TableCell>
                {[value, dark[key]].map((colour, index) => (
                  <TableCell key={index} className="font-mono text-xs">
                    {key.startsWith('font-') ? null : (
                      <span
                        aria-hidden="true"
                        className="mr-2 inline-block size-4 align-middle ring-1 ring-border"
                        style={{ backgroundColor: colour }}
                      />
                    )}
                    {colour}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <h2 className="mb-4 mt-12 font-display text-2xl font-bold">Override a token</h2>
      <p className="mb-4 text-muted-foreground">
        Override a semantic value after installing the theme:
      </p>
      <CodeBlock language="tsx" code={`.dark {\n  --sector-fastest: oklch(0.65 0.18 305);\n}`} />
      <p className="mt-6 text-sm text-muted-foreground">
        Components only use <code className="font-mono">--font-display</code> and{' '}
        <code className="font-mono">--font-mono</code> for typography. Set those variables to use
        your own fonts.
      </p>
    </article>
  );
}
