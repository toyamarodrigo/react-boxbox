import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router';
import { MotionConfig } from 'motion/react';

import { SiteLayout } from '../components/site/layout';

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
        title: 'boxbox',
      },
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
