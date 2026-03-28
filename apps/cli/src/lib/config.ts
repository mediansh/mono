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
