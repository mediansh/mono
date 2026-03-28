import { createStore, configDir } from "@crustjs/store"

const store = createStore({
  dirPath: configDir("mdn"),
  fields: {
    apiKey: { type: "string", default: "" },
    convexUrl: { type: "string", default: "" },
    workspaceId: { type: "string", default: "" },
    workspaceName: { type: "string", default: "" },
    workspacePrefix: { type: "string", default: "" },
  },
})

// Key format: mdn_<base64url(convexUrl)>.<secret>
export function parseConvexUrlFromKey(apiKey: string): string | null {
  if (!apiKey.startsWith("mdn_")) return null
  const withoutPrefix = apiKey.slice(4) // remove "mdn_"
  const dotIndex = withoutPrefix.indexOf(".")
  if (dotIndex === -1) return null

  const encoded = withoutPrefix.slice(0, dotIndex)
  try {
    // Restore base64 padding and standard chars
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/")
    return atob(padded)
  } catch {
    return null
  }
}

export async function getConfig() {
  const config = await store.read()
  if (!config.apiKey || !config.convexUrl) {
    throw new Error(
      "Not configured. Run `mdn setup` first to connect to your workspace."
    )
  }
  return config
}

export async function saveConfig(config: {
  apiKey: string
  convexUrl: string
  workspaceId: string
  workspaceName: string
  workspacePrefix: string
}) {
  await store.write(config)
}

export async function clearConfig() {
  await store.reset()
}

export async function isConfigured(): Promise<boolean> {
  try {
    const config = await store.read()
    return Boolean(config.apiKey && config.convexUrl)
  } catch {
    return false
  }
}
