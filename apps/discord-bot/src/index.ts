import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { generateObject } from "ai"
import { google } from "@ai-sdk/google"
import { config as loadEnv } from "dotenv"
import { ConvexHttpClient } from "convex/browser"
import { makeFunctionReference } from "convex/server"
import { z } from "zod"
import {
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
const botRoot = path.resolve(__dirname, "..")
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

for (const envPath of [
  path.join(repoRoot, ".env"),
  path.join(repoRoot, ".env.local"),
  path.join(repoRoot, "apps/web/.env"),
  path.join(repoRoot, "apps/web/.env.local"),
  path.join(botRoot, ".env"),
  path.join(botRoot, ".env.local"),
]) {
  if (existsSync(envPath)) {
    loadEnv({ path: envPath, override: true, quiet: true })
  }
}

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
      "Add them to apps/discord-bot/.env.local to enable the bot in monorepo dev.",
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

  await rest.put(Routes.applicationCommands(discordApplicationId), {
    body: [pairCommand.toJSON()],
  })
}

function normalizeMessageContent(content: string) {
  return content.replace(/\s+/g, " ").trim()
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
      return `[${marker}] ${timestamp} ${message.authorUsername}: ${message.content}`
    })
    .join("\n")
}

function formatCreatedAtLabel(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(timestamp)
}

function scheduleFeedbackProcessing(integrationId: string) {
  const existingTimer = processingTimers.get(integrationId)
  if (existingTimer) {
    clearTimeout(existingTimer)
  }

  processingTimers.set(
    integrationId,
    setTimeout(() => {
      processingTimers.delete(integrationId)
      void processFeedbackWindow(integrationId)
    }, 2_000)
  )
}

async function processFeedbackWindow(integrationId: string) {
  if (activeProcessing.has(integrationId)) {
    scheduleFeedbackProcessing(integrationId)
    return
  }

  activeProcessing.add(integrationId)

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

    if (pendingMessages.length === 0) {
      return
    }

    const contextMessages = feedbackWindow.messages.slice(-25)
    const pendingMessageIds = new Set(pendingMessages.map((message) => message.messageId))
    const transcript = formatTranscript(contextMessages, pendingMessageIds)

    const { object: classification } = await generateObject({
      model: google("gemma-3-27b-it"),
      schema: feedbackClassificationSchema,
      system: [
        "You classify Discord conversations for a product team.",
        `The only product that matters is ${feedbackWindow.integration.workspaceName}, also referred to as Median.`,
        "Return isProductFeedback=true only when the newest messages contain concrete product feedback, a bug report, a feature request, workflow friction, or an actionable complaint about the actual product.",
        "Reject off-topic chat, memes, introductions, hiring talk, agency requests, feedback about unrelated tools, and generic conversation that is not about the product itself.",
        "Use the recent context only to interpret what the new messages refer to.",
        "Only include relevantMessageIds from NEW messages.",
      ].join(" "),
      prompt: [
        `Workspace name: ${feedbackWindow.integration.workspaceName}`,
        `Guild: ${feedbackWindow.integration.guildName}`,
        "Conversation transcript:",
        transcript,
      ].join("\n\n"),
    })

    const latestPendingMessage = pendingMessages.at(-1)
    if (!latestPendingMessage) {
      return
    }

    if (!classification.isProductFeedback || classification.relevantMessageIds.length === 0) {
      await convex.mutation(markFeedbackWindowProcessedMutation, {
        botSecret: pairingSecret,
        integrationId,
        lastProcessedMessageId: latestPendingMessage.messageId,
        lastProcessedMessageCreatedAt: latestPendingMessage.messageCreatedAt,
      })
      return
    }

    const relevantMessages = pendingMessages.filter((message) =>
      classification.relevantMessageIds.includes(message.messageId)
    )

    if (relevantMessages.length === 0) {
      await convex.mutation(markFeedbackWindowProcessedMutation, {
        botSecret: pairingSecret,
        integrationId,
        lastProcessedMessageId: latestPendingMessage.messageId,
        lastProcessedMessageCreatedAt: latestPendingMessage.messageCreatedAt,
      })
      return
    }

    const labelsText =
      feedbackWindow.integration.availableLabels.length > 0
        ? feedbackWindow.integration.availableLabels.join(", ")
        : "No predefined labels."

    const { object: extracted } = await generateObject({
      model: "anthropic/claude-haiku-4.5",
      schema: extractedFeedbackTasksSchema,
      system: [
        "You turn product feedback into concise task requests for a task board.",
        `The product is ${feedbackWindow.integration.workspaceName}, also referred to as Median.`,
        "Only create tasks for actionable feedback about the real product. Ignore unrelated discussion.",
        "Return between 0 and 5 tasks.",
        "Each task must be distinct, concrete, and understandable without Discord context.",
        "Descriptions should summarize the user problem and expected outcome in plain text.",
        "Priority may be urgent, high, medium, low, or none.",
        `Allowed labels: ${labelsText}`,
        "Only use labels from the allowed list. Use an empty array when none apply.",
      ].join(" "),
      prompt: [
        `Classifier summary: ${classification.summary ?? classification.reason}`,
        "Relevant feedback messages:",
        relevantMessages
          .map(
            (message) =>
              `- ${new Date(message.messageCreatedAt).toISOString()} ${message.authorUsername}: ${message.content}`
          )
          .join("\n"),
      ].join("\n\n"),
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
    }

    await convex.mutation(markFeedbackWindowProcessedMutation, {
      botSecret: pairingSecret,
      integrationId,
      lastProcessedMessageId: latestPendingMessage.messageId,
      lastProcessedMessageCreatedAt: latestPendingMessage.messageCreatedAt,
    })
  } catch (error) {
    console.error(`Failed to process Discord feedback for integration ${integrationId}`, error)
  } finally {
    activeProcessing.delete(integrationId)
  }
}

client.once(Events.ClientReady, async (readyClient) => {
  await registerCommands()
  console.log(`Discord bot ready as ${readyClient.user.tag}`)
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
      channelId: interaction.channelId ?? undefined,
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
  } catch (error) {
    console.error("Failed to issue pairing code", error)
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
    return
  }

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
      return
    }

    scheduleFeedbackProcessing(result.integration.integrationId)
  } catch (error) {
    console.error("Failed to record Discord message", error)
  }
})

void client.login(discordToken)
