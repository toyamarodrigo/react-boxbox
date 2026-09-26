---
status: accepted
date: 2026-09-22
---

# Recharts for the Gap Chart item

Every registry item so far depends only on `motion`, `clsx`/`tailwind-merge` and the boxbox lib files, so a chart drawn in hand-written SVG would have kept the registry dependency-free. We chose Recharts (through shadcn's `chart` item) for `GapChart` anyway: it is the chart stack shadcn users already have, it gives axes, tooltips and responsive sizing for free, and a hand-rolled SVG chart would have had to grow those features over time. The cost is one heavy dependency on a single item; no other item may import it, so installing the rest of the registry stays light.

## Considered options

- Hand-written SVG chart, no dependency. Rejected: axes, tooltips and resize handling would be rewritten and maintained here.
- Chart.js. Rejected: not what shadcn ships, so users would carry two chart libraries.
