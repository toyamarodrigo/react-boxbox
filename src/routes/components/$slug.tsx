import { createFileRoute, notFound } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import type { ComponentType } from 'react';
import { getBySlug, getModules, manifest } from '../../content';
import { ComponentPageBody } from '../../components/site/component-page';

const registrySources = import.meta.glob('/registry/boxbox/*/*.tsx', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
function createContentPage(slug: string) {
  const modules = getModules(slug);
  const Page = lazy(async () => {
    const [controls, demo, fallback] = await Promise.all([
      modules.controls(),
      modules.demo(),
      modules.source(),
    ]);
    const meta = getBySlug(slug);
    if (!meta) throw notFound();
    const source =
      registrySources[`/registry/boxbox/${meta.registryName}/${meta.registryName}.tsx`] ??
      fallback.default;
    return {
      default: () => (
        <ComponentPageBody
          meta={meta}
          definition={
            controls.default as React.ComponentProps<typeof ComponentPageBody>['definition']
          }
          Demo={demo.default as React.ComponentProps<typeof ComponentPageBody>['Demo']}
          source={source}
        />
      ),
    };
  });
  return Page;
}

const pages = Object.fromEntries(
  manifest.map((meta) => [meta.slug, createContentPage(meta.slug)]),
) as Record<string, ComponentType>;

export const Route = createFileRoute('/components/$slug')({
  loader: ({ params }) => {
    const meta = getBySlug(params.slug);
    if (!meta) throw notFound();
    return meta;
  },
  component: ComponentRoute,
});

function ComponentRoute() {
  const meta = Route.useLoaderData();
  const Page = pages[meta.slug];
  if (!Page) throw notFound();
  return (
    <Suspense
      fallback={
        <div>
          <h1 className="font-display text-5xl font-black">{meta.name}</h1>
          <p className="mt-4">bunx shadcn@latest add @boxbox/{meta.registryName}</p>
        </div>
      }
    >
      <Page />
    </Suspense>
  );
}
