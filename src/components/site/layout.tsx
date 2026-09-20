import { Link, Outlet, useLocation } from '@tanstack/react-router';
import { GitBranch, Menu, Moon, Sun } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import { byCategory, categoryNames, categoryOrder } from '../../content';
import { Button } from '../ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '../ui/sheet';

function Navigation({ close }: { close?: () => void }) {
  const { pathname } = useLocation();
  const groups = [
    {
      title: 'Getting started',
      links: [
        { name: 'Installation', href: '/docs/installation' },
        { name: 'Theming', href: '/docs/theming' },
      ],
    },
    ...categoryOrder.map((category) => ({
      title: categoryNames[category],
      links: byCategory(category).map((item) => ({
        name: item.name,
        href: `/components/${item.slug}`,
      })),
    })),
  ];
  return (
    <nav aria-label="Documentation" className="space-y-8 p-5">
      {groups.map((group) => (
        <div key={group.title}>
          <h2 className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            {group.title}
          </h2>
          <div className="space-y-1">
            {group.links.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                onClick={close}
                className={`block border-l-2 px-3 py-1.5 text-sm transition-colors hover:text-foreground ${pathname === link.href ? 'border-primary bg-accent text-foreground' : 'border-transparent text-muted-foreground'}`}
              >
                {link.name}
              </Link>
            ))}
          </div>
        </div>
      ))}
      <Link
        to="/components"
        onClick={close}
        className="block border-t border-border px-3 pt-5 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"
      >
        All components
      </Link>
    </nav>
  );
}

function ThemeToggle() {
  const dark = useSyncExternalStore(
    (notify) => {
      window.addEventListener('boxbox-theme-change', notify);
      return () => window.removeEventListener('boxbox-theme-change', notify);
    },
    () => document.documentElement.classList.contains('dark'),
    () => true,
  );
  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('boxbox-theme', next ? 'dark' : 'light');
    window.dispatchEvent(new Event('boxbox-theme-change'));
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}
    >
      {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  );
}

export function SiteLayout() {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background px-4 md:px-8">
        <div className="flex items-center gap-3">
          <div className="lg:hidden">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open navigation">
                  <Menu aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <SheetHeader className="border-b border-border">
                  <SheetTitle className="font-display text-xl font-black">boxbox</SheetTitle>
                </SheetHeader>
                <Navigation close={() => setOpen(false)} />
              </SheetContent>
            </Sheet>
          </div>
          <Link to="/" className="font-display text-2xl font-black tracking-tight">
            boxbox<span className="text-primary">.</span>
          </Link>
          <span className="hidden border-l border-border pl-3 text-xs uppercase tracking-[0.2em] text-muted-foreground sm:inline">
            Broadcast UI
          </span>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button variant="ghost" size="icon" asChild>
            <a
              href="https://github.com/toyamarodrigo/react-boxbox"
              aria-label="GitHub repository"
              target="_blank"
              rel="noreferrer"
            >
              <GitBranch aria-hidden="true" />
            </a>
          </Button>
        </div>
      </header>
      <div className="mx-auto grid max-w-[1500px] lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden min-h-[calc(100vh-4rem)] border-r border-border lg:block">
          <Navigation />
        </aside>
        <main id="content" className="min-w-0 px-5 py-10 md:px-10 lg:px-14">
          <div className="mx-auto max-w-5xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
