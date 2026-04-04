#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
APP_NAME="${FLY_APP_NAME:-${1:-median-discord-bot}}"
REGION="${FLY_REGION:-syd}"
FLYCTL_BIN="${FLYCTL_BIN:-/opt/homebrew/bin/flyctl}"
FLY_HOME_DIR="${FLY_HOME:-$ROOT_DIR/.fly}"

mkdir -p "$FLY_HOME_DIR"

required_env=(
  DISCORD_BOT_TOKEN
  DISCORD_APPLICATION_ID
  DISCORD_PAIRING_SECRET
  NEXT_PUBLIC_CONVEX_URL
)

optional_env=(
  CONVEX_URL
  AXIOM_TOKEN
  AXIOM_DATASET
  NEXT_PUBLIC_POSTHOG_KEY
  NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
  POSTHOG_API_KEY
  NEXT_PUBLIC_POSTHOG_HOST
)

if [[ ! -f "$ROOT_DIR/.env.local" ]]; then
  echo "Missing $ROOT_DIR/.env.local"
  exit 1
fi

for key in "${required_env[@]}"; do
  if ! node --env-file="$ROOT_DIR/.env.local" -e "if (!process.env['$key']) process.exit(1)"; then
    echo "Missing required env in .env.local: $key"
    exit 1
  fi
done

if ! env HOME="$FLY_HOME_DIR" XDG_CONFIG_HOME="$FLY_HOME_DIR" FLY_HOME="$FLY_HOME_DIR" \
  "$FLYCTL_BIN" auth whoami >/dev/null 2>&1; then
  echo "Fly authentication missing. Run:"
  echo "  env HOME=$FLY_HOME_DIR XDG_CONFIG_HOME=$FLY_HOME_DIR FLY_HOME=$FLY_HOME_DIR $FLYCTL_BIN auth login"
  exit 1
fi

if ! env HOME="$FLY_HOME_DIR" XDG_CONFIG_HOME="$FLY_HOME_DIR" FLY_HOME="$FLY_HOME_DIR" \
  "$FLYCTL_BIN" status --app "$APP_NAME" >/dev/null 2>&1; then
  env HOME="$FLY_HOME_DIR" XDG_CONFIG_HOME="$FLY_HOME_DIR" FLY_HOME="$FLY_HOME_DIR" \
    "$FLYCTL_BIN" apps create "$APP_NAME"
fi

tmpfile="$(mktemp)"
trap 'rm -f "$tmpfile"' EXIT

for key in "${required_env[@]}" "${optional_env[@]}"; do
  value="$(node --env-file="$ROOT_DIR/.env.local" -p "process.env['$key'] ?? ''")"
  if [[ -n "$value" ]]; then
    printf '%s=%s\n' "$key" "$value" >>"$tmpfile"
  fi
done

env HOME="$FLY_HOME_DIR" XDG_CONFIG_HOME="$FLY_HOME_DIR" FLY_HOME="$FLY_HOME_DIR" \
  "$FLYCTL_BIN" secrets import --app "$APP_NAME" <"$tmpfile"

env HOME="$FLY_HOME_DIR" XDG_CONFIG_HOME="$FLY_HOME_DIR" FLY_HOME="$FLY_HOME_DIR" \
  "$FLYCTL_BIN" deploy \
  --app "$APP_NAME" \
  --config "$ROOT_DIR/apps/discord-bot/fly.toml" \
  --primary-region "$REGION" \
  --ha=false \
  "$ROOT_DIR"
