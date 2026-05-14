import { configDir } from "@crustjs/store"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, parse, resolve } from "node:path"

export type WorkspaceConfig = {
  apiKey: string
  convexUrl: string
  workspaceId: string
  workspaceName: string
  workspacePrefix: string
}

type GlobalConfig = {
  defaultProfile: string
  profiles: Record<string, WorkspaceConfig>
}

type LocalConfig = {
  profile: string
}

const CONFIG_DIR = configDir("mdn")
const CONFIG_PATH = join(CONFIG_DIR, "config.json")
const LOCAL_CONFIG_PATH = join(".median", "config.json")

const EMPTY_GLOBAL_CONFIG: GlobalConfig = {
  defaultProfile: "",
  profiles: {},
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isWorkspaceConfig(value: unknown): value is WorkspaceConfig {
  if (!isRecord(value)) return false
  return (
    typeof value.apiKey === "string" &&
    typeof value.convexUrl === "string" &&
    typeof value.workspaceId === "string" &&
    typeof value.workspaceName === "string" &&
    typeof value.workspacePrefix === "string"
  )
}

function normalizeProfileName(profile: string): string {
  return profile.trim().toLowerCase()
}

export function profileNameFromWorkspacePrefix(prefix: string): string {
  const normalized = normalizeProfileName(prefix)
  return normalized || "default"
}

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8"))
}

async function readGlobalConfig(): Promise<GlobalConfig> {
  if (!existsSync(CONFIG_PATH)) return EMPTY_GLOBAL_CONFIG

  const raw = readJsonFile(CONFIG_PATH)
  if (!isRecord(raw)) return EMPTY_GLOBAL_CONFIG

  if (isWorkspaceConfig(raw)) {
    return {
      defaultProfile: "default",
      profiles: {
        default: raw,
      },
    }
  }

  const profiles: Record<string, WorkspaceConfig> = {}
  if (isRecord(raw.profiles)) {
    for (const [profile, config] of Object.entries(raw.profiles)) {
      if (isWorkspaceConfig(config)) {
        profiles[normalizeProfileName(profile)] = config
      }
    }
  }

  const defaultProfile =
    typeof raw.defaultProfile === "string"
      ? normalizeProfileName(raw.defaultProfile)
      : ""

  return {
    defaultProfile,
    profiles,
  }
}

async function writeGlobalConfig(config: GlobalConfig) {
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`)
}

function findLocalConfigPath(cwd = process.cwd()): string | null {
  let current = resolve(cwd)
  const root = parse(current).root

  while (true) {
    const candidate = join(current, LOCAL_CONFIG_PATH)
    if (existsSync(candidate)) return candidate
    if (current === root) return null
    current = dirname(current)
  }
}

function readLocalConfig(cwd = process.cwd()): LocalConfig | null {
  const path = findLocalConfigPath(cwd)
  if (!path) return null

  const raw = readJsonFile(path)
  if (!isRecord(raw) || typeof raw.profile !== "string") {
    throw new Error(
      `Invalid Median config at ${path}. Expected { "profile": "<name>" }.`
    )
  }

  const profile = normalizeProfileName(raw.profile)
  if (!profile) {
    throw new Error(`Invalid Median config at ${path}. Profile is required.`)
  }

  return { profile }
}

export async function getConfig() {
  const globalConfig = await readGlobalConfig()
  const localConfig = readLocalConfig()
  const profile = localConfig?.profile || globalConfig.defaultProfile

  if (!profile) {
    throw new Error(
      "Not configured. Run `mdn setup` to connect a default workspace or `mdn setup --local` to connect this project."
    )
  }

  const config = globalConfig.profiles[profile]
  if (!config) {
    throw new Error(
      `Median profile "${profile}" was not found. Run \`mdn setup --profile ${profile}\` or \`mdn setup --profile ${profile} --local\`.`
    )
  }

  return config
}

export async function saveConfig(
  profile: string,
  config: WorkspaceConfig,
  options: { makeDefault?: boolean } = {}
) {
  const profileName = normalizeProfileName(profile)
  if (!profileName) {
    throw new Error("Profile name is required.")
  }

  const globalConfig = await readGlobalConfig()
  const defaultProfile =
    options.makeDefault || !globalConfig.defaultProfile
      ? profileName
      : globalConfig.defaultProfile

  await writeGlobalConfig({
    defaultProfile,
    profiles: {
      ...globalConfig.profiles,
      [profileName]: config,
    },
  })
}

export async function saveLocalConfig(profile: string, cwd = process.cwd()) {
  const profileName = normalizeProfileName(profile)
  if (!profileName) {
    throw new Error("Profile name is required.")
  }

  const path = resolve(cwd, LOCAL_CONFIG_PATH)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify({ profile: profileName }, null, 2)}\n`)
}

export async function hasProfile(profile: string): Promise<boolean> {
  const profileName = normalizeProfileName(profile)
  if (!profileName) return false
  const config = await readGlobalConfig()
  return Boolean(config.profiles[profileName])
}

export async function clearConfig() {
  if (existsSync(CONFIG_PATH)) {
    rmSync(CONFIG_PATH)
  }
}

export async function isConfigured(): Promise<boolean> {
  try {
    const config = await readGlobalConfig()
    return Object.keys(config.profiles).length > 0
  } catch {
    return false
  }
}
