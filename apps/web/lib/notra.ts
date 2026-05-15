const NOTRA_API_BASE = "https://api.usenotra.com/v1"

export type NotraPost = {
  id: string
  title: string
  slug: string | null
  content: string
  markdown: string
  recommendations: string | null
  contentType: string
  sourceMetadata: Record<string, unknown>
  status: "draft" | "published"
  createdAt: string
  updatedAt: string
}

type ListPostsResponse = {
  organization: { id: string; slug: string; name: string; logo: string | null }
  posts: NotraPost[]
  pagination: {
    limit: number
    currentPage: number
    nextPage: number | null
    previousPage: number | null
    totalPages: number
    totalItems: number
  }
}

type GetPostResponse = {
  organization: { id: string; slug: string; name: string; logo: string | null }
  post: NotraPost | null
}

function apiKey(): string | null {
  const key = process.env.NOTRA_API_KEY
  return key && key.length > 0 ? key : null
}

async function notraFetch<T>(
  path: string,
  init?: RequestInit & { next?: { revalidate?: number; tags?: string[] } },
): Promise<T | null> {
  const key = apiKey()
  if (!key) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[notra] NOTRA_API_KEY not set; returning empty result")
    }
    return null
  }

  const res = await fetch(`${NOTRA_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
    next: init?.next ?? { revalidate: 60 },
  })

  if (!res.ok) {
    if (res.status === 404) return null
    console.error(`[notra] ${path} failed: ${res.status} ${res.statusText}`)
    return null
  }

  return (await res.json()) as T
}

export async function listNotraPosts(options?: {
  limit?: number
  page?: number
}): Promise<NotraPost[]> {
  const params = new URLSearchParams({
    status: "published",
    sort: "desc",
    limit: String(options?.limit ?? 100),
    page: String(options?.page ?? 1),
  })
  const data = await notraFetch<ListPostsResponse>(`/posts?${params.toString()}`)
  return data?.posts ?? []
}

export function notraPostHref(post: NotraPost): string {
  return post.slug ?? post.id
}

export async function getNotraPostByHref(href: string): Promise<NotraPost | null> {
  const posts = await listNotraPosts({ limit: 100 })
  const match = posts.find((p) => (p.slug ?? p.id) === href)
  if (match) return match
  // Fall back to direct ID lookup if the href isn't found in the recent list.
  const data = await notraFetch<GetPostResponse>(`/posts/${encodeURIComponent(href)}`)
  if (!data?.post || data.post.status !== "published") return null
  return data.post
}
