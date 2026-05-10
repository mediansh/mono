# Median Monorepo

Median is a TypeScript product suite for planning and executing software work with AI-assisted workflows.
This repository is a **pnpm + Turborepo** monorepo containing:

- `apps/web` — Next.js web app (primary product UI)
- `apps/cli` — CLI for setup, status, and tasks
- `apps/discord-bot` — Discord integration bot
- `packages/*` — shared linting and TypeScript config packages

## Why this repo exists

Median combines a collaborative web workspace with integrations (GitHub, Linear, Slack, Discord, X) and AI tooling so teams can move from idea to shipped task quickly.

A public HTTP API at `https://api.median.sh` lets external apps and embeds submit feedback directly into a workspace. See the [API docs](https://docs.median.sh/api/overview) for details.

## Tech stack

- **Runtime:** Node.js 20+
- **Package manager:** pnpm
- **Monorepo/build:** Turborepo
- **Frontend:** Next.js + React + TypeScript
- **Backend services:** Convex

## Quick start

### 1) Prerequisites

- Node.js `>=20`
- pnpm `9.x`

### 2) Install dependencies

```bash
pnpm install
```

### 3) Configure environment

Copy environment examples before running apps.

```bash
cp apps/web/.env.example apps/web/.env.local
```

Then fill required values (at minimum Clerk + Convex + AI keys used by your local flow).

### 4) Set up Clerk JWT template for Convex

Convex validates auth tokens using a Clerk JWT template. Without this step, all authenticated Convex mutations will fail with `Not authenticated`.

In the [Clerk Dashboard](https://dashboard.clerk.com), go to **JWT Templates → New template** and set:

- **Name:** `convex`
- **Audience (`aud`):** `convex`

Leave everything else as default and save.

### 5) Run the dev server

```bash
pnpm dev
```

This starts Next.js and Convex together via Turborepo. **Do not run `npx convex dev` from the repo root** — Convex is only installed in `apps/web`. If you need to run Convex commands manually (e.g. `convex env set`, `convex dev` standalone), always do so from `apps/web`:

```bash
cd apps/web && npx convex dev
```

### 6) Run checks

```bash
pnpm typecheck
pnpm build
```

## Common commands

```bash
pnpm dev        # run all app dev tasks through turbo
pnpm lint       # lint all workspaces
pnpm typecheck  # type-check all workspaces
pnpm build      # build all workspaces
pnpm format     # format code
```

## Repository layout

```text
.
├── apps/
│   ├── web/
│   ├── cli/
│   └── discord-bot/
├── packages/
│   ├── eslint-config/
│   └── typescript-config/
└── turbo.json
```

## Contributing

We welcome contributions.

- Start with [CONTRIBUTING.md](./CONTRIBUTING.md) for setup, workflow, and standards.
- Follow our [Code of Conduct](./CODE_OF_CONDUCT.md).
- Review our [Security Policy](./SECURITY.md) before reporting vulnerabilities.

## Security

If you discover a security issue, please **do not open a public issue**.
Use the private reporting process in [SECURITY.md](./SECURITY.md).

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE).
