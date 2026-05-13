/**
 * Helpers for validating user-supplied OAuth and billing redirect URLs.
 *
 * Untrusted redirect URLs are a common open-redirect sink: when a callback
 * forwards a victim to a stored URL, an attacker who can mint that URL can
 * use a trusted domain as a phishing bounce. We constrain redirect URLs to
 * a small allowlist of Median application origins (plus localhost for dev).
 */

const DEFAULT_APP_ORIGINS = [
  "https://median.sh",
  "https://www.median.sh",
]

function localDevOrigins(): string[] {
  const origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
  // Allow opting in/out via env if needed in the future.
  return origins
}

function getAllowedOrigins(): string[] {
  const fromEnv = (process.env.MEDIAN_ALLOWED_REDIRECT_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const origins = new Set<string>([...DEFAULT_APP_ORIGINS, ...fromEnv])
  if (process.env.NODE_ENV !== "production") {
    for (const o of localDevOrigins()) origins.add(o)
  }
  return Array.from(origins)
}

/**
 * Returns a normalized absolute URL string if `input` is an allowed redirect,
 * otherwise null.
 *
 * Rules:
 *   - Must parse as an absolute URL with http: or https: scheme
 *   - Origin (scheme + host + port) must match an entry in the allowlist
 *   - Protocol-relative URLs ("//attacker.example") are rejected
 *     (URL parsing without a base fails for these, which is what we want)
 */
export function safeAppRedirect(input: string | null | undefined): string | null {
  if (!input) return null
  const trimmed = input.trim()
  if (!trimmed) return null
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return null
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null
  }
  const allowed = getAllowedOrigins()
  if (!allowed.includes(parsed.origin)) {
    return null
  }
  return parsed.toString()
}

/**
 * Same as `safeAppRedirect` but throws on rejection. Use in mutation/action
 * argument validation paths where the caller expects a user-visible error.
 */
export function requireSafeAppRedirect(
  input: string | null | undefined,
  fieldName = "redirectUrl"
): string {
  const safe = safeAppRedirect(input)
  if (!safe) {
    throw new Error(`Invalid ${fieldName}: must be a Median application URL`)
  }
  return safe
}
