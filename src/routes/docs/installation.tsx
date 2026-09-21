import { createFileRoute } from '@tanstack/react-router';
import { CodeBlock } from '../../components/site/code-block';
import { seo } from '../../lib/seo';

export const Route = createFileRoute('/docs/installation')({
  head: () => ({
    meta: seo({
      title: 'Installation — boxbox',
      description:
        'Bring broadcast components into your React project, one registry item at a time.',
      path: '/docs/installation',
    }),
  }),
  component: Installation,
});

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
      <Step number="06" title="Without the CLI">
        <p className="text-muted-foreground">
          Every component page has a <strong>Manual</strong> tab next to the CLI command. It lists
          the component and every <code className="font-mono">@boxbox/*</code> item it depends on as
          separate files, each with its target path, plus the theme tokens it needs and a{' '}
          <em>Copy all files</em> button. Paste them in and you are done.
        </p>
        <p className="text-muted-foreground">
          The sources there already carry the two rewrites the CLI would apply on install:
        </p>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="border-l-2 border-border pl-3 font-mono">
            @/registry/boxbox/ui/&lt;name&gt; → @/components/ui/&lt;name&gt;
          </li>
          <li className="border-l-2 border-border pl-3 font-mono">
            @/registry/boxbox/lib/&lt;name&gt; → @/lib/&lt;name&gt;
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">
          <code className="font-mono">@/lib/utils</code> is left alone: shadcn already puts{' '}
          <code className="font-mono">cn</code> there. If your project has no{' '}
          <code className="font-mono">components.json</code>, the Manual tab&apos;s last step shows
          the helper to add.
        </p>
      </Step>
      <Step number="07" title="Respect reduced motion">
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
