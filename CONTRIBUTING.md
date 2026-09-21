# Contributing

Thanks for looking. This document covers how to run the project and the conventions that keep a
component installable from the registry.

## Getting set up

```bash
bun install
bun run dev
```

Everything must pass before a change lands:

```bash
bun run typecheck
bun run lint
bun run format:check
bun run test
```

`bun run format` fixes formatting. CI runs all of the above plus `bun run build` on every push
and pull request.

## Where things live

| Path                   | What it holds                                                                  |
| ---------------------- | ------------------------------------------------------------------------------ |
| `registry/boxbox/ui/`  | One file per component, plus its colocated tests. This is what people install. |
| `registry/boxbox/lib/` | Shared types and motion tokens.                                                |
| `registry.json`        | The manifest. `bun run registry:build` turns it into `public/r/`.              |
| `src/content/<slug>/`  | Per component docs: `meta.ts`, `controls.ts`, `demo.tsx`.                      |
| `src/components/site/` | The documentation site itself. Never installed by anyone.                      |
| `src/data/`            | The invented grid and the race simulator that drives the demos.                |

## Rules for registry components

These exist because the shadcn CLI rewrites imports when it installs a file, and because the
components must work in a project that has none of this repo's setup.

- Import shared code as `@/registry/boxbox/lib/types`, `@/registry/boxbox/lib/motion`, or
  `@/registry/boxbox/ui/<other>`, and `cn` from `@/lib/utils`. The CLI only rewrites those
  shapes.
- Never import anything from `src/`. A component that reaches into the site cannot be installed.
- Every item needs its `registry.json` entry, with `dependencies` for npm packages and
  `registryDependencies` for other `@boxbox/*` items. Run `bun run registry:build` and commit
  `public/r/`.
- Keep the public API: data-driven props on the root, render slots, named exports for the inner
  parts, `className` passthrough, and a `data-slot` attribute on every part.
- No `forwardRef`. React 19 passes `ref` as a prop.
- Colour comes from semantic tokens only, never hard-coded values, so themes and light mode keep
  working.
- Components read `--font-display` and `--font-mono`. They never import a font.

## Motion

- Animate with `motion` (`motion/react`) only, so `MotionConfig reducedMotion="user"` covers
  everything a visitor asked to have calmed down.
- Use the shared tokens in `registry/boxbox/lib/motion.ts`. No component defines its own easing
  or duration.
- Anything that animates on every data tick uses the full `transform: 'translateY(...)'` string
  rather than the `x` / `y` shorthands, so it stays on the compositor. The exception is an
  element that also has `layout`, where Motion needs to compose the value itself.
- Motion carries meaning here: a state change that is only shown by movement must still be
  readable by colour when motion is reduced.

## Tests

Colocate tests with the file under test. Cover pure logic (formatting, sorting, state machines,
the simulator) and add a render smoke test per component. Assert structure, data attributes, and
accessible names, never animation timing. Anything timer driven is tested with fake timers.

## Data

Every driver, team, colour, and lap time is invented, and it stays that way. Do not add real
names, liveries, logos, or timing data to the repo, and do not name any racing series in the
brand or the UI.

## Commits and pull requests

Write commit subjects as what changed, in the imperative. Keep a pull request to one concern,
and say in the description what you verified. If the change touches a component's rendered
output, say how you checked it in a browser.

## License

By contributing you agree that your work is licensed under the repository's MIT with Commons
Clause license. See [LICENSE](LICENSE).
