import { v } from "convex/values"
import {
  action,
  httpAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import {
  requireWorkspaceAccess,
  requireWorkspaceAdminAccess,
} from "./permissions"

const X_OAUTH_REQUEST_TOKEN_URL = "https://api.x.com/oauth/request_token"
const X_OAUTH_ACCESS_TOKEN_URL = "https://api.x.com/oauth/access_token"
const X_OAUTH_AUTHORIZE_URL = "https://api.x.com/oauth/authorize"
const X_USERS_ME_URL =
  "https://api.x.com/2/users/me?user.fields=profile_image_url"
const X_WEBHOOKS_URL = "https://api.x.com/2/webhooks"
const X_OAUTH_STATE_TTL_MS = 1000 * 60 * 15
const X_WEBHOOK_CALLBACK_PATH = "/x/webhook"
const X_OAUTH_CALLBACK_PATH = "/x/oauth/callback"

type OAuthTokenResponse = {
  oauth_token?: string
  oauth_token_secret?: string
  oauth_callback_confirmed?: string
  user_id?: string
  screen_name?: string
}

type XMeResponse = {
  data?: {
    id?: string
    name?: string
    username?: string
    profile_image_url?: string
  }
}

type XWebhookRecord = {
  id?: string
  webhook_id?: string
  url?: string
  valid?: boolean
}

type XWebhookListResponse = {
  data?: {
    webhooks?: XWebhookRecord[]
  }
}

type XSubscriptionCreateResponse = {
  data?: {
    subscribed?: boolean
  }
  errors?: Array<{
    message?: string
    title?: string
  }>
}

type XWebhookMention = {
  id?: string | number
  id_str?: string
  screen_name?: string
}

type XWebhookUser = {
  id?: string | number
  id_str?: string
  screen_name?: string
  name?: string
}

type XWebhookTweet = {
  id?: string | number
  id_str?: string
  text?: string
  full_text?: string
  created_at?: string
  user?: XWebhookUser
  entities?: {
    user_mentions?: XWebhookMention[]
  }
  extended_tweet?: {
    full_text?: string
    entities?: {
      user_mentions?: XWebhookMention[]
    }
  }
  in_reply_to_user_id?: string | number | null
  in_reply_to_user_id_str?: string | null
  retweeted_status?: unknown
}

type XWebhookPayload = {
  for_user_id?: string
  tweet_create_events?: XWebhookTweet[]
  replay_job_status?: {
    job_state?: string
    job_state_description?: string
    job_id?: string
    webhook_id?: string
  }
}

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing ${name}`)
  }
  return value
}

function getXApiKey() {
  return getRequiredEnv("X_API_KEY")
}

function getXApiSecret() {
  return getRequiredEnv("X_API_SECRET")
}

function getXBearerToken() {
  return getRequiredEnv("X_API_BEARER_TOKEN")
}

function getConvexSiteUrl() {
  const baseUrl =
    process.env.CONVEX_SITE_URL ?? process.env.NEXT_PUBLIC_CONVEX_SITE_URL
  if (!baseUrl) {
    throw new Error("Missing CONVEX_SITE_URL for X integration")
  }
  return baseUrl.replace(/\/$/, "")
}

function getWebhookUrl() {
  return `${getConvexSiteUrl()}${X_WEBHOOK_CALLBACK_PATH}`
}

function getOAuthCallbackUrl() {
  return `${getConvexSiteUrl()}${X_OAUTH_CALLBACK_PATH}`
}

function normalizeId(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null
  const normalized = String(value).trim()
  return normalized.length > 0 ? normalized : null
}

function percentEncode(value: string) {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (char) =>
      `%${char.charCodeAt(0).toString(16).toUpperCase()}`
    )
}

function bytesToBinaryString(bytes: Uint8Array) {
  let result = ""
  const chunkSize = 0x8000

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    result += String.fromCharCode(...chunk)
  }

  return result
}

function binaryStringToBytes(value: string) {
  const bytes = new Uint8Array(value.length)
  for (let index = 0; index < value.length; index += 1) {
    bytes[index] = value.charCodeAt(index)
  }
  return bytes
}

function base64UrlEncode(bytes: Uint8Array) {
  return btoa(bytesToBinaryString(bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function base64Encode(bytes: Uint8Array) {
  return btoa(bytesToBinaryString(bytes))
}

function decodeBase64(value: string) {
  return binaryStringToBytes(atob(value))
}

function timingSafeEqualString(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left)
  const rightBytes = new TextEncoder().encode(right)
  if (leftBytes.length !== rightBytes.length) {
    return false
  }
  let mismatch = 0
  for (let index = 0; index < leftBytes.length; index += 1) {
    mismatch |= leftBytes[index]! ^ rightBytes[index]!
  }
  return mismatch === 0
}

async function importAesKey() {
  const secret = getRequiredEnv("X_TOKEN_ENCRYPTION_KEY")
  const material = new TextEncoder().encode(secret)
  const digest = await crypto.subtle.digest("SHA-256", material)
  return await crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  )
}

async function encryptSecret(value: string) {
  const key = await importAesKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(value)
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
      },
      key,
      encoded
    )
  )
  return `${base64UrlEncode(iv)}.${base64UrlEncode(encrypted)}`
}

async function decryptSecret(value: string) {
  const [ivEncoded, payloadEncoded] = value.split(".")
  if (!ivEncoded || !payloadEncoded) {
    throw new Error("Invalid encrypted X token payload")
  }
  const key = await importAesKey()
  const iv = decodeBase64(
    ivEncoded.replace(/-/g, "+").replace(/_/g, "/")
  )
  const payload = decodeBase64(
    payloadEncoded.replace(/-/g, "+").replace(/_/g, "/")
  )
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    payload
  )
  return new TextDecoder().decode(decrypted)
}

async function signHmac(
  algorithm: "SHA-1" | "SHA-256",
  secret: string,
  value: string
) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: { name: algorithm },
    },
    false,
    ["sign"]
  )
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))
  )
  return base64Encode(signature)
}

async function buildOAuthAuthorizationHeader(args: {
  method: string
  url: string
  apiKey: string
  apiSecret: string
  accessToken?: string
  accessTokenSecret?: string
  callback?: string
  verifier?: string
  extraParams?: Record<string, string>
}) {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: args.apiKey,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ""),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_version: "1.0",
  }

  if (args.accessToken) {
    oauthParams.oauth_token = args.accessToken
  }
  if (args.callback) {
    oauthParams.oauth_callback = args.callback
  }
  if (args.verifier) {
    oauthParams.oauth_verifier = args.verifier
  }

  const url = new URL(args.url)
  const baseUrl = `${url.origin}${url.pathname}`
  const signingParams = new URLSearchParams(url.search)
  for (const [key, value] of Object.entries(oauthParams)) {
    signingParams.append(key, value)
  }
  for (const [key, value] of Object.entries(args.extraParams ?? {})) {
    signingParams.append(key, value)
  }

  const normalizedParams = Array.from(signingParams.entries())
    .map(([key, value]) => [percentEncode(key), percentEncode(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      if (leftKey === rightKey) {
        return leftValue.localeCompare(rightValue)
      }
      return leftKey.localeCompare(rightKey)
    })
    .map(([key, value]) => `${key}=${value}`)
    .join("&")

  const signingKey = `${percentEncode(args.apiSecret)}&${percentEncode(
    args.accessTokenSecret ?? ""
  )}`
  const signatureBaseString = [
    args.method.toUpperCase(),
    percentEncode(baseUrl),
    percentEncode(normalizedParams),
  ].join("&")

  oauthParams.oauth_signature = await signHmac(
    "SHA-1",
    signingKey,
    signatureBaseString
  )

  const header = Object.entries(oauthParams)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${percentEncode(key)}="${percentEncode(value)}"`)
    .join(", ")

  return `OAuth ${header}`
}

function parseOAuthFormBody(value: string): OAuthTokenResponse {
  const params = new URLSearchParams(value)
  return Object.fromEntries(params.entries())
}

async function fetchTextOrThrow(response: Response) {
  const text = await response.text()
  if (!response.ok) {
    if (
      response.status === 417 &&
      text.includes("oauth_callback value 'oob'")
    ) {
      throw new Error(
        `Your X app is configured as a desktop/native app. Change it to a web-capable app in the X developer portal and allowlist this callback URL exactly: ${getOAuthCallbackUrl()}`
      )
    }

    const xXmlError = text.match(/<error code="(\d+)">([^<]+)<\/error>/)
    if (xXmlError?.[2]) {
      throw new Error(xXmlError[2])
    }

    throw new Error(text || `X request failed with ${response.status}`)
  }
  return text
}

async function requestOAuthToken(args: {
  callbackUrl: string
}) {
  const authorization = await buildOAuthAuthorizationHeader({
    method: "POST",
    url: X_OAUTH_REQUEST_TOKEN_URL,
    apiKey: getXApiKey(),
    apiSecret: getXApiSecret(),
    callback: args.callbackUrl,
  })

  const response = await fetch(X_OAUTH_REQUEST_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: authorization,
    },
  })

  const parsed = parseOAuthFormBody(await fetchTextOrThrow(response))
  if (
    !parsed.oauth_token ||
    !parsed.oauth_token_secret ||
    parsed.oauth_callback_confirmed !== "true"
  ) {
    throw new Error("X did not return a valid request token")
  }

  return {
    requestToken: parsed.oauth_token,
    requestTokenSecret: parsed.oauth_token_secret,
  }
}

async function exchangeAccessToken(args: {
  requestToken: string
  requestTokenSecret: string
  verifier: string
}) {
  const authorization = await buildOAuthAuthorizationHeader({
    method: "POST",
    url: X_OAUTH_ACCESS_TOKEN_URL,
    apiKey: getXApiKey(),
    apiSecret: getXApiSecret(),
    accessToken: args.requestToken,
    accessTokenSecret: args.requestTokenSecret,
    verifier: args.verifier,
  })

  const response = await fetch(X_OAUTH_ACCESS_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: authorization,
    },
  })

  const parsed = parseOAuthFormBody(await fetchTextOrThrow(response))
  if (!parsed.oauth_token || !parsed.oauth_token_secret) {
    throw new Error("X did not return a valid access token")
  }

  return {
    accessToken: parsed.oauth_token,
    accessTokenSecret: parsed.oauth_token_secret,
    userId: normalizeId(parsed.user_id),
    username: parsed.screen_name?.trim() ?? null,
  }
}

async function signedUserRequest(
  method: "GET" | "POST",
  url: string,
  accessToken: string,
  accessTokenSecret: string
) {
  const authorization = await buildOAuthAuthorizationHeader({
    method,
    url,
    apiKey: getXApiKey(),
    apiSecret: getXApiSecret(),
    accessToken,
    accessTokenSecret,
  })

  return await fetch(url, {
    method,
    headers: {
      Authorization: authorization,
    },
  })
}

async function fetchAuthenticatedUser(
  accessToken: string,
  accessTokenSecret: string
) {
  const response = await signedUserRequest(
    "GET",
    X_USERS_ME_URL,
    accessToken,
    accessTokenSecret
  )

  const data = (await response.json()) as XMeResponse
  if (!response.ok || !data.data?.id || !data.data.username) {
    throw new Error("Failed to load the connected X account")
  }

  return {
    id: data.data.id,
    username: data.data.username,
    name: data.data.name ?? data.data.username,
    profileImageUrl: data.data.profile_image_url ?? null,
  }
}

async function fetchWebhooks() {
  const response = await fetch(X_WEBHOOKS_URL, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${getXBearerToken()}`,
    },
  })
  const data = (await response.json()) as XWebhookListResponse
  if (!response.ok) {
    throw new Error("Failed to load X webhooks")
  }
  return data.data?.webhooks ?? []
}

async function createWebhook(url: string) {
  const response = await fetch(X_WEBHOOKS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getXBearerToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url }),
  })
  const data = (await response.json()) as {
    data?: {
      id?: string
      webhook_id?: string
    }
  }
  if (!response.ok) {
    throw new Error("Failed to create X webhook")
  }
  return data.data?.id ?? data.data?.webhook_id ?? null
}

async function validateWebhook(webhookId: string) {
  const response = await fetch(
    `${X_WEBHOOKS_URL}/${encodeURIComponent(webhookId)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${getXBearerToken()}`,
      },
    }
  )
  if (!response.ok) {
    throw new Error("Failed to validate X webhook")
  }
}

async function ensureWebhook() {
  const callbackUrl = getWebhookUrl()
  const existing = (await fetchWebhooks()).find(
    (webhook) => webhook.url === callbackUrl
  )

  const webhookId = existing?.id ?? existing?.webhook_id ?? null
  if (webhookId) {
    if (existing?.valid === false) {
      await validateWebhook(webhookId)
    }
    return webhookId
  }

  const createdWebhookId = await createWebhook(callbackUrl)
  if (!createdWebhookId) {
    throw new Error("X did not return a webhook ID")
  }
  return createdWebhookId
}

async function createSubscription(
  webhookId: string,
  accessToken: string,
  accessTokenSecret: string
) {
  const endpoint = `https://api.x.com/2/account_activity/webhooks/${encodeURIComponent(
    webhookId
  )}/subscriptions/all`
  const authorization = await buildOAuthAuthorizationHeader({
    method: "POST",
    url: endpoint,
    apiKey: getXApiKey(),
    apiSecret: getXApiSecret(),
    accessToken,
    accessTokenSecret,
  })

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: authorization,
    },
  })

  const payload = (await response.json()) as XSubscriptionCreateResponse
  if (response.ok && payload.data?.subscribed) {
    return
  }

  const duplicate = payload.errors?.some(
    (error) => error.title === "DuplicateSubscriptionFailed"
  )
  if (duplicate) {
    return
  }

  const message =
    payload.errors?.map((error) => error.message ?? error.title).join(", ") ??
    "Failed to subscribe the X account"
  throw new Error(message)
}

async function deleteSubscription(webhookId: string, userId: string) {
  const response = await fetch(
    `https://api.x.com/2/account_activity/webhooks/${encodeURIComponent(
      webhookId
    )}/subscriptions/${encodeURIComponent(userId)}/all`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${getXBearerToken()}`,
      },
    }
  )

  if (response.status === 404) {
    return
  }
  if (!response.ok) {
    throw new Error("Failed to delete the X subscription")
  }
}

function formatPostPermalink(authorUsername: string, postId: string) {
  return `https://x.com/${authorUsername}/status/${postId}`
}

function formatStatusRedirect(
  baseRedirectUrl: string,
  status: "connected" | "error",
  message?: string
) {
  const redirectUrl = new URL(baseRedirectUrl)
  redirectUrl.searchParams.set("x_status", status)
  if (message) {
    redirectUrl.searchParams.set("x_message", message)
  }
  return redirectUrl.toString()
}

function getTweetText(tweet: XWebhookTweet) {
  return (
    tweet.extended_tweet?.full_text?.trim() ??
    tweet.full_text?.trim() ??
    tweet.text?.trim() ??
    ""
  )
}

function getTweetMentions(tweet: XWebhookTweet) {
  return (
    tweet.extended_tweet?.entities?.user_mentions ??
    tweet.entities?.user_mentions ??
    []
  )
}

function getTweetCreatedAt(tweet: XWebhookTweet) {
  const createdAt = tweet.created_at ? Date.parse(tweet.created_at) : NaN
  return Number.isFinite(createdAt) ? createdAt : Date.now()
}

function extractRelevantInboundPosts(
  payload: XWebhookPayload,
  integration: {
    _id: Id<"xWorkspaceIntegrations">
    workspaceId: Id<"workspaces">
    xUserId: string
    username: string
  }
) {
  const forUserId = normalizeId(payload.for_user_id)
  if (!forUserId || forUserId !== integration.xUserId) {
    return []
  }

  return (payload.tweet_create_events ?? [])
    .filter((tweet) => !tweet.retweeted_status)
    .map((tweet) => {
      const postId = normalizeId(tweet.id_str ?? tweet.id)
      const authorId = normalizeId(tweet.user?.id_str ?? tweet.user?.id)
      const authorUsername = tweet.user?.screen_name?.trim() ?? ""
      const content = getTweetText(tweet)
      const inReplyToUserId = normalizeId(
        tweet.in_reply_to_user_id_str ?? tweet.in_reply_to_user_id
      )
      const mentions = getTweetMentions(tweet)
      const mentionsConnectedUser = mentions.some((mention) => {
        const mentionedId = normalizeId(mention.id_str ?? mention.id)
        if (mentionedId && mentionedId === integration.xUserId) {
          return true
        }
        return (
          mention.screen_name?.trim().toLowerCase() ===
          integration.username.toLowerCase()
        )
      })
      const repliesToConnectedUser = inReplyToUserId === integration.xUserId

      if (!postId || !authorId || !authorUsername || !content) {
        return null
      }
      if (authorId === integration.xUserId) {
        return null
      }
      if (!mentionsConnectedUser && !repliesToConnectedUser) {
        return null
      }

      return {
        postId,
        permalink: formatPostPermalink(authorUsername, postId),
        authorId,
        authorUsername,
        authorName: tweet.user?.name?.trim() || undefined,
        content,
        inReplyToUserId: inReplyToUserId ?? undefined,
        postCreatedAt: getTweetCreatedAt(tweet),
        forUserId,
      }
    })
    .filter(Boolean) as Array<{
    postId: string
    permalink: string
    authorId: string
    authorUsername: string
    authorName?: string
    content: string
    inReplyToUserId?: string
    postCreatedAt: number
    forUserId: string
  }>
}

export const getWorkspaceXIntegration = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const { membership } = await requireWorkspaceAccess(ctx, args.workspaceId)
    const integration = await ctx.db
      .query("xWorkspaceIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .unique()

    return {
      canManage: membership.role === "admin" || membership.role === "owner",
      integration: integration
        ? {
            _id: integration._id,
            xUserId: integration.xUserId,
            username: integration.username,
            name: integration.name ?? null,
            profileImageUrl: integration.profileImageUrl ?? null,
            webhookId: integration.webhookId,
            connectedAt: integration.connectedAt,
            lastProcessedAt: integration.lastProcessedAt ?? null,
            lastIngestedAt: integration.lastIngestedAt ?? null,
            feedbackProcessingState:
              integration.feedbackProcessingState ?? "idle",
            feedbackProcessingLastError:
              integration.feedbackProcessingLastError ?? null,
            additionalContext: integration.additionalContext ?? "",
          }
        : null,
    }
  },
})

export const assertWorkspaceAdminAccess = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAdminAccess(ctx, args.workspaceId)
  },
})

export const getWorkspaceIntegrationInternal = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("xWorkspaceIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .unique()
  },
})

export const getIntegrationByUserIdInternal = internalQuery({
  args: {
    xUserId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("xWorkspaceIntegrations")
      .withIndex("by_x_user", (q) => q.eq("xUserId", args.xUserId))
      .unique()
  },
})

export const getOAuthStateByRequestTokenInternal = internalQuery({
  args: {
    requestToken: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("xOAuthStates")
      .withIndex("by_request_token", (q) => q.eq("requestToken", args.requestToken))
      .unique()
  },
})

export const saveOAuthStateInternal = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    initiatedByUserId: v.string(),
    requestToken: v.string(),
    requestTokenSecretEncrypted: v.string(),
    redirectUrl: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existingStates = await ctx.db
      .query("xOAuthStates")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect()

    await Promise.all(
      existingStates.map((state) => ctx.db.delete(state._id))
    )

    return await ctx.db.insert("xOAuthStates", args)
  },
})

export const markOAuthStateCompletedInternal = internalMutation({
  args: {
    stateId: v.id("xOAuthStates"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.stateId, {
      completedAt: Date.now(),
    })
  },
})

export const clearWorkspaceXIntegrationInternal = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const integration = await ctx.db
      .query("xWorkspaceIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .unique()

    if (integration) {
      const posts = await ctx.db
        .query("xPosts")
        .withIndex("by_integration_created_at", (q) =>
          q.eq("integrationId", integration._id)
        )
        .collect()

      await Promise.all(posts.map((post) => ctx.db.delete(post._id)))
      await ctx.db.delete(integration._id)
    }

    const states = await ctx.db
      .query("xOAuthStates")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect()

    await Promise.all(states.map((state) => ctx.db.delete(state._id)))
  },
})

export const saveWorkspaceIntegrationInternal = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    xUserId: v.string(),
    username: v.string(),
    name: v.optional(v.string()),
    profileImageUrl: v.optional(v.string()),
    accessTokenEncrypted: v.string(),
    accessTokenSecretEncrypted: v.string(),
    webhookId: v.string(),
    connectedByUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("xWorkspaceIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .unique()

    if (existing) {
      const posts = await ctx.db
        .query("xPosts")
        .withIndex("by_integration_created_at", (q) =>
          q.eq("integrationId", existing._id)
        )
        .collect()

      await Promise.all(posts.map((post) => ctx.db.delete(post._id)))
      await ctx.db.delete(existing._id)
    }

    return await ctx.db.insert("xWorkspaceIntegrations", {
      workspaceId: args.workspaceId,
      xUserId: args.xUserId,
      username: args.username,
      name: args.name,
      profileImageUrl: args.profileImageUrl,
      accessTokenEncrypted: args.accessTokenEncrypted,
      accessTokenSecretEncrypted: args.accessTokenSecretEncrypted,
      webhookId: args.webhookId,
      connectedAt: Date.now(),
      connectedByUserId: args.connectedByUserId,
      feedbackProcessingState: "idle",
    })
  },
})

export const updateXIntegrationSettings = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    additionalContext: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAdminAccess(ctx, args.workspaceId)

    const integration = await ctx.db
      .query("xWorkspaceIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .unique()

    if (!integration) {
      throw new Error("No X integration found for this workspace")
    }

    await ctx.db.patch(integration._id, {
      additionalContext: args.additionalContext?.trim() || undefined,
    })
  },
})

export const beginWorkspaceXConnect = action({
  args: {
    workspaceId: v.id("workspaces"),
    redirectUrl: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.x.assertWorkspaceAdminAccess, {
      workspaceId: args.workspaceId,
    })

    const redirectUrl = new URL(args.redirectUrl)
    if (!["http:", "https:"].includes(redirectUrl.protocol)) {
      throw new Error("Invalid redirect URL")
    }

    const state = await requestOAuthToken({
      callbackUrl: getOAuthCallbackUrl(),
    })

    const identity = await ctx.runQuery(internal.x.getWorkspaceMembershipUserId, {
      workspaceId: args.workspaceId,
    })

    await ctx.runMutation(internal.x.saveOAuthStateInternal, {
      workspaceId: args.workspaceId,
      initiatedByUserId: identity.userId,
      requestToken: state.requestToken,
      requestTokenSecretEncrypted: await encryptSecret(state.requestTokenSecret),
      redirectUrl: redirectUrl.toString(),
      expiresAt: Date.now() + X_OAUTH_STATE_TTL_MS,
    })

    return {
      authorizeUrl: `${X_OAUTH_AUTHORIZE_URL}?oauth_token=${encodeURIComponent(
        state.requestToken
      )}`,
    }
  },
})

export const getWorkspaceMembershipUserId = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceAdminAccess(ctx, args.workspaceId)
    return {
      userId: identity.subject,
    }
  },
})

export const disconnectWorkspaceXIntegration = action({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.x.assertWorkspaceAdminAccess, {
      workspaceId: args.workspaceId,
    })

    const integration = await ctx.runQuery(
      internal.x.getWorkspaceIntegrationInternal,
      {
        workspaceId: args.workspaceId,
      }
    )

    if (integration) {
      try {
        await deleteSubscription(integration.webhookId, integration.xUserId)
      } catch {
        // Best effort cleanup, matching the Linear disconnect behavior.
      }
    }

    await ctx.runMutation(internal.x.clearWorkspaceXIntegrationInternal, {
      workspaceId: args.workspaceId,
    })

    return { success: true }
  },
})

export const recordInboundPostInternal = internalMutation({
  args: {
    integrationId: v.id("xWorkspaceIntegrations"),
    forUserId: v.string(),
    postId: v.string(),
    permalink: v.string(),
    authorId: v.string(),
    authorUsername: v.string(),
    authorName: v.optional(v.string()),
    content: v.string(),
    inReplyToUserId: v.optional(v.string()),
    postCreatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const integration = await ctx.db.get(args.integrationId)
    if (!integration) {
      return {
        accepted: false,
        duplicate: false,
      } as const
    }

    const existingPost = await ctx.db
      .query("xPosts")
      .withIndex("by_integration_post", (q) =>
        q.eq("integrationId", args.integrationId).eq("postId", args.postId)
      )
      .unique()

    if (existingPost) {
      return {
        accepted: false,
        duplicate: true,
      } as const
    }

    await ctx.db.insert("xPosts", {
      workspaceId: integration.workspaceId,
      integrationId: integration._id,
      forUserId: args.forUserId,
      postId: args.postId,
      permalink: args.permalink,
      authorId: args.authorId,
      authorUsername: args.authorUsername,
      authorName: args.authorName,
      content: args.content,
      inReplyToUserId: args.inReplyToUserId,
      postCreatedAt: args.postCreatedAt,
      receivedAt: Date.now(),
    })

    await ctx.db.patch(args.integrationId, {
      lastIngestedPostId: args.postId,
      lastIngestedPostCreatedAt: args.postCreatedAt,
      lastIngestedAt: Date.now(),
    })

    await ctx.scheduler.runAfter(0, internal.xFeedback.scheduleFeedbackDetection, {
      integrationId: args.integrationId,
    })

    return {
      accepted: true,
      duplicate: false,
    } as const
  },
})

export const xOAuthCallback = httpAction(async (ctx, request) => {
  const url = new URL(request.url)
  const requestToken = url.searchParams.get("oauth_token")
  const verifier = url.searchParams.get("oauth_verifier")
  const denied = url.searchParams.get("denied")

  const stateToken = denied ?? requestToken
  if (!stateToken) {
    return new Response("Missing OAuth token", { status: 400 })
  }

  const state = await ctx.runQuery(internal.x.getOAuthStateByRequestTokenInternal, {
    requestToken: stateToken,
  })

  if (!state) {
    return new Response("Unknown OAuth state", { status: 404 })
  }

  if (denied) {
    return Response.redirect(
      formatStatusRedirect(state.redirectUrl, "error", "X authorization was cancelled."),
      302
    )
  }

  if (!requestToken || !verifier) {
    return Response.redirect(
      formatStatusRedirect(state.redirectUrl, "error", "X did not return a verifier."),
      302
    )
  }

  if (state.completedAt || state.expiresAt <= Date.now()) {
    return Response.redirect(
      formatStatusRedirect(state.redirectUrl, "error", "That X connection link has expired."),
      302
    )
  }

  try {
    const requestTokenSecret = await decryptSecret(
      state.requestTokenSecretEncrypted
    )
    const access = await exchangeAccessToken({
      requestToken,
      requestTokenSecret,
      verifier,
    })
    const me = await fetchAuthenticatedUser(
      access.accessToken,
      access.accessTokenSecret
    )
    const webhookId = await ensureWebhook()
    await createSubscription(
      webhookId,
      access.accessToken,
      access.accessTokenSecret
    )

    await ctx.runMutation(internal.x.saveWorkspaceIntegrationInternal, {
      workspaceId: state.workspaceId,
      xUserId: me.id,
      username: me.username,
      name: me.name,
      profileImageUrl: me.profileImageUrl ?? undefined,
      accessTokenEncrypted: await encryptSecret(access.accessToken),
      accessTokenSecretEncrypted: await encryptSecret(access.accessTokenSecret),
      webhookId,
      connectedByUserId: state.initiatedByUserId,
    })

    await ctx.runMutation(internal.x.markOAuthStateCompletedInternal, {
      stateId: state._id,
    })

    return Response.redirect(
      formatStatusRedirect(
        state.redirectUrl,
        "connected",
        `Connected @${me.username}.`
      ),
      302
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to connect the X account"
    return Response.redirect(
      formatStatusRedirect(state.redirectUrl, "error", message),
      302
    )
  }
})

export const xWebhook = httpAction(async (ctx, request) => {
  const url = new URL(request.url)

  if (request.method === "GET") {
    const crcToken = url.searchParams.get("crc_token")
    if (!crcToken) {
      return new Response("Missing crc_token", { status: 400 })
    }

    const responseToken = `sha256=${await signHmac(
      "SHA-256",
      getXApiSecret(),
      crcToken
    )}`

    return Response.json({ response_token: responseToken })
  }

  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 })
  }

  const signature = request.headers.get("x-twitter-webhooks-signature")
  if (!signature) {
    return new Response("Missing signature", { status: 401 })
  }

  const bodyText = await request.text()
  const expectedSignature = `sha256=${await signHmac(
    "SHA-256",
    getXApiSecret(),
    bodyText
  )}`
  if (!timingSafeEqualString(signature, expectedSignature)) {
    return new Response("Invalid signature", { status: 401 })
  }

  const payload = JSON.parse(bodyText) as XWebhookPayload
  const forUserId = normalizeId(payload.for_user_id)
  if (!forUserId) {
    return new Response("Ignored", { status: 200 })
  }

  const integration = await ctx.runQuery(internal.x.getIntegrationByUserIdInternal, {
    xUserId: forUserId,
  })
  if (!integration) {
    return new Response("Ignored", { status: 200 })
  }

  const inboundPosts = extractRelevantInboundPosts(payload, integration)
  for (const post of inboundPosts) {
    await ctx.runMutation(internal.x.recordInboundPostInternal, {
      integrationId: integration._id,
      forUserId: post.forUserId,
      postId: post.postId,
      permalink: post.permalink,
      authorId: post.authorId,
      authorUsername: post.authorUsername,
      authorName: post.authorName,
      content: post.content,
      inReplyToUserId: post.inReplyToUserId,
      postCreatedAt: post.postCreatedAt,
    })
  }

  return new Response("OK", { status: 200 })
})
