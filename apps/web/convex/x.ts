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
import type { Doc, Id } from "./_generated/dataModel"
import { insertWorkspaceLog } from "./logs"
import {
  requireWorkspaceAccess,
  requireWorkspaceAdminAccess,
} from "./permissions"
import {
  feedbackImageAttachmentValidator,
  normalizeImageAttachments,
} from "./feedbackAttachments"
import {
  buildAppFallbackUrl,
  requireSafeAppRedirect,
  safeAppRedirect,
} from "../lib/safe-redirect"

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
  data?: XWebhookRecord[]
  meta?: {
    result_count?: number
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

type XSubscriptionListResponse = {
  data?: {
    application_id?: string
    webhook_id?: string
    webhook_url?: string
    subscriptions?: Array<{
      user_id?: string
    }>
  }
  errors?: Array<{
    title?: string
    type?: string
    detail?: string
    status?: number
  }>
}

type XReplayResponse = {
  data?: {
    job_id?: string
    created_at?: string
  }
  job_id?: string
  created_at?: string
  for_user_id?: string
  replay_event?: {
    created_at?: string
    job_id?: string
  }
  errors?: Array<{
    title?: string
    type?: string
    detail?: string
    status?: number
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

type XWebhookMedia = {
  type?: string
  media_type?: string
  content_type?: string
  media_url?: string
  media_url_https?: string
  url?: string
  sizes?: {
    large?: {
      w?: number
      h?: number
    }
  }
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
    media?: XWebhookMedia[]
  }
  extended_tweet?: {
    full_text?: string
    entities?: {
      user_mentions?: XWebhookMention[]
      media?: XWebhookMedia[]
    }
    extended_entities?: {
      media?: XWebhookMedia[]
    }
  }
  extended_entities?: {
    media?: XWebhookMedia[]
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

type XInspectionResult = {
  callbackUrl: string
  integrationUsername: string
  webhook: {
    id: string
    found: boolean
    valid: boolean | null
  }
  subscription: {
    active: boolean
  }
  subscriptions: {
    total: number
    subscribedUserIds: string[]
    includesConnectedUser: boolean
  }
  recentDeliveries: Array<{
    _id: Id<"xWebhookDeliveries">
    status: Doc<"xWebhookDeliveries">["status"]
    eventKind: Doc<"xWebhookDeliveries">["eventKind"]
    summary: string
    forUserId: string | null
    tweetCreateEventCount: number | null
    acceptedPostCount: number | null
    ignoredReason: string | null
    receivedAt: number
  }>
}

function logInfo(message: string, details?: Record<string, unknown>) {
  if (details) {
    console.log("[convex:x]", message, details)
    return
  }

  console.log("[convex:x]", message)
}

function logError(
  message: string,
  error: unknown,
  details?: Record<string, unknown>
) {
  if (details) {
    console.error("[convex:x]", message, details, error)
    return
  }

  console.error("[convex:x]", message, error)
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
  const webhooks = Array.isArray(data.data) ? data.data : []
  logInfo("Loaded X webhooks", {
    webhookCount: webhooks.length,
    callbackUrl: getWebhookUrl(),
  })
  return webhooks
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
      valid?: boolean
    }
  }
  if (!response.ok) {
    throw new Error("Failed to create X webhook")
  }
  const webhookId = data.data?.id ?? data.data?.webhook_id ?? null
  logInfo("Created X webhook", {
    webhookId,
    callbackUrl: url,
    valid: data.data?.valid ?? null,
  })
  return webhookId
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
  logInfo("Validated X webhook", {
    webhookId,
  })
}

async function ensureWebhook() {
  const callbackUrl = getWebhookUrl()
  const existing = (await fetchWebhooks()).find(
    (webhook) => webhook.url === callbackUrl
  )

  const webhookId = existing?.id ?? existing?.webhook_id ?? null
  if (webhookId) {
    logInfo("Reusing existing X webhook", {
      webhookId,
      callbackUrl,
      valid: existing?.valid ?? null,
    })
    if (existing?.valid !== true) {
      await validateWebhook(webhookId)
    }
    return webhookId
  }

  const createdWebhookId = await createWebhook(callbackUrl)
  if (!createdWebhookId) {
    throw new Error("X did not return a webhook ID")
  }
  await validateWebhook(createdWebhookId)
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
    logInfo("Created X subscription", {
      webhookId,
    })
    return
  }

  const duplicate = payload.errors?.some(
    (error) => error.title === "DuplicateSubscriptionFailed"
  )
  if (duplicate) {
    logInfo("X subscription already existed", {
      webhookId,
    })
    return
  }

  const message =
    payload.errors?.map((error) => error.message ?? error.title).join(", ") ??
    "Failed to subscribe the X account"
  throw new Error(message)
}

async function fetchSubscriptionStatus(
  webhookId: string,
  accessToken: string,
  accessTokenSecret: string
) {
  const endpoint = `https://api.x.com/2/account_activity/webhooks/${encodeURIComponent(
    webhookId
  )}/subscriptions/all`
  const response = await signedUserRequest(
    "GET",
    endpoint,
    accessToken,
    accessTokenSecret
  )
  const payload = (await response.json().catch(() => null)) as
    | { data?: { subscribed?: boolean } }
    | null

  if (!response.ok) {
    throw new Error("Failed to inspect the X subscription")
  }

  return payload?.data?.subscribed === true
}

async function listSubscriptionsForWebhook(webhookId: string) {
  const response = await fetch(
    `https://api.x.com/2/account_activity/webhooks/${encodeURIComponent(
      webhookId
    )}/subscriptions/all/list`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${getXBearerToken()}`,
      },
    }
  )

  const payload = (await response.json()) as XSubscriptionListResponse
  if (!response.ok) {
    const message =
      payload.errors
        ?.map((error) => error.detail ?? error.title ?? error.type)
        .filter(Boolean)
        .join(", ") ?? "Failed to list X webhook subscriptions"
    throw new Error(message)
  }

  return {
    applicationId: payload.data?.application_id ?? null,
    webhookId: payload.data?.webhook_id ?? webhookId,
    webhookUrl: payload.data?.webhook_url ?? null,
    subscribedUserIds: (payload.data?.subscriptions ?? [])
      .map((subscription) => normalizeId(subscription.user_id))
      .filter((value): value is string => Boolean(value)),
  }
}

function formatReplayTimestamp(date: Date) {
  const year = date.getUTCFullYear().toString().padStart(4, "0")
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0")
  const day = date.getUTCDate().toString().padStart(2, "0")
  const hours = date.getUTCHours().toString().padStart(2, "0")
  const minutes = date.getUTCMinutes().toString().padStart(2, "0")
  return `${year}${month}${day}${hours}${minutes}`
}

async function requestReplayJob(webhookId: string, lookbackMinutes: number) {
  const safeLookbackMinutes = Math.max(1, Math.min(lookbackMinutes, 24 * 60))
  const toDate = new Date()
  const fromDate = new Date(toDate.getTime() - safeLookbackMinutes * 60 * 1000)
  const fromDateStr = formatReplayTimestamp(fromDate)
  const toDateStr = formatReplayTimestamp(toDate)

  const response = await fetch("https://api.x.com/2/webhooks/replay", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getXBearerToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      webhook_id: webhookId,
      from_date: fromDateStr,
      to_date: toDateStr,
    }),
  })

  const rawBody = await response.text()
  let payload: XReplayResponse = {}

  if (rawBody.trim().length > 0) {
    try {
      payload = JSON.parse(rawBody) as XReplayResponse
    } catch {
      if (!response.ok) {
        throw new Error(rawBody)
      }
      throw new Error(`Unexpected X replay response: ${rawBody}`)
    }
  }

  const jobId =
    payload.data?.job_id ?? payload.job_id ?? payload.replay_event?.job_id
  const createdAt =
    payload.data?.created_at ??
    payload.created_at ??
    payload.replay_event?.created_at ??
    new Date().toISOString()

  if (!response.ok || !jobId) {
    const message =
      payload.errors
        ?.map((error) => error.detail ?? error.title ?? error.type)
        .filter(Boolean)
        .join(", ") ??
      (rawBody.trim().length > 0
        ? `Unexpected X replay response (${response.status}): ${rawBody}`
        : `Failed to create an X replay job (${response.status})`)
    throw new Error(message)
  }

  logInfo("Requested X replay job", {
    webhookId,
    jobId,
    fromDate: fromDateStr,
    toDate: toDateStr,
  })

  return {
    jobId,
    createdAt,
    fromDate: fromDateStr,
    toDate: toDateStr,
  }
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
  const safeBase =
    safeAppRedirect(baseRedirectUrl) ??
    buildAppFallbackUrl("/app/integrations/x")
  const redirectUrl = new URL(safeBase)
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

const X_IMAGE_MEDIA_TYPES_BY_EXTENSION: Record<string, string> = {
  avif: "image/avif",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
}

function normalizeTweetImageMediaType(mediaType: string | null | undefined) {
  const normalized = mediaType?.split(";")[0]?.trim().toLowerCase()
  return normalized?.startsWith("image/") ? normalized : undefined
}

function getTweetMediaUrl(media: XWebhookMedia) {
  return media.media_url_https ?? media.media_url ?? media.url
}

function inferTweetImageMediaTypeFromUrl(url: string | undefined) {
  if (!url) {
    return undefined
  }

  try {
    const parsed = new URL(url)
    const format = parsed.searchParams.get("format")?.toLowerCase()
    if (format && X_IMAGE_MEDIA_TYPES_BY_EXTENSION[format]) {
      return X_IMAGE_MEDIA_TYPES_BY_EXTENSION[format]
    }

    const extension = parsed.pathname.split(".").pop()?.toLowerCase()
    return extension ? X_IMAGE_MEDIA_TYPES_BY_EXTENSION[extension] : undefined
  } catch {
    const extension = url.split(/[?#]/)[0]?.split(".").pop()?.toLowerCase()
    return extension ? X_IMAGE_MEDIA_TYPES_BY_EXTENSION[extension] : undefined
  }
}

function getTweetImageMediaType(media: XWebhookMedia) {
  return (
    normalizeTweetImageMediaType(media.media_type) ??
    normalizeTweetImageMediaType(media.content_type) ??
    normalizeTweetImageMediaType(media.type) ??
    inferTweetImageMediaTypeFromUrl(getTweetMediaUrl(media)) ??
    "image/*"
  )
}

function isTweetImageMedia(media: XWebhookMedia) {
  return (
    media.type === "photo" ||
    media.type === undefined ||
    Boolean(normalizeTweetImageMediaType(media.type))
  )
}

function getTweetImageAttachments(tweet: XWebhookTweet) {
  const media =
    tweet.extended_tweet?.extended_entities?.media ??
    tweet.extended_entities?.media ??
    tweet.extended_tweet?.entities?.media ??
    tweet.entities?.media ??
    []

  return normalizeImageAttachments(
    media.filter(isTweetImageMedia).map((item) => {
      const url = getTweetMediaUrl(item)
      return {
        url,
        mediaType: getTweetImageMediaType(item),
        width: item.sizes?.large?.w,
        height: item.sizes?.large?.h,
      }
    })
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
      const imageAttachments = getTweetImageAttachments(tweet)
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

      if (
        !postId ||
        !authorId ||
        !authorUsername ||
        (!content && imageAttachments.length === 0)
      ) {
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
        imageAttachments,
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
    imageAttachments: ReturnType<typeof getTweetImageAttachments>
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
    const recentDeliveries = integration
      ? await ctx.db
          .query("xWebhookDeliveries")
          .withIndex("by_integration_received_at", (q) =>
            q.eq("integrationId", integration._id)
          )
          .order("desc")
          .take(10)
      : []

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
            webhookCallbackUrl: getWebhookUrl(),
            recentDeliveries: recentDeliveries.map((delivery) => ({
              _id: delivery._id,
              status: delivery.status,
              eventKind: delivery.eventKind,
              summary: delivery.summary,
              forUserId: delivery.forUserId ?? null,
              tweetCreateEventCount: delivery.tweetCreateEventCount ?? null,
              acceptedPostCount: delivery.acceptedPostCount ?? null,
              ignoredReason: delivery.ignoredReason ?? null,
              receivedAt: delivery.receivedAt,
            })),
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

export const getRecentWorkspaceWebhookDeliveriesInternal = internalQuery({
  args: {
    integrationId: v.id("xWorkspaceIntegrations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("xWebhookDeliveries")
      .withIndex("by_integration_received_at", (q) =>
        q.eq("integrationId", args.integrationId)
      )
      .order("desc")
      .take(Math.min(args.limit ?? 10, 25))
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
      const deliveries = await ctx.db
        .query("xWebhookDeliveries")
        .withIndex("by_integration_received_at", (q) =>
          q.eq("integrationId", integration._id)
        )
        .collect()

      await Promise.all(posts.map((post) => ctx.db.delete(post._id)))
      await Promise.all(
        deliveries.map((delivery) => ctx.db.delete(delivery._id))
      )
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
      const deliveries = await ctx.db
        .query("xWebhookDeliveries")
        .withIndex("by_integration_received_at", (q) =>
          q.eq("integrationId", existing._id)
        )
        .collect()

      await Promise.all(posts.map((post) => ctx.db.delete(post._id)))
      await Promise.all(
        deliveries.map((delivery) => ctx.db.delete(delivery._id))
      )
      await ctx.db.delete(existing._id)
    }

    const integrationId = await ctx.db.insert("xWorkspaceIntegrations", {
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

    await insertWorkspaceLog(ctx, {
      workspaceId: args.workspaceId,
      category: "integrations",
      type: "integration_connected",
      message: `X integration connected to @${args.username}`,
      source: "x",
    })

    return integrationId
  },
})

export const logWebhookDeliveryInternal = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    integrationId: v.id("xWorkspaceIntegrations"),
    status: v.union(
      v.literal("received"),
      v.literal("accepted"),
      v.literal("ignored"),
      v.literal("error")
    ),
    eventKind: v.union(
      v.literal("crc"),
      v.literal("tweet_create"),
      v.literal("replay_status"),
      v.literal("other")
    ),
    summary: v.string(),
    forUserId: v.optional(v.string()),
    tweetCreateEventCount: v.optional(v.number()),
    acceptedPostCount: v.optional(v.number()),
    ignoredReason: v.optional(v.string()),
    requestId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("xWebhookDeliveries", {
      ...args,
      receivedAt: Date.now(),
    })
    await insertWorkspaceLog(ctx, {
      workspaceId: args.workspaceId,
      category: "webhooks",
      type: args.status === "error" ? "webhook_error" : "webhook_received",
      message: args.summary,
      source: "x",
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

    const safeRedirect = requireSafeAppRedirect(args.redirectUrl)

    logInfo("Starting X OAuth connect flow", {
      workspaceId: args.workspaceId,
      callbackUrl: getOAuthCallbackUrl(),
      redirectUrl: safeRedirect,
    })

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
      redirectUrl: safeRedirect,
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

    await ctx.runMutation(internal.logs.recordWorkspaceLog, {
      workspaceId: args.workspaceId,
      category: "integrations",
      type: "integration_disconnected",
      message: "X integration disconnected",
      source: "x",
    })

    return { success: true }
  },
})

export const inspectWorkspaceXIntegration = action({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args): Promise<XInspectionResult> => {
    await ctx.runMutation(internal.x.assertWorkspaceAdminAccess, {
      workspaceId: args.workspaceId,
    })

    const integration = await ctx.runQuery(
      internal.x.getWorkspaceIntegrationInternal,
      {
        workspaceId: args.workspaceId,
      }
    )

    if (!integration) {
      throw new Error("No X integration found for this workspace")
    }

    const [recentDeliveries, webhooks, subscriptions]: [
      Doc<"xWebhookDeliveries">[],
      XWebhookRecord[],
      Awaited<ReturnType<typeof listSubscriptionsForWebhook>>,
    ] = await Promise.all([
      ctx.runQuery(internal.x.getRecentWorkspaceWebhookDeliveriesInternal, {
        integrationId: integration._id,
        limit: 10,
      }),
      fetchWebhooks(),
      listSubscriptionsForWebhook(integration.webhookId),
    ])

    const matchingWebhook =
      webhooks.find((webhook: XWebhookRecord) => webhook.url === getWebhookUrl()) ??
      null

    const accessToken = await decryptSecret(integration.accessTokenEncrypted)
    const accessTokenSecret = await decryptSecret(
      integration.accessTokenSecretEncrypted
    )
    const subscriptionActive = await fetchSubscriptionStatus(
      integration.webhookId,
      accessToken,
      accessTokenSecret
    )

    logInfo("Inspected X integration", {
      workspaceId: args.workspaceId,
      integrationId: integration._id,
      webhookFound: matchingWebhook !== null,
      webhookValid: matchingWebhook?.valid ?? null,
      subscriptionActive,
      listedSubscriptionCount: subscriptions.subscribedUserIds.length,
      recentDeliveryCount: recentDeliveries.length,
    })

    return {
      callbackUrl: getWebhookUrl(),
      integrationUsername: integration.username,
      webhook: {
        id: integration.webhookId,
        found: matchingWebhook !== null,
        valid: matchingWebhook?.valid ?? null,
      },
      subscription: {
        active: subscriptionActive,
      },
      subscriptions: {
        total: subscriptions.subscribedUserIds.length,
        subscribedUserIds: subscriptions.subscribedUserIds,
        includesConnectedUser: subscriptions.subscribedUserIds.includes(
          integration.xUserId
        ),
      },
      recentDeliveries: recentDeliveries.map((delivery: Doc<"xWebhookDeliveries">) => ({
        _id: delivery._id,
        status: delivery.status,
        eventKind: delivery.eventKind,
        summary: delivery.summary,
        forUserId: delivery.forUserId ?? null,
        tweetCreateEventCount: delivery.tweetCreateEventCount ?? null,
        acceptedPostCount: delivery.acceptedPostCount ?? null,
        ignoredReason: delivery.ignoredReason ?? null,
        receivedAt: delivery.receivedAt,
      })),
    }
  },
})

export const replayWorkspaceXIntegration = action({
  args: {
    workspaceId: v.id("workspaces"),
    lookbackMinutes: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{
    jobId: string
    createdAt: string
    fromDate: string
    toDate: string
  }> => {
    await ctx.runMutation(internal.x.assertWorkspaceAdminAccess, {
      workspaceId: args.workspaceId,
    })

    const integration = await ctx.runQuery(
      internal.x.getWorkspaceIntegrationInternal,
      {
        workspaceId: args.workspaceId,
      }
    )

    if (!integration) {
      throw new Error("No X integration found for this workspace")
    }

    return await requestReplayJob(
      integration.webhookId,
      args.lookbackMinutes ?? 30
    )
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
    imageAttachments: v.optional(v.array(feedbackImageAttachmentValidator)),
    inReplyToUserId: v.optional(v.string()),
    postCreatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const integration = await ctx.db.get(args.integrationId)
    if (!integration) {
      logInfo("Skipped inbound X post because integration was missing", {
        integrationId: args.integrationId,
        postId: args.postId,
      })
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
      logInfo("Skipped duplicate inbound X post", {
        integrationId: args.integrationId,
        postId: args.postId,
      })
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
      imageAttachments:
        args.imageAttachments && args.imageAttachments.length > 0
          ? args.imageAttachments
          : undefined,
      inReplyToUserId: args.inReplyToUserId,
      postCreatedAt: args.postCreatedAt,
      receivedAt: Date.now(),
    })

    await ctx.db.patch(args.integrationId, {
      lastIngestedPostId: args.postId,
      lastIngestedPostCreatedAt: args.postCreatedAt,
      lastIngestedAt: Date.now(),
    })

    await ctx.scheduler.runAfter(
      0,
      internal.billingTracking.trackIntegrationEvent,
      {
        workspaceId: integration.workspaceId,
        source: "x" as const,
        properties: {
          event_type: "post",
          post_id: args.postId,
          author_username: args.authorUsername,
        },
      }
    )

    await ctx.scheduler.runAfter(0, internal.xFeedback.scheduleFeedbackDetection, {
      integrationId: args.integrationId,
    })

    logInfo("Stored inbound X post", {
      integrationId: args.integrationId,
      workspaceId: integration.workspaceId,
      postId: args.postId,
      authorUsername: args.authorUsername,
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
    logInfo("Completing X OAuth callback", {
      workspaceId: state.workspaceId,
      requestToken,
    })

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

    logInfo("Completed X integration connect", {
      workspaceId: state.workspaceId,
      xUserId: me.id,
      username: me.username,
      webhookId,
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
    logError("Failed to complete X OAuth callback", error, {
      workspaceId: state.workspaceId,
      requestToken,
    })
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

    logInfo("Responded to X webhook CRC check", {
      callbackUrl: getWebhookUrl(),
    })

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

  if (payload.replay_job_status && !payload.for_user_id) {
    logInfo("Received X replay job status", {
      jobId: payload.replay_job_status.job_id ?? null,
      jobState: payload.replay_job_status.job_state ?? null,
      description: payload.replay_job_status.job_state_description ?? null,
    })
    return new Response("OK", { status: 200 })
  }

  const forUserId = normalizeId(payload.for_user_id)
  if (!forUserId) {
    logInfo("Ignored X webhook without for_user_id", {
      tweetCreateEventCount: payload.tweet_create_events?.length ?? 0,
    })
    return new Response("Ignored", { status: 200 })
  }

  const integration = await ctx.runQuery(internal.x.getIntegrationByUserIdInternal, {
    xUserId: forUserId,
  })
  if (!integration) {
    logInfo("Ignored X webhook for unknown subscribed user", {
      forUserId,
      tweetCreateEventCount: payload.tweet_create_events?.length ?? 0,
    })
    return new Response("Ignored", { status: 200 })
  }

  // Skip ingest when overages are disabled and the workspace's events are
  // exhausted. We still 200 so X doesn't keep retrying.
  try {
    const quota = await ctx.runAction(
      internal.billing.getWorkspaceQuotaStatusInternal,
      { workspaceId: integration.workspaceId }
    )
    if (quota.creditsExhausted) {
      logInfo("Skipping X webhook — events exhausted (overages disabled)", {
        workspaceId: integration.workspaceId,
        forUserId,
      })
      return new Response("Paused — events exhausted", { status: 200 })
    }
  } catch (error) {
    logError(
      "Quota check failed in X webhook — allowing sync",
      error,
      { workspaceId: integration.workspaceId, forUserId }
    )
  }

  const tweetCreateEventCount = payload.tweet_create_events?.length ?? 0
  const eventKind = payload.replay_job_status
    ? "replay_status"
    : tweetCreateEventCount > 0
      ? "tweet_create"
      : "other"

  try {
    const inboundPosts = extractRelevantInboundPosts(payload, integration)
    let acceptedPostCount = 0

    logInfo("Received X webhook delivery", {
      integrationId: integration._id,
      workspaceId: integration.workspaceId,
      forUserId,
      eventKind,
      tweetCreateEventCount,
      acceptedCandidateCount: inboundPosts.length,
    })

    for (const post of inboundPosts) {
      const result = await ctx.runMutation(
        internal.x.recordInboundPostInternal,
        {
          integrationId: integration._id,
          forUserId: post.forUserId,
          postId: post.postId,
          permalink: post.permalink,
          authorId: post.authorId,
          authorUsername: post.authorUsername,
          authorName: post.authorName,
          content: post.content,
          imageAttachments: post.imageAttachments,
          inReplyToUserId: post.inReplyToUserId,
          postCreatedAt: post.postCreatedAt,
        }
      )
      if (result.accepted) {
        acceptedPostCount += 1
      }
    }

    const ignoredReason =
      tweetCreateEventCount > 0 && acceptedPostCount === 0
        ? "No tweet_create events matched the current mention/reply filters."
        : undefined

    await ctx.runMutation(internal.x.logWebhookDeliveryInternal, {
      workspaceId: integration.workspaceId,
      integrationId: integration._id,
      status: acceptedPostCount > 0 ? "accepted" : "ignored",
      eventKind,
      summary:
        acceptedPostCount > 0
          ? `Accepted ${acceptedPostCount} inbound post${acceptedPostCount === 1 ? "" : "s"}.`
          : tweetCreateEventCount > 0
            ? "Received tweet_create events, but none matched the current filters."
            : payload.replay_job_status
              ? "Received replay status update from X."
              : "Received an X webhook delivery with no tweet_create events.",
      forUserId,
      tweetCreateEventCount,
      acceptedPostCount,
      ignoredReason,
      requestId: request.headers.get("x-request-id") ?? undefined,
    })

    return new Response("OK", { status: 200 })
  } catch (error) {
    logError("Failed to process X webhook delivery", error, {
      integrationId: integration._id,
      workspaceId: integration.workspaceId,
      forUserId,
      eventKind,
      tweetCreateEventCount,
    })
    await ctx.runMutation(internal.x.logWebhookDeliveryInternal, {
      workspaceId: integration.workspaceId,
      integrationId: integration._id,
      status: "error",
      eventKind,
      summary: "Failed to process an inbound X webhook delivery.",
      forUserId,
      tweetCreateEventCount,
      acceptedPostCount: 0,
      ignoredReason:
        error instanceof Error ? error.message : "Unknown X webhook error",
      requestId: request.headers.get("x-request-id") ?? undefined,
    })
    return new Response("Error", { status: 500 })
  }
})
