import { PostHog } from "posthog-node"

let client: PostHog | null = null

export function getPostHogClient(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? process.env.POSTHOG_API_KEY
  if (!key) return null

  if (!client) {
    client = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
    })
  }

  return client
}

export function captureBot(event: string, properties?: Record<string, unknown>) {
  const posthog = getPostHogClient()
  if (!posthog) return

  posthog.capture({
    distinctId: "discord-bot",
    event,
    properties: {
      platform: "discord",
      ...properties,
    },
  })
}

export async function flushPostHog() {
  if (client) {
    await client.shutdown()
  }
}
