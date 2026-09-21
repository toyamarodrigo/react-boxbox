import { createFileRoute, notFound } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import type { ComponentType } from 'react';
import { getBySlug, getModules, manifest } from '../../content';
import { ComponentPageBody } from '../../components/site/component-page';
import { manualBundle } from '../../lib/registry-items';
import { seo } from '../../lib/seo';

function createContentPage(slug: string) {
  const modules = getModules(slug);
  const Page = lazy(async () => {
    const [controls, demo] = await Promise.all([modules.controls(), modules.demo()]);
    const meta = getBySlug(slug);
    if (!meta) throw notFound();
    const bundle = manualBundle(meta.registryName);
    return {
      default: () => (
        <ComponentPageBody
          meta={meta}
          definition={
            controls.default as React.ComponentProps<typeof ComponentPageBody>['definition']
          }
          Demo={demo.default as React.ComponentProps<typeof ComponentPageBody>['Demo']}
          bundle={bundle}
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
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    return {
      meta: seo({
        title: `${loaderData.name} — boxbox`,
        description: loaderData.description,
        path: `/components/${loaderData.slug}`,
        image: `/og/${loaderData.slug}.png`,
      }),
    };
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
