FROM node:22-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/discord-bot/package.json apps/discord-bot/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json

RUN pnpm install --filter discord-bot... --frozen-lockfile --prod=false

COPY packages/typescript-config ./packages/typescript-config
COPY apps/discord-bot ./apps/discord-bot

RUN pnpm --filter discord-bot build

WORKDIR /app/apps/discord-bot

ENV NODE_ENV="production"

CMD ["node", "dist/index.js"]
