import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router';
import { MotionConfig } from 'motion/react';

import { SiteLayout } from '../components/site/layout';
import { seo } from '../lib/seo';

import appCss from '../styles.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        name: 'theme-color',
        content: '#030303',
      },
      ...seo({
        title: 'boxbox — Race graphics for React',
        description:
          'Broadcast-inspired React components for timing, race control and the pit lane, distributed through the shadcn registry.',
        path: '/',
      }),
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
  component: SiteLayout,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('boxbox-theme')==='light')document.documentElement.classList.remove('dark')}catch{}",
          }}
        />
      </head>
      <body>
        <MotionConfig reducedMotion="user">{children}</MotionConfig>

        <Scripts />
      </body>
    </html>
  );
}
