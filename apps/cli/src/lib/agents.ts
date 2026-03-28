export const AGENT_ICONS: Record<string, string> = {
  "claude-code": "\u26A1",
  "codex": "\uD83D\uDD2E",
  "cursor": "\u25B8",
  "copilot": "\u25CF",
  "windsurf": "\uD83C\uDFC4",
  "gemini": "\u2666",
  "cline": "\u25C6",
}

export function getAgentIcon(agentName: string): string {
  const normalized = agentName.toLowerCase().trim()
  return AGENT_ICONS[normalized] ?? "\uD83E\uDD16"
}

export function isAgentTask(source: { platform: string; author: string } | null): boolean {
  return source?.platform === "cli" && source.author !== "cli"
}

export function getAgentName(source: { platform: string; author: string } | null): string | null {
  if (!source || source.platform !== "cli" || source.author === "cli") return null
  return source.author
}
