# react-boxbox

**boxbox** is a set of animated React components styled after motorsport television graphics:
timing towers, sector times, start lights, name plates. They are distributed as a
[shadcn](https://ui.shadcn.com) registry, so you install the source into your own project and
own it from there.

Site and live playground: <https://react-boxbox.vercel.app>

## Components

| Component         | Registry item               | What it is                                                                                                                  |
| ----------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Tyre Badge        | `@boxbox/tyre-badge`        | The compound and the laps on the current set. Rotates when the compound changes.                                            |
| Sector Times      | `@boxbox/sector-times`      | Three sector bars with broadcast colour coding, optional mini sectors, and a counting lap time.                             |
| Driver Name Plate | `@boxbox/driver-name-plate` | A lower third that wipes in with position, team colour, name, car number, and race status.                                  |
| Start Lights      | `@boxbox/start-lights`      | A five-column gantry that arms light by light, holds, then goes out, or flashes when the start is aborted.                  |
| Timing Tower      | `@boxbox/timing-tower`      | The running order of the field, with rows that slide as positions change and a value column for gap, interval, or last lap. |
| Replay Bumper     | `@boxbox/replay-bumper`     | A transition that sweeps over a panel so its content can change behind it.                                                  |

Shared items the components pull in for you: `boxbox-types`, `boxbox-theme`, `boxbox-motion`,
`rolling-number`, and the optional `boxbox-fonts`.

## Install

You need React 19, Tailwind CSS v4, and an initialized shadcn project.

Register the namespace once:

```bash
bunx shadcn@latest registry add @boxbox=https://react-boxbox.vercel.app/r/{name}.json
```

Install the theme, then any component:

```bash
bunx shadcn@latest add @boxbox/boxbox-theme
bunx shadcn@latest add @boxbox/timing-tower
```

The theme adds the colour tokens for sectors, tyres, flags, and track status. Add the `dark`
class to `<html>` for the dark palette. Light mode is supported.

Components read `--font-display` and `--font-mono` and never import fonts themselves. For the
intended typography:

```bash
bunx shadcn@latest add @boxbox/boxbox-fonts
```

Animation uses [`motion`](https://motion.dev). Wrap your app once so movement follows the
visitor's system setting, while colour and opacity changes stay on and every state remains
readable:

```tsx
import { MotionConfig } from 'motion/react';

export function App({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
```

## Fictional data, and what this is not

This project is not affiliated with, endorsed by, or connected to any racing series, team, or
governing body. Every driver, team, colour, and lap time in the site, the demos, and the tests is
invented. The components ship no data of their own: you pass in your own.

The visual language is that of sports television in general. No official typeface, livery, logo,
or team identity is reproduced.

## Local development

```bash
bun install
bun run dev
```

Useful scripts:

| Script                            | What it does                                      |
| --------------------------------- | ------------------------------------------------- |
| `bun run typecheck`               | `tsc --noEmit`                                    |
| `bun run lint`                    | oxlint, including the react and jsx-a11y plugins  |
| `bun run format` / `format:check` | oxfmt                                             |
| `bun run test`                    | Vitest and Testing Library                        |
| `bun run registry:build`          | Regenerates `public/r/` from `registry.json`      |
| `bun run og:build`                | Regenerates the Open Graph images in `public/og/` |
| `bun run build`                   | Production build into `.output/`                  |

Components live in `registry/boxbox/`, the site in `src/`. See [CONTRIBUTING.md](CONTRIBUTING.md)
for the conventions that keep a component installable.

## License

MIT with the [Commons Clause](https://commonsclause.com): free to use, modify, and ship inside
your own products; you may not sell the components themselves as a product or service. See
[LICENSE](LICENSE).
