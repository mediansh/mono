import { v } from "convex/values"
import {
  httpAction,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server"
import { internal } from "./_generated/api"
import { insertWorkspaceLog } from "./logs"
import {
  requireWorkspaceAccess,
  requireWorkspaceAdminAccess,
} from "./permissions"
import type { Id } from "./_generated/dataModel"

// ── Env helpers ──────────────────────────────────────────

function getRequiredEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function requireSlackBotSecret(botSecret: string) {
  const configuredSecret = process.env.SLACK_BOT_SECRET
  if (!configuredSecret || botSecret !== configuredSecret) {
    throw new Error("Invalid Slack bot secret")
  }
}

const SLACK_NOTIFICATION_CLAIM_TIMEOUT_MS = 1000 * 60 * 5

// ── Encryption helpers (AES-GCM, same pattern as X) ─────

function binaryStringToBytes(str: string) {
  const bytes = new Uint8Array(str.length)
  for (let index = 0; index < str.length; index += 1) {
    bytes[index] = str.charCodeAt(index)
  }
  return bytes
}

function bytesToBinaryString(bytes: Uint8Array) {
  let value = ""
  for (let index = 0; index < bytes.length; index += 1) {
    value += String.fromCharCode(bytes[index]!)
  }
  return value
}

function base64UrlEncode(bytes: Uint8Array) {
  return btoa(bytesToBinaryString(bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
}

function decodeBase64(value: string) {
  return binaryStringToBytes(atob(value))
}

async function importAesKey() {
  const secret = getRequiredEnv("SLACK_TOKEN_ENCRYPTION_KEY")
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
    throw new Error("Invalid encrypted Slack token payload")
  }
  const key = await importAesKey()
  const iv = decodeBase64(ivEncoded.replace(/-/g, "+").replace(/_/g, "/"))
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

function timingSafeEqualString(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left)
  const rightBytes = new TextEncoder().encode(right)
  if (leftBytes.length !== rightBytes.length) return false
  let mismatch = 0
  for (let index = 0; index < leftBytes.length; index += 1) {
    mismatch |= leftBytes[index]! ^ rightBytes[index]!
  }
  return mismatch === 0
}

function normalizeChannelIds(channelIds: string[]) {
  return Array.from(
    new Set(channelIds.map((channelId) => channelId.trim()).filter(Boolean))
  )
}

// ── Slack request verification ──────────────────────────

async function verifySlackRequest(
  request: Request,
  body: string
): Promise<boolean> {
  const signingSecret = process.env.SLACK_SIGNING_SECRET
  if (!signingSecret) return false

  const timestamp = request.headers.get("x-slack-request-timestamp")
  const signature = request.headers.get("x-slack-signature")
  if (!timestamp || !signature) return false

  // Reject requests older than 5 minutes
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - Number(timestamp)) > 300) return false

  const sigBasestring = `v0:${timestamp}:${body}`
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(sigBasestring)
    )
  )
  const mySignature = `v0=${Array.from(sigBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`

  return timingSafeEqualString(mySignature, signature)
}

// ── Queries ─────────────────────────────────────────────

export const getWorkspaceSlackIntegration = query({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    const { membership } = await requireWorkspaceAccess(ctx, args.workspaceId)

    const integration = await ctx.db
      .query("slackWorkspaceIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .unique()

    if (!integration) {
      return {
        canManage: membership.role === "admin" || membership.role === "owner",
        integration: null,
      }
    }

    return {
      canManage: membership.role === "admin" || membership.role === "owner",
      integration: {
        _id: integration._id,
        teamId: integration.teamId,
        teamName: integration.teamName,
        connectedAt: integration.connectedAt,
        feedbackCollectionEnabled:
          integration.feedbackCollectionEnabled ?? false,
        feedbackChannelId: integration.feedbackChannelId ?? null,
        notificationChannelId: integration.notificationChannelId ?? null,
        additionalContext: integration.additionalContext ?? "",
        respondForMe: integration.respondForMe ?? false,
        respondForMeMode:
          integration.respondForMeMode ??
          (integration.respondForMe ? "all" : "off"),
        respondForMeChannelIds: integration.respondForMeChannelIds ?? [],
        feedbackIgnoredChannelIds: integration.feedbackIgnoredChannelIds ?? [],
        teamChannels: integration.teamChannels ?? [],
      },
    }
  },
})

// ── OAuth flow ──────────────────────────────────────────

export const initiateSlackOAuth = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    redirectUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const { identity } = await requireWorkspaceAdminAccess(
      ctx,
      args.workspaceId
    )

    const state = crypto.randomUUID()
    const expiresAt = Date.now() + 1000 * 60 * 10 // 10 min

    await ctx.db.insert("slackOAuthStates", {
      workspaceId: args.workspaceId,
      initiatedByUserId: identity.subject,
      state,
      redirectUrl: args.redirectUrl,
      expiresAt,
    })

    const clientId = getRequiredEnv("SLACK_CLIENT_ID")
    const scopes = [
      "channels:history",
      "channels:read",
      "chat:write",
      "groups:history",
      "groups:read",
      "users:read",
    ].join(",")

    const convexUrl = process.env.CONVEX_SITE_URL ?? ""
    const redirectUri = `${convexUrl}/slack/oauth/callback`

    const authorizeUrl = new URL("https://slack.com/oauth/v2/authorize")
    authorizeUrl.searchParams.set("client_id", clientId)
    authorizeUrl.searchParams.set("scope", scopes)
    authorizeUrl.searchParams.set("redirect_uri", redirectUri)
    authorizeUrl.searchParams.set("state", state)

    return { authorizeUrl: authorizeUrl.toString() }
  },
})

export const getOAuthStateByStateInternal = internalQuery({
  args: { state: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("slackOAuthStates")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .unique()
  },
})

export const completeSlackOAuth = internalMutation({
  args: {
    stateId: v.id("slackOAuthStates"),
    teamId: v.string(),
    teamName: v.string(),
    botUserId: v.string(),
    accessTokenEncrypted: v.string(),
  },
  handler: async (ctx, args) => {
    const state = await ctx.db.get(args.stateId)
    if (!state) throw new Error("OAuth state not found")

    await ctx.db.patch(args.stateId, { completedAt: Date.now() })

    // Remove any existing integration for this workspace or team
    const [workspaceIntegrations, teamIntegrations] = await Promise.all([
      ctx.db
        .query("slackWorkspaceIntegrations")
        .withIndex("by_workspace", (q) =>
          q.eq("workspaceId", state.workspaceId)
        )
        .collect(),
      ctx.db
        .query("slackWorkspaceIntegrations")
        .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
        .collect(),
    ])

    const integrationIds = new Set([
      ...workspaceIntegrations.map((i) => i._id),
      ...teamIntegrations.map((i) => i._id),
    ])
    await Promise.all([...integrationIds].map((id) => ctx.db.delete(id)))

    const connectedAt = Date.now()
    const integrationId = await ctx.db.insert("slackWorkspaceIntegrations", {
      workspaceId: state.workspaceId,
      teamId: args.teamId,
      teamName: args.teamName,
      botUserId: args.botUserId,
      accessTokenEncrypted: args.accessTokenEncrypted,
      connectedAt,
      connectedByUserId: state.initiatedByUserId,
      feedbackCollectionEnabled: false,
    })

    await insertWorkspaceLog(ctx, {
      workspaceId: state.workspaceId,
      category: "integrations",
      type: "integration_connected",
      message: `Slack integration connected to ${args.teamName}`,
      source: "slack",
    })

    return { integrationId, teamName: args.teamName, connectedAt }
  },
})

// ── OAuth HTTP callback ─────────────────────────────────

function formatStatusRedirect(
  baseUrl: string,
  status: "success" | "error",
  message: string
) {
  const url = new URL(baseUrl)
  url.searchParams.set("slack_status", status)
  url.searchParams.set("slack_message", message)
  return url.toString()
}

export const slackOAuthCallback = httpAction(async (ctx, request) => {
  const url = new URL(request.url)
  const stateToken = url.searchParams.get("state")
  const code = url.searchParams.get("code")
  const error = url.searchParams.get("error")

  if (!stateToken) {
    return new Response("Missing state parameter", { status: 400 })
  }

  const state = await ctx.runQuery(
    internal.slack.getOAuthStateByStateInternal,
    { state: stateToken }
  )

  if (!state) {
    return new Response("Unknown OAuth state", { status: 404 })
  }

  if (state.completedAt || state.expiresAt <= Date.now()) {
    return Response.redirect(
      formatStatusRedirect(
        state.redirectUrl,
        "error",
        "That Slack connection link has expired."
      ),
      302
    )
  }

  if (error) {
    return Response.redirect(
      formatStatusRedirect(
        state.redirectUrl,
        "error",
        error === "access_denied"
          ? "Slack authorization was cancelled."
          : `Slack authorization failed: ${error}`
      ),
      302
    )
  }

  if (!code) {
    return Response.redirect(
      formatStatusRedirect(
        state.redirectUrl,
        "error",
        "Missing authorization code from Slack."
      ),
      302
    )
  }

  // Exchange code for access token
  try {
    const clientId = getRequiredEnv("SLACK_CLIENT_ID")
    const clientSecret = getRequiredEnv("SLACK_CLIENT_SECRET")
    const convexUrl = process.env.CONVEX_SITE_URL ?? ""
    const redirectUri = `${convexUrl}/slack/oauth/callback`

    const tokenResponse = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    })

    const tokenData = (await tokenResponse.json()) as {
      ok: boolean
      error?: string
      access_token?: string
      team?: { id: string; name: string }
      bot_user_id?: string
    }

    if (
      !tokenData.ok ||
      !tokenData.access_token ||
      !tokenData.team ||
      !tokenData.bot_user_id
    ) {
      return Response.redirect(
        formatStatusRedirect(
          state.redirectUrl,
          "error",
          `Slack token exchange failed: ${tokenData.error ?? "unknown error"}`
        ),
        302
      )
    }

    const accessTokenEncrypted = await encryptSecret(tokenData.access_token)

    await ctx.runMutation(internal.slack.completeSlackOAuth, {
      stateId: state._id,
      teamId: tokenData.team.id,
      teamName: tokenData.team.name,
      botUserId: tokenData.bot_user_id,
      accessTokenEncrypted,
    })

    // Sync channels after connecting
    await ctx.scheduler.runAfter(0, internal.slack.syncChannelsAction, {
      teamId: tokenData.team.id,
    })

    return Response.redirect(
      formatStatusRedirect(
        state.redirectUrl,
        "success",
        `Connected to ${tokenData.team.name}`
      ),
      302
    )
  } catch (err) {
    console.error("[slack] OAuth callback error", err)
    return Response.redirect(
      formatStatusRedirect(
        state.redirectUrl,
        "error",
        "An unexpected error occurred during Slack authorization."
      ),
      302
    )
  }
})

// ── Disconnect ──────────────────────────────────────────

export const disconnectWorkspaceSlackIntegration = mutation({
  args: {
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAdminAccess(ctx, args.workspaceId)

    const integrations = await ctx.db
      .query("slackWorkspaceIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect()

    await Promise.all(
      integrations.map((integration) => ctx.db.delete(integration._id))
    )

    if (integrations.length > 0) {
      await insertWorkspaceLog(ctx, {
        workspaceId: args.workspaceId,
        category: "integrations",
        type: "integration_disconnected",
        message: "Slack integration disconnected",
        source: "slack",
      })
    }
  },
})

// ── Settings ────────────────────────────────────────────

export const updateSlackIntegrationSettings = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    additionalContext: v.optional(v.string()),
    feedbackCollectionEnabled: v.optional(v.boolean()),
    feedbackChannelId: v.optional(v.string()),
    notificationChannelId: v.optional(v.string()),
    respondForMe: v.optional(v.boolean()),
    respondForMeMode: v.optional(
      v.union(v.literal("off"), v.literal("all"), v.literal("specific"))
    ),
    respondForMeChannelIds: v.optional(v.array(v.string())),
    feedbackIgnoredChannelIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceAdminAccess(ctx, args.workspaceId)

    const integration = await ctx.db
      .query("slackWorkspaceIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .unique()

    if (!integration) {
      throw new Error("No Slack integration found for this workspace")
    }

    const updates: Record<string, unknown> = {}
    if (args.additionalContext !== undefined) {
      updates.additionalContext = args.additionalContext.trim() || undefined
    }
    if (args.feedbackCollectionEnabled !== undefined) {
      updates.feedbackCollectionEnabled = args.feedbackCollectionEnabled
    }
    if (args.feedbackChannelId !== undefined) {
      updates.feedbackChannelId = args.feedbackChannelId || undefined
    }
    if (args.notificationChannelId !== undefined) {
      updates.notificationChannelId = args.notificationChannelId || undefined
    }
    if (args.respondForMeMode !== undefined) {
      updates.respondForMeMode = args.respondForMeMode
      updates.respondForMe = args.respondForMeMode !== "off"
    }
    if (args.respondForMeChannelIds !== undefined) {
      updates.respondForMeChannelIds = normalizeChannelIds(
        args.respondForMeChannelIds
      )
    }
    if (args.feedbackIgnoredChannelIds !== undefined) {
      updates.feedbackIgnoredChannelIds = normalizeChannelIds(
        args.feedbackIgnoredChannelIds
      )
    }
    // Legacy support
    if (
      args.respondForMe !== undefined &&
      args.respondForMeMode === undefined
    ) {
      updates.respondForMe = args.respondForMe
      updates.respondForMeMode = args.respondForMe ? "all" : "off"
    }

    await ctx.db.patch(integration._id, updates)
  },
})

// ── Channel sync ────────────────────────────────────────

export const syncChannelsAction = internalMutation({
  args: {
    teamId: v.string(),
  },
  handler: async (ctx, args) => {
    const integration = await ctx.db
      .query("slackWorkspaceIntegrations")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .first()

    if (!integration) return

    await ctx.scheduler.runAfter(0, internal.slack.fetchAndSyncChannels, {
      integrationId: integration._id,
    })
  },
})

export const fetchAndSyncChannels = internalAction({
  args: {
    integrationId: v.id("slackWorkspaceIntegrations"),
  },
  handler: async (ctx, args) => {
    const integration = await ctx.runQuery(
      internal.slack.getIntegrationInternal,
      { integrationId: args.integrationId }
    )
    if (!integration) return

    const token = await decryptSecret(integration.accessTokenEncrypted)
    const channels: Array<{ id: string; name: string; isPrivate: boolean }> = []
    let cursor: string | undefined

    // Paginate through all channels
    for (let page = 0; page < 10; page += 1) {
      const params = new URLSearchParams({
        types: "public_channel,private_channel",
        exclude_archived: "true",
        limit: "200",
      })
      if (cursor) params.set("cursor", cursor)

      const response = await fetch(
        `https://slack.com/api/conversations.list?${params}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const data = (await response.json()) as {
        ok: boolean
        channels?: Array<{ id: string; name: string; is_private: boolean }>
        response_metadata?: { next_cursor?: string }
      }

      if (!data.ok || !data.channels) break

      for (const ch of data.channels) {
        channels.push({
          id: ch.id,
          name: ch.name,
          isPrivate: ch.is_private,
        })
      }

      cursor = data.response_metadata?.next_cursor || undefined
      if (!cursor) break
    }

    await ctx.runMutation(internal.slack.saveChannelSync, {
      integrationId: args.integrationId,
      channels,
    })
  },
})

export const saveChannelSync = internalMutation({
  args: {
    integrationId: v.id("slackWorkspaceIntegrations"),
    channels: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        isPrivate: v.boolean(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const integration = await ctx.db.get(args.integrationId)
    if (!integration) return

    await ctx.db.patch(args.integrationId, {
      teamChannels: args.channels,
    })
  },
})

// ── Inbound message recording ───────────────────────────

export const recordInboundMessage = internalMutation({
  args: {
    teamId: v.string(),
    channelId: v.string(),
    channelName: v.optional(v.string()),
    threadTs: v.optional(v.string()),
    messageTs: v.string(),
    permalink: v.optional(v.string()),
    authorId: v.string(),
    authorUsername: v.string(),
    content: v.string(),
    messageCreatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const integration = await ctx.db
      .query("slackWorkspaceIntegrations")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .first()

    if (!integration) {
      return { accepted: false, duplicate: false, integration: null } as const
    }

    // Check if feedback collection is enabled
    if (!integration.feedbackCollectionEnabled) {
      return { accepted: false, duplicate: false, integration: null } as const
    }

    // If a specific feedback channel is set, only accept messages from it
    if (
      integration.feedbackChannelId &&
      args.channelId !== integration.feedbackChannelId
    ) {
      return { accepted: false, duplicate: false, integration: null } as const
    }

    if (
      (integration.feedbackIgnoredChannelIds ?? []).includes(args.channelId)
    ) {
      return { accepted: false, duplicate: false, integration: null } as const
    }

    const existingMessage = await ctx.db
      .query("slackMessages")
      .withIndex("by_slack_message", (q) =>
        q
          .eq("teamId", args.teamId)
          .eq("channelId", args.channelId)
          .eq("messageTs", args.messageTs)
      )
      .unique()

    if (existingMessage) {
      return {
        accepted: false,
        duplicate: true,
        integration: {
          integrationId: integration._id,
          workspaceId: integration.workspaceId,
          teamName: integration.teamName,
        },
      } as const
    }

    const permalink =
      args.permalink ??
      `https://slack.com/archives/${args.channelId}/p${args.messageTs.replace(".", "")}`

    await ctx.db.insert("slackMessages", {
      workspaceId: integration.workspaceId,
      integrationId: integration._id,
      teamId: args.teamId,
      channelId: args.channelId,
      channelName: args.channelName,
      threadTs: args.threadTs,
      messageTs: args.messageTs,
      permalink,
      authorId: args.authorId,
      authorUsername: args.authorUsername,
      content: args.content,
      messageCreatedAt: args.messageCreatedAt,
      receivedAt: Date.now(),
    })

    await insertWorkspaceLog(ctx, {
      workspaceId: integration.workspaceId,
      category: "webhooks",
      type: "webhook_received",
      message: `Slack message received in ${args.channelName ?? "channel"}`,
      source: "slack",
    })

    await ctx.scheduler.runAfter(
      0,
      internal.billingTracking.trackIntegrationEvent,
      {
        workspaceId: integration.workspaceId,
        source: "slack" as const,
        properties: {
          event_type: "message",
          channel_id: args.channelId,
          channel_name: args.channelName ?? undefined,
        },
      }
    )

    await ctx.scheduler.runAfter(
      0,
      internal.slackFeedback.scheduleFeedbackDetection,
      {
        integrationId: integration._id,
      }
    )

    return {
      accepted: true,
      duplicate: false,
      integration: {
        integrationId: integration._id,
        workspaceId: integration.workspaceId,
        teamName: integration.teamName,
      },
    } as const
  },
})

// ── Slack Events API webhook ────────────────────────────

export const slackEventsWebhook = httpAction(async (ctx, request) => {
  const body = await request.text()

  // Verify request signature
  const isValid = await verifySlackRequest(request, body)
  if (!isValid) {
    return new Response("Invalid signature", { status: 401 })
  }

  const payload = JSON.parse(body) as {
    type: string
    challenge?: string
    event?: {
      type: string
      subtype?: string
      channel?: string
      channel_type?: string
      user?: string
      text?: string
      ts?: string
      thread_ts?: string
      bot_id?: string
      team?: string
    }
    team_id?: string
  }

  // URL verification challenge
  if (payload.type === "url_verification") {
    return new Response(JSON.stringify({ challenge: payload.challenge }), {
      headers: { "Content-Type": "application/json" },
    })
  }

  // Handle event callbacks
  if (payload.type === "event_callback" && payload.event) {
    const event = payload.event
    const teamId = payload.team_id ?? event.team

    // Only process messages (not bot messages, not subtypes like message_changed)
    if (
      event.type === "message" &&
      !event.subtype &&
      !event.bot_id &&
      event.channel &&
      event.user &&
      event.text &&
      event.ts &&
      teamId
    ) {
      // Look up username
      const integration = await ctx.runQuery(
        internal.slack.getIntegrationByTeamInternal,
        { teamId }
      )

      let authorUsername = event.user
      const channelName = integration?.teamChannels?.find(
        (channel) => channel.id === event.channel
      )?.name
      if (integration) {
        try {
          const token = await decryptSecret(integration.accessTokenEncrypted)
          const userResponse = await fetch(
            `https://slack.com/api/users.info?user=${event.user}`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          )
          const userData = (await userResponse.json()) as {
            ok: boolean
            user?: {
              name?: string
              real_name?: string
              profile?: { display_name?: string }
            }
          }
          if (userData.ok && userData.user) {
            authorUsername =
              userData.user.profile?.display_name ||
              userData.user.real_name ||
              userData.user.name ||
              event.user
          }
        } catch {
          // Fall back to user ID
        }
      }

      await ctx.runMutation(internal.slack.recordInboundMessage, {
        teamId,
        channelId: event.channel!,
        channelName,
        threadTs: event.thread_ts,
        messageTs: event.ts,
        authorId: event.user,
        authorUsername,
        content: event.text,
        messageCreatedAt: Math.floor(Number(event.ts.split(".")[0]) * 1000),
      })
    }
  }

  return new Response("ok", { status: 200 })
})

// ── Slack Interactivity (button clicks) ─────────────────

export const slackInteractivity = httpAction(async (ctx, request) => {
  const body = await request.text()
  const isValid = await verifySlackRequest(request, body)
  if (!isValid) {
    return new Response("Invalid signature", { status: 401 })
  }

  const params = new URLSearchParams(body)
  const payloadStr = params.get("payload")
  if (!payloadStr) {
    return new Response("Missing payload", { status: 400 })
  }

  const payload = JSON.parse(payloadStr) as {
    type: string
    actions?: Array<{
      action_id: string
      value?: string
    }>
    user?: { id: string; name: string }
    message?: { ts: string }
    channel?: { id: string }
    team?: { id: string }
  }

  if (payload.type === "block_actions" && payload.actions) {
    for (const action of payload.actions) {
      if (
        action.action_id === "accept_request" ||
        action.action_id === "deny_request"
      ) {
        const taskId = action.value as Id<"tasks">
        if (!taskId) continue

        const nextStatus =
          action.action_id === "accept_request" ? "todo" : "archive"

        await ctx.runMutation(internal.slack.handleRequestAction, {
          taskId,
          nextStatus,
          actorName: payload.user?.name ?? "Unknown",
          teamId: payload.team?.id ?? "",
          channelId: payload.channel?.id ?? "",
          messageTs: payload.message?.ts ?? "",
        })
      }
    }
  }

  return new Response("", { status: 200 })
})

export const handleRequestAction = internalMutation({
  args: {
    taskId: v.id("tasks"),
    nextStatus: v.union(v.literal("todo"), v.literal("archive")),
    actorName: v.string(),
    teamId: v.string(),
    channelId: v.string(),
    messageTs: v.string(),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId)
    if (!task) return

    // Only allow action on requests
    if (task.status !== "requests") return

    await ctx.db.patch(args.taskId, {
      status: args.nextStatus,
      updatedAt: Date.now(),
    })

    await ctx.scheduler.runAfter(0, internal.linear.syncTaskToLinearIssue, {
      taskId: args.taskId,
    })
    await ctx.scheduler.runAfter(0, internal.github.syncTaskToGitHubIssue, {
      taskId: args.taskId,
    })

    const logType =
      args.nextStatus === "todo" ? "request_accepted" : "request_denied"
    const logMessage =
      args.nextStatus === "todo"
        ? `Request "${task.title}" accepted by ${args.actorName} via Slack`
        : `Request "${task.title}" denied by ${args.actorName} via Slack`

    await insertWorkspaceLog(ctx, {
      workspaceId: task.workspaceId,
      category: "tasks",
      type: logType,
      message: logMessage,
      source: "slack",
    })

    // Update the Slack message to show the action taken
    const integration = await ctx.db
      .query("slackWorkspaceIntegrations")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .first()

    if (integration) {
      await ctx.scheduler.runAfter(0, internal.slack.updateSlackMessage, {
        integrationId: integration._id,
        channelId: args.channelId,
        messageTs: args.messageTs,
        taskId: args.taskId,
        action: args.nextStatus === "todo" ? "accepted" : "denied",
        actorName: args.actorName,
      })
    }
  },
})

export const updateSlackMessage = internalAction({
  args: {
    integrationId: v.id("slackWorkspaceIntegrations"),
    channelId: v.string(),
    messageTs: v.string(),
    taskId: v.id("tasks"),
    action: v.union(v.literal("accepted"), v.literal("denied")),
    actorName: v.string(),
  },
  handler: async (ctx, args) => {
    const integration = await ctx.runQuery(
      internal.slack.getIntegrationInternal,
      { integrationId: args.integrationId }
    )
    if (!integration) return

    const token = await decryptSecret(integration.accessTokenEncrypted)
    const emoji = args.action === "accepted" ? ":white_check_mark:" : ":x:"
    const statusText = args.action === "accepted" ? "Accepted" : "Denied"

    await fetch("https://slack.com/api/chat.update", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: args.channelId,
        ts: args.messageTs,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${emoji} *${statusText}* by ${args.actorName}`,
            },
          },
        ],
      }),
    })
  },
})

// ── Notification queries/mutations ──────────────────────

export const getAllPendingSlackNotifications = internalQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const notifications = await ctx.db
      .query("slackPendingNotifications")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(Math.min(args.limit ?? 20, 50))

    return notifications.map((notification) => ({
      _id: notification._id,
      integrationId: notification.integrationId,
      type: notification.type,
      channelId: notification.channelId,
      threadTs: notification.threadTs ?? null,
      taskTitle: notification.taskTitle,
      taskCode: notification.taskCode,
      taskDescription: notification.taskDescription ?? null,
      taskPriority: notification.taskPriority ?? null,
      taskLabels: notification.taskLabels ?? [],
      sourceAuthor: notification.sourceAuthor ?? null,
      taskId: notification.taskId,
    }))
  },
})

export const markSlackNotificationSent = internalMutation({
  args: {
    notificationId: v.id("slackPendingNotifications"),
    status: v.union(v.literal("sent"), v.literal("failed")),
    slackMessageTs: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId)
    if (!notification) {
      throw new Error("Notification not found")
    }

    await ctx.db.patch(args.notificationId, {
      status: args.status,
      sendingStartedAt: undefined,
      sentAt: args.status === "sent" ? Date.now() : undefined,
      slackMessageTs: args.slackMessageTs,
    })
  },
})

export const recoverStaleNotificationClaim = internalMutation({
  args: {
    notificationId: v.id("slackPendingNotifications"),
    sendingStartedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId)
    if (
      !notification ||
      notification.status !== "sending" ||
      notification.sendingStartedAt !== args.sendingStartedAt
    ) {
      return false
    }

    await ctx.db.patch(args.notificationId, {
      status: "pending",
      sendingStartedAt: undefined,
    })
    await ctx.scheduler.runAfter(0, internal.slack.sendSlackNotification, {
      notificationId: args.notificationId,
    })
    return true
  },
})

// ── Notification sending action ─────────────────────────

export const getIntegrationByTeamInternal = internalQuery({
  args: { teamId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("slackWorkspaceIntegrations")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .first()
  },
})

export const getIntegrationInternal = internalQuery({
  args: { integrationId: v.id("slackWorkspaceIntegrations") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.integrationId)
  },
})

// ── Feature request notification helper (called from tasks.ts) ──

export const queueFeatureRequestNotification = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    taskId: v.id("tasks"),
    taskTitle: v.string(),
    taskCode: v.string(),
    taskDescription: v.optional(v.string()),
    taskPriority: v.optional(v.string()),
    taskLabels: v.optional(v.array(v.string())),
    sourceAuthor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    console.log("[slack] queueFeatureRequestNotification called", {
      workspaceId: args.workspaceId,
      taskCode: args.taskCode,
    })

    const integration = await ctx.db
      .query("slackWorkspaceIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .unique()

    if (!integration) {
      console.log(
        "[slack] No Slack integration found for workspace",
        args.workspaceId
      )
      return
    }

    if (!integration.notificationChannelId) {
      console.log("[slack] No notification channel configured", {
        integrationId: integration._id,
      })
      return
    }

    console.log("[slack] Inserting feature_request notification", {
      integrationId: integration._id,
      channelId: integration.notificationChannelId,
      taskCode: args.taskCode,
    })

    const notificationId = await ctx.db.insert("slackPendingNotifications", {
      workspaceId: args.workspaceId,
      integrationId: integration._id,
      taskId: args.taskId,
      type: "feature_request",
      channelId: integration.notificationChannelId,
      taskTitle: args.taskTitle,
      taskCode: args.taskCode,
      taskDescription: args.taskDescription,
      taskPriority: args.taskPriority,
      taskLabels: args.taskLabels,
      sourceAuthor: args.sourceAuthor,
      status: "pending",
      createdAt: Date.now(),
    })

    // Trigger sending this specific notification
    await ctx.scheduler.runAfter(0, internal.slack.sendSlackNotification, {
      notificationId,
    })
  },
})

// ── Notification sender (one notification at a time) ────

export const claimNotification = internalMutation({
  args: {
    notificationId: v.id("slackPendingNotifications"),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId)
    if (!notification) {
      return null
    }

    const now = Date.now()
    const hasStaleSendingClaim =
      notification.status === "sending" &&
      (notification.sendingStartedAt ?? 0) <=
        now - SLACK_NOTIFICATION_CLAIM_TIMEOUT_MS

    if (notification.status !== "pending" && !hasStaleSendingClaim) {
      return null
    }

    // Atomically claim it so no other sender picks it up, while leaving a recovery
    // path if the action dies before Slack acknowledges the send.
    await ctx.db.patch(args.notificationId, {
      status: "sending",
      sendingStartedAt: now,
    })
    await ctx.scheduler.runAfter(
      SLACK_NOTIFICATION_CLAIM_TIMEOUT_MS,
      internal.slack.recoverStaleNotificationClaim,
      {
        notificationId: args.notificationId,
        sendingStartedAt: now,
      }
    )

    return {
      _id: notification._id,
      integrationId: notification.integrationId,
      type: notification.type,
      channelId: notification.channelId,
      threadTs: notification.threadTs ?? null,
      taskTitle: notification.taskTitle,
      taskCode: notification.taskCode,
      taskDescription: notification.taskDescription ?? null,
      taskPriority: notification.taskPriority ?? null,
      taskLabels: notification.taskLabels ?? [],
      sourceAuthor: notification.sourceAuthor ?? null,
      taskId: notification.taskId,
    }
  },
})

export const sendSlackNotification = internalAction({
  args: {
    notificationId: v.id("slackPendingNotifications"),
  },
  handler: async (ctx, args) => {
    // Claim the notification atomically — if another sender already claimed it, bail
    const notification = await ctx.runMutation(
      internal.slack.claimNotification,
      { notificationId: args.notificationId }
    )
    if (!notification) return

    const integration = await ctx.runQuery(
      internal.slack.getIntegrationInternal,
      { integrationId: notification.integrationId }
    )
    if (!integration) {
      await ctx.runMutation(internal.slack.markSlackNotificationSent, {
        notificationId: notification._id,
        status: "failed",
      })
      return
    }

    try {
      const token = await decryptSecret(integration.accessTokenEncrypted)
      let slackResponse: { ok: boolean; ts?: string; error?: string }

      if (notification.type === "feature_request") {
        const blocks: unknown[] = [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: `:sparkles: New Feature Request`,
              emoji: true,
            },
          },
          {
            type: "section",
            fields: [
              {
                type: "mrkdwn",
                text: `*Title:*\n${notification.taskTitle}`,
              },
              {
                type: "mrkdwn",
                text: `*Code:*\n${notification.taskCode}`,
              },
            ],
          },
        ]

        if (notification.taskDescription) {
          blocks.push({
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Description:*\n${notification.taskDescription}`,
            },
          })
        }

        const metaFields: Array<{ type: string; text: string }> = []
        if (notification.taskPriority && notification.taskPriority !== "none") {
          metaFields.push({
            type: "mrkdwn",
            text: `*Priority:* ${notification.taskPriority}`,
          })
        }
        if (notification.sourceAuthor) {
          metaFields.push({
            type: "mrkdwn",
            text: `*From:* ${notification.sourceAuthor}`,
          })
        }
        if (notification.taskLabels && notification.taskLabels.length > 0) {
          metaFields.push({
            type: "mrkdwn",
            text: `*Labels:* ${notification.taskLabels.join(", ")}`,
          })
        }

        if (metaFields.length > 0) {
          blocks.push({
            type: "section",
            fields: metaFields,
          })
        }

        blocks.push(
          { type: "divider" },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: {
                  type: "plain_text",
                  text: "Accept",
                  emoji: true,
                },
                style: "primary",
                action_id: "accept_request",
                value: notification.taskId,
              },
              {
                type: "button",
                text: {
                  type: "plain_text",
                  text: "Deny",
                  emoji: true,
                },
                style: "danger",
                action_id: "deny_request",
                value: notification.taskId,
              },
            ],
          }
        )

        const response = await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            channel: notification.channelId,
            blocks,
            text: `New feature request: ${notification.taskTitle}`,
          }),
        })
        slackResponse = (await response.json()) as {
          ok: boolean
          ts?: string
          error?: string
        }
      } else if (notification.type === "request_received") {
        const response = await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            channel: notification.channelId,
            thread_ts: notification.threadTs ?? undefined,
            text: `:white_check_mark: Got it — we're on it. Tracking as *${notification.taskCode}*.`,
          }),
        })
        slackResponse = (await response.json()) as {
          ok: boolean
          ts?: string
          error?: string
        }
      } else if (notification.type === "request_shipped") {
        const response = await fetch("https://slack.com/api/chat.postMessage", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            channel: notification.channelId,
            thread_ts: notification.threadTs ?? undefined,
            text: `:rocket: This should be resolved now — shipped in *${notification.taskCode}*.`,
          }),
        })
        slackResponse = (await response.json()) as {
          ok: boolean
          ts?: string
          error?: string
        }
      } else {
        await ctx.runMutation(internal.slack.markSlackNotificationSent, {
          notificationId: notification._id,
          status: "failed",
        })
        return
      }

      if (slackResponse.ok) {
        await ctx.runMutation(internal.slack.markSlackNotificationSent, {
          notificationId: notification._id,
          status: "sent",
          slackMessageTs: slackResponse.ts,
        })
      } else {
        console.error("[slack] Failed to send notification", {
          notificationId: notification._id,
          error: slackResponse.error,
        })
        await ctx.runMutation(internal.slack.markSlackNotificationSent, {
          notificationId: notification._id,
          status: "failed",
        })
      }
    } catch (error) {
      console.error("[slack] Error sending notification", {
        notificationId: notification._id,
        error,
      })
      await ctx.runMutation(internal.slack.markSlackNotificationSent, {
        notificationId: notification._id,
        status: "failed",
      })
    }
  },
})
