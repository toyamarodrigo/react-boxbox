# react-boxbox

The boxbox site and shadcn registry. The current page is a Phase 0 placeholder.

```bash
bun install
bun run dev
```

Edit `src/routes/index.tsx` to get started. Add route files under
`src/routes`; TanStack Router updates `src/routeTree.gen.ts` for you.

Build the production app with:

```bash
bun run build
```

## Deploy with Nitro

This project uses Nitro. Its build prerenders the home page and an SPA shell.

```bash
bun run build
bun run start
```

The build output is in `.output/`.

For host-specific presets (Vercel, Netlify, Cloudflare, AWS Lambda, etc.) and tuning, see https://v3.nitro.build/deploy.
