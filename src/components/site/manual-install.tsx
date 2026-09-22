import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { bundleToText, languageOf } from '../../lib/registry-bundle';
import type { ManualBundle } from '../../lib/registry-items';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { CodeBlock } from './code-block';

export type PackageManager = 'bun' | 'pnpm' | 'npm';

const addCommand: Record<PackageManager, string> = {
  bun: 'bun add',
  pnpm: 'pnpm add',
  npm: 'npm install',
};

const cnFallback = `import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}`;

function Step({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="grid gap-3 md:grid-cols-[2.5rem_minmax(0,1fr)]">
      <span aria-hidden="true" className="font-mono text-sm text-primary">
        {number}
      </span>
      <div className="min-w-0 space-y-3">
        <h3 className="font-display text-lg font-bold">{title}</h3>
        {children}
      </div>
    </li>
  );
}

function CopyAllButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  return (
    <Button variant="outline" size="sm" onClick={() => void copy()}>
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      {copied ? 'Copied all files' : 'Copy all files'}
    </Button>
  );
}

export function ManualInstall({
  bundle,
  manager,
  managerSelect,
}: {
  bundle: ManualBundle;
  manager: PackageManager;
  /** The shared package-manager picker, rendered by the page. */
  managerSelect: React.ReactNode;
}) {
  const first = bundle.files[0];
  const installCommand = bundle.npmDependencies.length
    ? `${addCommand[manager]} ${bundle.npmDependencies.join(' ')}`
    : '';

  if (!first) {
    return (
      <p className="text-sm text-muted-foreground">
        Build the registry to see the copy-paste sources for this component.
      </p>
    );
  }

  // Built as a list so the numbers stay in order whichever steps a component needs.
  const steps: { title: string; body: React.ReactNode }[] = [];

  if (bundle.shadcnItems.length > 0) {
    steps.push({
      title: 'Add the shadcn components it builds on',
      body: (
        <>
          <p className="text-sm text-muted-foreground">
            These come from shadcn's own registry, so the CLI installs them rather than this page.
          </p>
          <CodeBlock
            code={`bunx shadcn@latest add ${bundle.shadcnItems.join(' ')}`}
            language="bash"
          />
        </>
      ),
    });
  }

  if (installCommand) {
    steps.push({
      title: 'Install the dependencies',
      body: (
        <>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Package manager</span>
            {managerSelect}
          </div>
          <CodeBlock code={installCommand} language="bash" />
        </>
      ),
    });
  }

  if (bundle.themeCss) {
    steps.push({
      title: 'Add the theme tokens',
      body: (
        <>
          <p className="text-sm text-muted-foreground">
            Paste these into your global stylesheet, next to the tokens shadcn already wrote.
          </p>
          <CodeBlock code={bundle.themeCss} language="css" />
        </>
      ),
    });
  }

  steps.push({
    title: 'Copy the files',
    body: (
      <>
        <div className="flex flex-wrap items-center gap-3">
          <CopyAllButton text={bundleToText(bundle.files)} />
          <span className="text-sm text-muted-foreground">
            {bundle.files.length} file{bundle.files.length === 1 ? '' : 's'}
          </span>
        </div>
        <Tabs defaultValue={first.targetPath}>
          {/* Six file tabs do not fit 375px; the list scrolls instead of
              widening the page. */}
          <div className="-mx-1 max-w-full overflow-x-auto px-1">
            <TabsList>
              {bundle.files.map((file) => (
                <TabsTrigger key={file.targetPath} value={file.targetPath} className="font-mono">
                  {file.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {bundle.files.map((file) => (
            <TabsContent key={file.targetPath} value={file.targetPath} className="space-y-2">
              <p className="font-mono text-xs text-muted-foreground">{file.targetPath}</p>
              <CodeBlock code={file.content} language={languageOf(file.targetPath)} />
            </TabsContent>
          ))}
        </Tabs>
      </>
    ),
  });

  steps.push({
    title: 'Check your cn helper',
    body: (
      <>
        <p className="text-sm text-muted-foreground">
          Every file imports <code className="font-mono">cn</code> from{' '}
          <code className="font-mono">@/lib/utils</code>, which shadcn installs. If your project has
          no such file, create it:
        </p>
        <CodeBlock code={cnFallback} language="ts" />
      </>
    ),
  });

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        The files below are the registry sources with their imports already rewritten for a standard
        shadcn project.
        {bundle.shadcnItems.length === 0 && ' No CLI needed.'}
      </p>
      <ol className="space-y-8">
        {steps.map((step, index) => (
          <Step key={step.title} number={String(index + 1).padStart(2, '0')} title={step.title}>
            {step.body}
          </Step>
        ))}
      </ol>
    </div>
  );
}
