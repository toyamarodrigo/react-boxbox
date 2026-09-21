import { createFileRoute } from '@tanstack/react-router';
import { CodeBlock } from '../../components/site/code-block';

export const Route = createFileRoute('/docs/installation')({ component: Installation });

const registry = `{
  "registries": {
    "@boxbox": "https://react-boxbox.vercel.app/r/{name}.json"
  }
}`;

const motionConfig = `import { MotionConfig } from 'motion/react';

export function App({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
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
    <section className="grid gap-4 border-t border-border py-8 md:grid-cols-[70px_1fr]">
      <div className="font-mono text-sm text-primary">{number}</div>
      <div className="space-y-4">
        <h2 className="font-display text-2xl font-bold">{title}</h2>
        {children}
      </div>
    </section>
  );
}

function Installation() {
  return (
    <article>
      <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-primary">
        Getting started
      </p>
      <h1 className="font-display text-5xl font-black tracking-tight">Installation</h1>
      <p className="my-8 max-w-2xl text-lg text-muted-foreground">
        Bring broadcast components into your React project, one registry item at a time.
      </p>
      <Step number="01" title="Prerequisites">
        <p className="text-muted-foreground">
          Use React 19, Tailwind CSS v4, and an initialized shadcn project.
        </p>
      </Step>
      <Step number="02" title="Register the namespace">
        <p className="text-muted-foreground">Add the boxbox registry with the CLI:</p>
        <CodeBlock
          language="bash"
          code="bunx shadcn@latest registry add @boxbox=https://react-boxbox.vercel.app/r/{name}.json"
        />
        <p className="text-sm text-muted-foreground">
          Or add this to your <code className="font-mono">components.json</code>:
        </p>
        <CodeBlock language="tsx" code={registry} />
      </Step>
      <Step number="03" title="Install the theme">
        <CodeBlock language="bash" code="bunx shadcn@latest add @boxbox/boxbox-theme" />
        <p className="text-sm text-muted-foreground">
          Add the <code className="font-mono">dark</code> class to{' '}
          <code className="font-mono">&lt;html&gt;</code> to use the dark palette.
        </p>
      </Step>
      <Step number="04" title="Optional fonts">
        <p className="text-muted-foreground">
          For the intended display and timing typography, install the font registry item.
        </p>
        <CodeBlock language="bash" code="bunx shadcn@latest add @boxbox/boxbox-fonts" />
      </Step>
      <Step number="05" title="Add a component">
        <p className="text-muted-foreground">
          Choose a component page, then run its CLI command in your project.
        </p>
        <CodeBlock language="bash" code="bunx shadcn@latest add @boxbox/<component-name>" />
      </Step>
      <Step number="06" title="Respect reduced motion">
        <p className="text-muted-foreground">
          Components animate with <code className="font-mono">motion</code>. Wrap your app once so
          position and layout motion follows the visitor&apos;s system setting. Colour and opacity
          changes stay on, so every state is still readable.
        </p>
        <CodeBlock language="tsx" code={motionConfig} />
      </Step>
    </article>
  );
}
