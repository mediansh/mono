type RateLimitBucket = {
  count: number
  resetAt: number
}

type RateLimitStore = Map<string, RateLimitBucket>

declare global {
  // eslint-disable-next-line no-var
  var __medianRateLimitStore__: RateLimitStore | undefined
}

function getRateLimitStore(): RateLimitStore {
  if (!globalThis.__medianRateLimitStore__) {
    globalThis.__medianRateLimitStore__ = new Map()
  }

  return globalThis.__medianRateLimitStore__
}

function pruneExpiredEntries(store: RateLimitStore, now: number) {
  for (const [key, bucket] of store.entries()) {
    if (bucket.resetAt <= now) {
      store.delete(key)
    }
  }
}

export function getRequestIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim()
    if (firstIp) {
      return firstIp
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim()
  if (realIp) {
    return realIp
  }

  return "unknown"
}

export function checkRateLimit(args: {
  key: string
  limit: number
  windowMs: number
  now?: number
}) {
  const now = args.now ?? Date.now()
  const store = getRateLimitStore()

  pruneExpiredEntries(store, now)

  const existing = store.get(args.key)
  if (!existing || existing.resetAt <= now) {
    const nextBucket = {
      count: 1,
      resetAt: now + args.windowMs,
    }
    store.set(args.key, nextBucket)
    return {
      allowed: true,
      remaining: args.limit - 1,
      resetAt: nextBucket.resetAt,
      retryAfterSeconds: Math.ceil(args.windowMs / 1000),
    }
  }

  if (existing.count >= args.limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    }
  }

  existing.count += 1
  store.set(args.key, existing)

  return {
    allowed: true,
    remaining: args.limit - existing.count,
    resetAt: existing.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  }
}
