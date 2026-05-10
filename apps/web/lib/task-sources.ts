import type { RequestSource, TaskSource } from "@/lib/task-board"

export const SOURCE_CONFIG: Record<
  RequestSource,
  { label: string; color: string; bg: string }
> = {
  discord: { label: "Discord", color: "#5865F2", bg: "#5865F218" },
  github: { label: "GitHub", color: "#111827", bg: "#11182718" },
  linear: { label: "Linear", color: "#5E6AD2", bg: "#5E6AD218" },
  slack: { label: "Slack", color: "#E01E5A", bg: "#E01E5A18" },
  x: { label: "X", color: "#8b8b8b", bg: "#8b8b8b18" },
  cli: { label: "CLI", color: "#22c55e", bg: "#22c55e18" },
  api: { label: "API", color: "#0ea5e9", bg: "#0ea5e918" },
}

export function getTaskSources(task: {
  source?: TaskSource
  sources?: TaskSource[]
}): TaskSource[] {
  const sources = task.sources?.length
    ? task.sources
    : task.source
      ? [task.source]
      : []
  const seen = new Set<string>()

  return sources.filter((source) => {
    const key = `${source.platform}:${source.url}:${source.author}`
    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}
