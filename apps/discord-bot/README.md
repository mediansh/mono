# Discord bot Fly.io deploy

```bash
pnpm --filter discord-bot typecheck
pnpm --filter discord-bot build
apps/discord-bot/scripts/deploy-fly.sh median-discord-bot
```

The deploy script:

- creates the Fly app if it does not exist
- imports bot secrets from the repo root `.env.local`
- deploys with `apps/discord-bot/fly.toml`

If Fly auth is missing, login first:

```bash
env HOME="$(pwd)/.fly" XDG_CONFIG_HOME="$(pwd)/.fly" FLY_HOME="$(pwd)/.fly" /opt/homebrew/bin/flyctl auth login
```
