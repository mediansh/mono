import path from "node:path"
import { fileURLToPath } from "node:url"
import { generateText, Output } from "ai"
import { google } from "@ai-sdk/google"
import { config as loadEnv } from "dotenv"
import { ConvexHttpClient } from "convex/browser"
import { makeFunctionReference } from "convex/server"
import { z } from "zod"
import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  InteractionContextType,
  Message,
  MessageFlags,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "../../..")
const issuePairingCodeMutation = makeFunctionReference<
  "mutation",
  {
    botSecret: string
    guildId: string
    guildName: string
    channelId?: string
    issuedByDiscordUserId: string
    issuedByDiscordUsername?: string
  },
  {
    code: string
    expiresAt: number
  }
>("discord:issuePairingCode")
const recordInboundMessageMutation = makeFunctionReference<
  "mutation",
  {
    botSecret: string
    guildId: string
    channelId: string
    messageId: string
    authorId: string
    authorUsername: string
    content: string
    messageCreatedAt: number
  },
  {
    accepted: boolean
    duplicate: boolean
    integration: {
      integrationId: string
      workspaceId: string
      channelId: string
      guildName: string
    } | null
  }
>("discord:recordInboundMessage")
const getPendingFeedbackWindowQuery = makeFunctionReference<
  "query",
  {
    botSecret: string
    integrationId: string
    limit?: number
  },
  {
    integration: {
      integrationId: string
      workspaceId: string
      workspaceName: string
      availableLabels: string[]
      guildId: string
      guildName: string
      channelId: string | null
      lastProcessedMessageId: string | null
      lastProcessedMessageCreatedAt: number | null
      additionalContext: string | null
      respondForMe: boolean
      respondForMeMode: "off" | "all" | "specific"
      respondForMeChannelIds: string[]
    }
    messages: {
      _id: string
      messageId: string
      authorUsername: string
      content: string
      permalink: string
      messageCreatedAt: number
    }[]
  }
>("discord:getPendingFeedbackWindow")
const markFeedbackWindowProcessedMutation = makeFunctionReference<
  "mutation",
  {
    botSecret: string
    integrationId: string
    lastProcessedMessageId: string
    lastProcessedMessageCreatedAt: number
  },
  null
>("discord:markFeedbackWindowProcessed")
const createTasksFromDiscordFeedbackMutation = makeFunctionReference<
  "mutation",
  {
    botSecret: string
    workspaceId: string
    tasks: {
      title: string
      description?: string
      status: "requests" | "todo" | "in_progress" | "ready" | "shipped" | "archive"
      priority: "urgent" | "high" | "medium" | "low" | "none"
      labels: string[]
      source?: {
        platform: "discord" | "slack" | "x"
        url: string
        author: string
      }
      createdAtLabel?: string
    }[]
  },
  {
    _id: string
  }[]
>("tasks:createTasksFromDiscordFeedback")
const getAllPendingDiscordNotificationsQuery = makeFunctionReference<
  "query",
  {
    botSecret: string
    limit?: number
  },
  {
    _id: string
    type: "request_received" | "request_shipped"
    channelId: string
    replyToMessageId: string | null
    taskTitle: string
    taskCode: string
  }[]
>("discord:getAllPendingDiscordNotifications")
const markDiscordNotificationSentMutation = makeFunctionReference<
  "mutation",
  {
    botSecret: string
    notificationId: string
    status: "sent" | "failed"
  },
  null
>("discord:markDiscordNotificationSent")
const syncGuildChannelsMutation = makeFunctionReference<
  "mutation",
  {
    botSecret: string
    guildId: string
    channels: {
      id: string
      name: string
      type: number
      parentName?: string
    }[]
  },
  null
>("discord:syncGuildChannels")
const getTaskSnapshotForDiscordQuery = makeFunctionReference<
  "query",
  {
    botSecret: string
    workspaceId: string
    limit?: number
  },
  {
    taskId: string
    taskCode: string
    title: string
    description: string | null
    status: "requests" | "todo" | "in_progress" | "ready" | "shipped" | "archive"
    priority: "urgent" | "high" | "medium" | "low" | "none"
    labels: string[]
    sourceUrl: string | null
  }[]
>("tasks:getTaskSnapshotForDiscord")

const feedbackClassificationSchema = z.object({
  isProductFeedback: z.boolean(),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1).nullable(),
  reason: z.string().min(1),
  relevantMessageIds: z.array(z.string()).max(25),
})

const extractedFeedbackTasksSchema = z.object({
  tasks: z
    .array(
      z.object({
        title: z.string().min(1).max(140),
        description: z.string().max(2000).nullable(),
        priority: z.enum(["urgent", "high", "medium", "low", "none"]).nullable(),
        labels: z.array(z.string()).max(5),
      })
    )
    .max(5),
})

const processingTimers = new Map<string, NodeJS.Timeout>()
const activeProcessing = new Set<string>()

globalThis.AI_SDK_LOG_WARNINGS = false

loadEnv({ path: path.join(repoRoot, ".env.local"), override: true, quiet: true })
loadEnv({ path: path.join(repoRoot, ".env"), override: false, quiet: true })

function getEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

const missingDiscordEnv = [
  "DISCORD_BOT_TOKEN",
  "DISCORD_APPLICATION_ID",
  "DISCORD_PAIRING_SECRET",
  "AI_GATEWAY_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
].filter((name) => !process.env[name])

if (missingDiscordEnv.length > 0) {
  console.warn(
    [
      "Discord bot is disabled.",
      `Missing env: ${missingDiscordEnv.join(", ")}.`,
      "Add them to the repo root .env.local to enable the bot.",
    ].join(" ")
  )
  process.stdin.resume()
  await new Promise(() => {})
}

const discordToken = getEnv("DISCORD_BOT_TOKEN")
const discordApplicationId = getEnv("DISCORD_APPLICATION_ID")
const pairingSecret = getEnv("DISCORD_PAIRING_SECRET")
const convexUrl =
  process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL ?? getEnv("NEXT_PUBLIC_CONVEX_URL")

const convex = new ConvexHttpClient(convexUrl)

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
})

const pairCommand = new SlashCommandBuilder()
  .setName("pair")
  .setDescription("Generate a pairing code to connect this Discord server to Median.")
  .setContexts(InteractionContextType.Guild)

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(discordToken)

  logInfo("startup", "Registering slash commands", {
    applicationId: discordApplicationId,
    commands: [pairCommand.name],
  })

  await rest.put(Routes.applicationCommands(discordApplicationId), {
    body: [pairCommand.toJSON()],
  })

  logInfo("startup", "Slash commands registered")
}

function normalizeMessageContent(content: string) {
  return content.replace(/\s+/g, " ").trim()
}

function summarizeText(text: string, limit = 120) {
  if (text.length <= limit) {
    return text
  }

  return `${text.slice(0, limit - 1)}...`
}

function formatCursor(cursor: { messageId: string | null; messageCreatedAt: number | null }) {
  if (!cursor.messageId || !cursor.messageCreatedAt) {
    return "none"
  }

  return `${cursor.messageId}@${new Date(cursor.messageCreatedAt).toISOString()}`
}

function normalizeDiscordId(id: string) {
  return id.trim().replace(/\D/g, "")
}

function logInfo(scope: string, message: string, details?: Record<string, unknown>) {
  if (details) {
    console.log(`[discord-bot:${scope}] ${message}`, details)
    return
  }

  console.log(`[discord-bot:${scope}] ${message}`)
}

function logError(scope: string, message: string, error: unknown, details?: Record<string, unknown>) {
  if (details) {
    console.error(`[discord-bot:${scope}] ${message}`, details, error)
    return
  }

  console.error(`[discord-bot:${scope}] ${message}`, error)
}

function isMessageAfterCursor(
  message: { messageId: string; messageCreatedAt: number },
  cursor: { messageId: string | null; messageCreatedAt: number | null }
) {
  if (cursor.messageCreatedAt === null || cursor.messageId === null) {
    return true
  }

  if (message.messageCreatedAt > cursor.messageCreatedAt) {
    return true
  }

  if (message.messageCreatedAt < cursor.messageCreatedAt) {
    return false
  }

  return BigInt(message.messageId) > BigInt(cursor.messageId)
}

function formatTranscript(
  messages: {
    messageId: string
    authorUsername: string
    content: string
    messageCreatedAt: number
  }[],
  pendingMessageIds: Set<string>
) {
  return messages
    .map((message) => {
      const timestamp = new Date(message.messageCreatedAt).toISOString()
      const marker = pendingMessageIds.has(message.messageId) ? "NEW" : "CONTEXT"
      return `[${marker}] [id:${message.messageId}] ${timestamp} ${message.authorUsername}: ${message.content}`
    })
    .join("\n")
}

function formatCreatedAtLabel(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(timestamp)
}

function extractJsonObject(text: string) {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model did not return a JSON object.")
  }

  return text.slice(start, end + 1)
}

function formatExistingTasks(
  tasks: {
    taskCode: string
    title: string
    description: string | null
    status: "requests" | "todo" | "in_progress" | "ready" | "shipped" | "archive"
    priority: "urgent" | "high" | "medium" | "low" | "none"
    labels: string[]
  }[]
) {
  if (tasks.length === 0) {
    return "No existing tasks."
  }

  return tasks
    .map((task) =>
      [
        `${task.taskCode} | ${task.status} | ${task.priority} | ${task.title}`,
        task.labels.length > 0 ? `labels: ${task.labels.join(", ")}` : null,
        task.description ? `description: ${task.description}` : null,
      ]
        .filter(Boolean)
        .join(" | ")
    )
    .join("\n")
}

function shouldRespondInChannel(
  integration: {
    respondForMe: boolean
    respondForMeMode: "off" | "all" | "specific"
    respondForMeChannelIds: string[]
  },
  channelId: string
): boolean {
  const mode = integration.respondForMeMode
  if (mode === "off") return false
  if (mode === "all") return true
  if (mode === "specific") return integration.respondForMeChannelIds.includes(channelId)
  // Legacy fallback: old boolean field
  return integration.respondForMe
}

async function syncGuildChannelsToConvex(guildId: string) {
  try {
    const guild = client.guilds.cache.get(guildId)
    if (!guild) return

    // Fetch all channels and filter to text-based ones
    const allChannels = await guild.channels.fetch()
    const textChannels = allChannels
      .filter(
        (ch) =>
          ch !== null &&
          (ch.type === ChannelType.GuildText ||
            ch.type === ChannelType.GuildAnnouncement ||
            ch.type === ChannelType.GuildForum)
      )
      .map((ch) => ({
        id: ch!.id,
        name: ch!.name,
        type: ch!.type,
        parentName: ch!.parent?.name ?? undefined,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    await convex.mutation(syncGuildChannelsMutation, {
      botSecret: pairingSecret,
      guildId,
      channels: textChannels,
    })

    logInfo("sync", "Synced guild channels to Convex", {
      guildId,
      guildName: guild.name,
      channelCount: textChannels.length,
    })
  } catch (error) {
    logError("sync", "Failed to sync guild channels", error, { guildId })
  }
}

async function syncAllGuildChannels() {
  for (const [guildId] of client.guilds.cache) {
    await syncGuildChannelsToConvex(guildId)
  }
}

function scheduleFeedbackProcessing(integrationId: string) {
  const existingTimer = processingTimers.get(integrationId)
  if (existingTimer) {
    clearTimeout(existingTimer)
    logInfo("debounce", "Reset feedback processing timer", { integrationId, waitMs: 2000 })
  } else {
    logInfo("debounce", "Scheduled feedback processing timer", { integrationId, waitMs: 2000 })
  }

  processingTimers.set(
    integrationId,
    setTimeout(() => {
      processingTimers.delete(integrationId)
      logInfo("debounce", "Feedback processing timer fired", { integrationId })
      void processFeedbackWindow(integrationId)
    }, 2_000)
  )
}

async function processFeedbackWindow(integrationId: string) {
  if (activeProcessing.has(integrationId)) {
    logInfo("processor", "Processing already active; re-queueing window", { integrationId })
    scheduleFeedbackProcessing(integrationId)
    return
  }

  activeProcessing.add(integrationId)
  logInfo("processor", "Starting feedback window processing", { integrationId })

  try {
    const feedbackWindow = await convex.query(getPendingFeedbackWindowQuery, {
      botSecret: pairingSecret,
      integrationId,
      limit: 100,
    })

    const pendingMessages = feedbackWindow.messages.filter((message) =>
      isMessageAfterCursor(message, {
        messageId: feedbackWindow.integration.lastProcessedMessageId,
        messageCreatedAt: feedbackWindow.integration.lastProcessedMessageCreatedAt,
      })
    )

    logInfo("processor", "Loaded feedback window", {
      integrationId,
      workspaceId: feedbackWindow.integration.workspaceId,
      workspaceName: feedbackWindow.integration.workspaceName,
      totalMessages: feedbackWindow.messages.length,
      pendingMessages: pendingMessages.length,
      cursor: formatCursor({
        messageId: feedbackWindow.integration.lastProcessedMessageId,
        messageCreatedAt: feedbackWindow.integration.lastProcessedMessageCreatedAt,
      }),
    })

    if (pendingMessages.length === 0) {
      logInfo("processor", "No pending messages to process", { integrationId })
      return
    }

    const contextMessages = feedbackWindow.messages.slice(-25)
    const pendingMessageIds = new Set(pendingMessages.map((message) => message.messageId))
    const transcript = formatTranscript(contextMessages, pendingMessageIds)

    const classifierSystemParts = [
        "You classify Discord conversations for a product team.",
        `The only product that matters is ${feedbackWindow.integration.workspaceName}, also referred to as Median.`,
        "Return isProductFeedback=true only when the newest messages contain concrete product feedback, a bug report, a feature request, workflow friction, or an actionable complaint about the actual product.",
        "Reject off-topic chat, memes, introductions, hiring talk, agency requests, feedback about unrelated tools, and generic conversation that is not about the product itself.",
        "Use the recent context only to interpret what the new messages refer to.",
        "Only include relevantMessageIds from NEW messages.",
        "Each message has an [id:XXXXXXX] tag. Use the numeric ID from that tag as the relevantMessageId, NOT the timestamp.",
        "Return valid JSON only. No markdown. No code fences. No commentary.",
        'Use this exact JSON shape: {"isProductFeedback":false,"confidence":0.0,"summary":null,"reason":"...","relevantMessageIds":["123456789"]}',
      ]

    if (feedbackWindow.integration.additionalContext) {
      classifierSystemParts.push(
        `Additional product context from the workspace owner: ${feedbackWindow.integration.additionalContext}`
      )
    }

    const { text: classificationText } = await generateText({
      model: google("gemma-3-27b-it"),
      system: classifierSystemParts.join(" "),
      prompt: [
        `Workspace name: ${feedbackWindow.integration.workspaceName}`,
        `Guild: ${feedbackWindow.integration.guildName}`,
        "Conversation transcript:",
        transcript,
      ].join("\n\n"),
    })

    const classification = feedbackClassificationSchema.parse(
      JSON.parse(extractJsonObject(classificationText))
    )

    const latestPendingMessage = pendingMessages.at(-1)
    if (!latestPendingMessage) {
      return
    }

    logInfo("classifier", "Gemma classification complete", {
      integrationId,
      isProductFeedback: classification.isProductFeedback,
      confidence: classification.confidence,
      relevantMessageCount: classification.relevantMessageIds.length,
      summary: classification.summary ?? null,
      reason: classification.reason,
    })

    if (!classification.isProductFeedback || classification.relevantMessageIds.length === 0) {
      await convex.mutation(markFeedbackWindowProcessedMutation, {
        botSecret: pairingSecret,
        integrationId,
        lastProcessedMessageId: latestPendingMessage.messageId,
        lastProcessedMessageCreatedAt: latestPendingMessage.messageCreatedAt,
      })
      logInfo("processor", "Window marked processed with no actionable product feedback", {
        integrationId,
        lastProcessedMessageId: latestPendingMessage.messageId,
      })
      return
    }

    const normalizedRelevantIds = new Set(
      classification.relevantMessageIds.map((messageId) => normalizeDiscordId(messageId)).filter(Boolean)
    )

    const matchedRelevantMessages = pendingMessages.filter((message) =>
      normalizedRelevantIds.has(normalizeDiscordId(message.messageId))
    )

    const relevantMessages =
      matchedRelevantMessages.length > 0 ? matchedRelevantMessages : pendingMessages

    if (matchedRelevantMessages.length === 0) {
      logInfo("classifier", "Classifier IDs did not match pending messages; falling back to all pending messages", {
        integrationId,
        classifierRelevantMessageIds: classification.relevantMessageIds,
        pendingMessageIds: pendingMessages.map((message) => message.messageId),
      })
    }

    logInfo("classifier", "Relevant feedback messages selected", {
      integrationId,
      relevantMessageIds: relevantMessages.map((message) => message.messageId),
      authors: Array.from(new Set(relevantMessages.map((message) => message.authorUsername))),
    })

    const labelsText =
      feedbackWindow.integration.availableLabels.length > 0
        ? feedbackWindow.integration.availableLabels.join(", ")
        : "No predefined labels."

    const existingTasks = await convex.query(getTaskSnapshotForDiscordQuery, {
      botSecret: pairingSecret,
      workspaceId: feedbackWindow.integration.workspaceId,
      limit: 50,
    })

    logInfo("taskboard", "Loaded existing task context for duplicate detection", {
      integrationId,
      workspaceId: feedbackWindow.integration.workspaceId,
      existingTaskCount: existingTasks.length,
    })

    const extractorSystemParts = [
        "You turn product feedback into concise task requests for a task board.",
        `The product is ${feedbackWindow.integration.workspaceName}, also referred to as Median.`,
        "Only create tasks for actionable feedback about the real product. Ignore unrelated discussion.",
        "Return between 0 and 5 tasks.",
        "Each task must be distinct, concrete, and understandable without Discord context.",
        "You will be given existing tasks from the board. Only skip creating a task if an existing task describes the EXACT same specific issue — same error message, same feature, same broken flow.",
        "Different error messages, different symptoms, or different contexts should each get their own task even if they relate to the same general area.",
        "When in doubt, create the task. It is better to create a near-duplicate than to lose real user feedback.",
        "Descriptions should summarize the user problem and expected outcome in plain text.",
        "Priority may be urgent, high, medium, low, or none.",
        `Allowed labels: ${labelsText}`,
        "Only use labels from the allowed list. Use an empty array when none apply.",
      ]

    if (feedbackWindow.integration.additionalContext) {
      extractorSystemParts.push(
        `Additional product context from the workspace owner: ${feedbackWindow.integration.additionalContext}`
      )
    }

    const { output: extracted } = await generateText({
      model: "anthropic/claude-haiku-4.5",
      output: Output.object({ schema: extractedFeedbackTasksSchema }),
      system: extractorSystemParts.join(" "),
      prompt: [
        `Classifier summary: ${classification.summary ?? classification.reason}`,
        "Existing task context:",
        formatExistingTasks(existingTasks),
        "Relevant feedback messages:",
        relevantMessages
          .map(
            (message) =>
              `- ${new Date(message.messageCreatedAt).toISOString()} ${message.authorUsername}: ${message.content}`
          )
          .join("\n"),
      ].join("\n\n"),
    })

    if (!extracted) {
      logInfo("extractor", "Claude returned no structured output", { integrationId })
      await convex.mutation(markFeedbackWindowProcessedMutation, {
        botSecret: pairingSecret,
        integrationId,
        lastProcessedMessageId: latestPendingMessage.messageId,
        lastProcessedMessageCreatedAt: latestPendingMessage.messageCreatedAt,
      })
      return
    }

    logInfo("extractor", "Claude extracted tasks from feedback", {
      integrationId,
      taskCount: extracted.tasks.length,
      taskTitles: extracted.tasks.map((task) => task.title),
    })

    if (extracted.tasks.length > 0) {
      const authors = Array.from(new Set(relevantMessages.map((message) => message.authorUsername)))
      const sourceUrl = relevantMessages[relevantMessages.length - 1]?.permalink
      const createdAtLabel = formatCreatedAtLabel(latestPendingMessage.messageCreatedAt)

      await convex.mutation(createTasksFromDiscordFeedbackMutation, {
        botSecret: pairingSecret,
        workspaceId: feedbackWindow.integration.workspaceId,
        tasks: extracted.tasks.map((task) => ({
          title: task.title,
          description: task.description ?? undefined,
          status: "requests" as const,
          priority: task.priority ?? "none",
          labels: task.labels.filter((label) =>
            feedbackWindow.integration.availableLabels.includes(label)
          ),
          source: sourceUrl
            ? {
                platform: "discord" as const,
                url: sourceUrl,
                author: authors.join(", "),
              }
            : undefined,
          createdAtLabel,
        })),
      })

      logInfo("taskboard", "Created Discord feedback tasks", {
        integrationId,
        workspaceId: feedbackWindow.integration.workspaceId,
        createdTaskCount: extracted.tasks.length,
        sourceUrl,
      })

    } else {
      logInfo("extractor", "Claude returned no tasks for this feedback window", { integrationId })
    }

    await convex.mutation(markFeedbackWindowProcessedMutation, {
      botSecret: pairingSecret,
      integrationId,
      lastProcessedMessageId: latestPendingMessage.messageId,
      lastProcessedMessageCreatedAt: latestPendingMessage.messageCreatedAt,
    })
    logInfo("processor", "Advanced integration cursor after processing", {
      integrationId,
      lastProcessedMessageId: latestPendingMessage.messageId,
    })
  } catch (error) {
    logError("processor", "Failed to process Discord feedback window", error, { integrationId })
  } finally {
    activeProcessing.delete(integrationId)
    logInfo("processor", "Finished feedback window processing", { integrationId })
  }
}

async function processPendingNotifications() {
  try {
    const notifications = await convex.query(getAllPendingDiscordNotificationsQuery, {
      botSecret: pairingSecret,
      limit: 20,
    })

    if (notifications.length === 0) return

    logInfo("responder", "Processing pending notifications", {
      count: notifications.length,
    })

    for (const notification of notifications) {
      try {
        const channel = await client.channels.fetch(notification.channelId)
        if (!channel || !channel.isTextBased() || !("send" in channel)) {
          await convex.mutation(markDiscordNotificationSentMutation, {
            botSecret: pairingSecret,
            notificationId: notification._id,
            status: "failed",
          })
          continue
        }

        const replyOptions: Record<string, unknown> = {}
        if (notification.replyToMessageId) {
          replyOptions.reply = {
            messageReference: notification.replyToMessageId,
            failIfNotExists: false,
          }
        }

        if (notification.type === "request_shipped") {
          await channel.send({
            content: `This should be resolved now — shipped in **${notification.taskCode}**.`,
            ...replyOptions,
          })
        } else if (notification.type === "request_received") {
          await channel.send({
            content: `Got it, we're on it.`,
            ...replyOptions,
          })
        }

        await convex.mutation(markDiscordNotificationSentMutation, {
          botSecret: pairingSecret,
          notificationId: notification._id,
          status: "sent",
        })

        logInfo("responder", "Sent Discord notification", {
          notificationId: notification._id,
          type: notification.type,
          taskCode: notification.taskCode,
        })
      } catch (notifError) {
        logError("responder", "Failed to send notification", notifError, {
          notificationId: notification._id,
        })
        await convex.mutation(markDiscordNotificationSentMutation, {
          botSecret: pairingSecret,
          notificationId: notification._id,
          status: "failed",
        }).catch(() => {})
      }
    }
  } catch (error) {
    logError("responder", "Failed to poll pending notifications", error)
  }
}

function startNotificationPolling() {
  setInterval(() => {
    void processPendingNotifications()
  }, 10_000)
  logInfo("responder", "Notification polling started", { intervalMs: 10_000 })
}

client.once(Events.ClientReady, async (readyClient) => {
  await registerCommands()
  startNotificationPolling()

  // Sync guild channels on startup and periodically (every 5 minutes)
  void syncAllGuildChannels()
  setInterval(() => {
    void syncAllGuildChannels()
  }, 5 * 60 * 1000)

  logInfo("startup", "Discord bot ready", {
    botTag: readyClient.user.tag,
    applicationId: discordApplicationId,
    convexUrl,
    guildCount: readyClient.guilds.cache.size,
  })
})

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "pair") {
    return
  }

  if (!interaction.inGuild() || !interaction.guildId || !interaction.guild) {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: "Run `/pair` inside the Discord server you want to connect.",
    })
    return
  }

  try {
    const result = await convex.mutation(issuePairingCodeMutation, {
      botSecret: pairingSecret,
      guildId: interaction.guildId,
      guildName: interaction.guild.name,
      issuedByDiscordUserId: interaction.user.id,
      issuedByDiscordUsername: interaction.user.username,
    })

    const expiresAt = Math.floor(result.expiresAt / 1000)

    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: [
        `Pairing code for **${interaction.guild.name}**: \`${result.code}\``,
        `Open Median, go to Discord integrations, and enter it before <t:${expiresAt}:R>.`,
      ].join("\n"),
    })
    logInfo("pair", "Issued pairing code", {
      guildId: interaction.guildId,
      guildName: interaction.guild.name,
      channelId: interaction.channelId ?? null,
      issuedBy: interaction.user.username,
      expiresAt,
    })
  } catch (error) {
    logError("pair", "Failed to issue pairing code", error, {
      guildId: interaction.guildId,
      guildName: interaction.guild?.name ?? null,
    })
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: "Could not generate a pairing code. Check the bot environment and try again.",
    })
  }
})

client.on(Events.MessageCreate, async (message: Message) => {
  if (message.author.bot || !message.inGuild() || !message.guildId) {
    return
  }

  const content = normalizeMessageContent(message.content)
  if (!content) {
    logInfo("message", "Ignoring empty message", {
      guildId: message.guildId,
      channelId: message.channelId,
      messageId: message.id,
      author: message.author.username,
    })
    return
  }

  logInfo("message", "Received Discord message", {
    guildId: message.guildId,
    channelId: message.channelId,
    messageId: message.id,
    author: message.author.username,
    preview: summarizeText(content),
  })

  try {
    const result = await convex.mutation(recordInboundMessageMutation, {
      botSecret: pairingSecret,
      guildId: message.guildId,
      channelId: message.channelId,
      messageId: message.id,
      authorId: message.author.id,
      authorUsername: message.author.username,
      content,
      messageCreatedAt: message.createdTimestamp,
    })

    if (!result.accepted || !result.integration) {
      logInfo("message", "Message was not accepted for processing", {
        guildId: message.guildId,
        channelId: message.channelId,
        messageId: message.id,
        duplicate: result.duplicate,
      })
      return
    }

    logInfo("message", "Stored message and resolved integration", {
      guildId: message.guildId,
      channelId: message.channelId,
      messageId: message.id,
      integrationId: result.integration.integrationId,
      workspaceId: result.integration.workspaceId,
      guildName: result.integration.guildName,
    })

    scheduleFeedbackProcessing(result.integration.integrationId)
  } catch (error) {
    logError("message", "Failed to record Discord message", error, {
      guildId: message.guildId,
      channelId: message.channelId,
      messageId: message.id,
    })
  }
})

void client.login(discordToken)
