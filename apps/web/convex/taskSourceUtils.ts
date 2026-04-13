/**
 * Shared utilities for task source handling.
 * Used by both linear.ts and tasks.ts to ensure consistent deduplication logic.
 */

export type TaskSourcePlatform =
  | "discord"
  | "slack"
  | "x"
  | "linear"
  | "github"
  | "cli"

export type TaskSource = {
  platform: TaskSourcePlatform
  url: string
  author: string
}

/**
 * Generates a canonical key for deduplicating task sources.
 *
 * For Linear, uses the author (issue identifier like "MED-67") as the key
 * since identifiers are stable even when URLs change (e.g., issue moved
 * between projects).
 *
 * For GitHub, uses the URL as the key since issue/PR URLs are stable.
 *
 * For other platforms, uses platform + URL + author to handle cases where
 * the same author might have multiple distinct sources.
 */
export function getCanonicalTaskSourceKey(source: TaskSource): string {
  const normalizedUrl = source.url.trim()

  // For Linear, use author (issue identifier) as the key to prevent duplicates
  // when URLs change (e.g., issue moved between projects). The identifier is stable.
  if (source.platform === "linear") {
    return `linear:${source.author.trim()}`
  }

  // For GitHub, use URL as the key since URLs are stable for issues/PRs
  if (normalizedUrl && source.platform === "github") {
    return `github:${normalizedUrl}`
  }

  return `${source.platform}:${normalizedUrl}:${source.author.trim()}`
}
