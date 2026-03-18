# median

This is a Turbo + pnpm monorepo with a Next.js app in [`apps/web`](/Users/abdul/Documents/median/apps/web).

## Development

```bash
pnpm dev
```

The root dev command now starts:

- `web#dev` for Next.js
- `web#dev:convex` for the Convex local/dev deployment flow

## Auth + Convex setup

1. Copy [`apps/web/.env.example`](/Users/abdul/Documents/median/apps/web/.env.example) to `apps/web/.env.local`.
2. Create a Clerk app and add your publishable/secret keys.
3. In Clerk, create a JWT template named `convex`.
4. Set `CLERK_JWT_ISSUER_DOMAIN` to your Clerk issuer domain.
5. Run `pnpm dev` and finish the Convex CLI prompts in the Convex task tab.

## Adding components

To add components to the web app, run:

```bash
pnpm dlx shadcn@latest add button -c apps/web
```

This places UI components in [`packages/ui/src/components`](/Users/abdul/Documents/median/packages/ui/src/components).

## Using components

Import components from the `ui` package:

```tsx
import { Button } from "@workspace/ui/components/button";
```
