# Contributing to Median

Thanks for your interest in contributing.

## Ground rules

- Be respectful and collaborative.
- Keep pull requests focused and small when possible.
- Add or update docs when behavior changes.
- Run all required checks locally before opening a PR.

## Local setup

1. Install prerequisites:
   - Node.js `>=20`
   - pnpm `9.x`
2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Configure env files (for example, `apps/web/.env.local` from `apps/web/.env.example`).

## Development workflow

1. Create a branch from `main`.
2. Make your changes.
3. Validate locally:

   ```bash
   pnpm lint
   pnpm typecheck
   pnpm build
   ```

4. Commit using clear, descriptive messages.
5. Open a PR with:
   - What changed
   - Why it changed
   - Any migration or environment impacts

## Monorepo tips

- Use targeted workspace commands while iterating, e.g.:

  ```bash
  pnpm --filter web lint
  pnpm --filter @workspace/cli typecheck
  ```

- Keep shared logic in packages when it can be reused.

## Pull request checklist

- [ ] Code compiles and typechecks
- [ ] Lint passes
- [ ] Build passes
- [ ] Documentation updated (if needed)
- [ ] No secrets or credentials committed

## Reporting issues

- Use GitHub Issues for bugs/features.
- For sensitive security issues, follow [SECURITY.md](./SECURITY.md).
