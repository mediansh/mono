import path from "node:path"
import { fileURLToPath } from "node:url"
import { config as loadEnv } from "dotenv"
import { ConvexHttpClient } from "convex/browser"
import { makeFunctionReference } from "convex/server"
import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  InteractionContextType,
  Message,
  MessageFlags,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js"
import { logger } from "./logger.js"
import { captureBot, flushPostHog } from "./posthog.js"

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
    channelName?: string
    parentChannelId?: string
    parentChannelName?: string
    threadId?: string
    threadTitle?: string
    forumChannelId?: string
    forumTitle?: string
    messageId: string
    authorId: string
    authorUsername: string
    authorHasAdminPrivileges: boolean
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

loadEnv({
  path: path.join(repoRoot, ".env.local"),
  override: true,
  quiet: true,
})
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
  process.env.NEXT_PUBLIC_CONVEX_URL ??
  process.env.CONVEX_URL ??
  getEnv("NEXT_PUBLIC_CONVEX_URL")

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
  .setDescription(
    "Generate a pairing code to connect this Discord server to Median."
  )
  .setContexts(InteractionContextType.Guild)

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(discordToken)

  logger.info("Registering slash commands", {
    scope: "startup",
    applicationId: discordApplicationId,
    commands: [pairCommand.name],
  })

  await rest.put(Routes.applicationCommands(discordApplicationId), {
    body: [pairCommand.toJSON()],
  })

  logger.info("Slash commands registered", { scope: "startup" })
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

function getMessageChannelContext(message: Message) {
  const channelName =
    "name" in message.channel && typeof message.channel.name === "string"
      ? message.channel.name
      : undefined

  if (!message.channel.isThread()) {
    return {
      channelName,
      parentChannelId: undefined,
      parentChannelName: undefined,
      threadId: undefined,
      threadTitle: undefined,
      forumChannelId: undefined,
      forumTitle: undefined,
    }
  }

  const parentChannel = message.channel.parent
  const parentChannelName =
    parentChannel &&
    "name" in parentChannel &&
    typeof parentChannel.name === "string"
      ? parentChannel.name
      : undefined
  const isForumPost = parentChannel?.type === ChannelType.GuildForum

  return {
    channelName,
    parentChannelId: parentChannel?.id,
    parentChannelName,
    threadId: message.channel.id,
    threadTitle: message.channel.name,
    forumChannelId: isForumPost ? parentChannel.id : undefined,
    forumTitle: isForumPost ? parentChannel.name : undefined,
  }
}

function hasAdminPrivileges(message: Message) {
  return (
    message.member?.permissions?.has(PermissionFlagsBits.Administrator) ??
    false
  )
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

    captureBot("guild_channels_synced", {
      guild_id: guildId,
      guild_name: guild.name,
      channel_count: textChannels.length,
    })
    logger.info("Synced guild channels to Convex", {
      scope: "sync",
      guildId,
      guildName: guild.name,
      channelCount: textChannels.length,
    })
  } catch (error) {
    logger.error("Failed to sync guild channels", {
      scope: "sync",
      guildId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function syncAllGuildChannels() {
  for (const [guildId] of client.guilds.cache) {
    await syncGuildChannelsToConvex(guildId)
  }
}

async function processPendingNotifications() {
  try {
    const notifications = await convex.query(
      getAllPendingDiscordNotificationsQuery,
      {
        botSecret: pairingSecret,
        limit: 20,
      }
    )

    if (notifications.length === 0) return

    logger.info("Processing pending notifications", {
      scope: "responder",
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

        captureBot("notification_sent", {
          notification_type: notification.type,
          task_code: notification.taskCode,
          channel_id: notification.channelId,
        })
        logger.info("Sent Discord notification", {
          scope: "responder",
          notificationId: notification._id,
          type: notification.type,
          taskCode: notification.taskCode,
        })
      } catch (notifError) {
        logger.error("Failed to send notification", {
          scope: "responder",
          notificationId: notification._id,
          error: notifError instanceof Error ? notifError.message : String(notifError),
        })
        await convex
          .mutation(markDiscordNotificationSentMutation, {
            botSecret: pairingSecret,
            notificationId: notification._id,
            status: "failed",
          })
          .catch(() => {})
      }
    }
  } catch (error) {
    logger.error("Failed to poll pending notifications", {
      scope: "responder",
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function startNotificationPolling() {
  setInterval(() => {
    void processPendingNotifications()
  }, 10_000)
  logger.info("Notification polling started", { scope: "responder", intervalMs: 10_000 })
}

client.once(Events.ClientReady, async (readyClient) => {
  await registerCommands()
  startNotificationPolling()

  // Sync guild channels on startup and periodically (every 5 minutes)
  void syncAllGuildChannels()
  setInterval(
    () => {
      void syncAllGuildChannels()
    },
    5 * 60 * 1000
  )

  captureBot("bot_started", {
    bot_tag: readyClient.user.tag,
    guild_count: readyClient.guilds.cache.size,
  })

  logger.info("Discord bot ready", {
    scope: "startup",
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
    captureBot("pairing_code_issued", {
      guild_id: interaction.guildId,
      guild_name: interaction.guild.name,
      issued_by: interaction.user.username,
    })
    logger.info("Issued pairing code", {
      scope: "pair",
      guildId: interaction.guildId,
      guildName: interaction.guild.name,
      channelId: interaction.channelId ?? null,
      issuedBy: interaction.user.username,
      expiresAt,
    })
  } catch (error) {
    logger.error("Failed to issue pairing code", {
      scope: "pair",
      guildId: interaction.guildId,
      guildName: interaction.guild?.name ?? null,
      error: error instanceof Error ? error.message : String(error),
    })
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content:
        "Could not generate a pairing code. Check the bot environment and try again.",
    })
  }
})

client.on(Events.MessageCreate, async (message: Message) => {
  if (message.author.bot || !message.inGuild() || !message.guildId) {
    return
  }

  const content = normalizeMessageContent(message.content)
  const channelContext = getMessageChannelContext(message)
  const authorHasAdminPrivileges = hasAdminPrivileges(message)
  const hasChannelContext = Boolean(
    channelContext.threadTitle || channelContext.forumTitle
  )

  if (!content && !hasChannelContext) {
    logger.info("Ignoring empty message", {
      scope: "message",
      guildId: message.guildId,
      channelId: message.channelId,
      messageId: message.id,
      author: message.author.username,
    })
    return
  }

  logger.info("Received Discord message", {
    scope: "message",
    guildId: message.guildId,
    channelId: message.channelId,
    messageId: message.id,
    threadId: channelContext.threadId ?? null,
    threadTitle: channelContext.threadTitle ?? null,
    forumChannelId: channelContext.forumChannelId ?? null,
    forumTitle: channelContext.forumTitle ?? null,
    author: message.author.username,
    authorHasAdminPrivileges,
    preview: summarizeText(
      content || channelContext.threadTitle || channelContext.forumTitle || ""
    ),
  })

  try {
    const result = await convex.mutation(recordInboundMessageMutation, {
      botSecret: pairingSecret,
      guildId: message.guildId,
      channelId: message.channelId,
      channelName: channelContext.channelName,
      parentChannelId: channelContext.parentChannelId,
      parentChannelName: channelContext.parentChannelName,
      threadId: channelContext.threadId,
      threadTitle: channelContext.threadTitle,
      forumChannelId: channelContext.forumChannelId,
      forumTitle: channelContext.forumTitle,
      messageId: message.id,
      authorId: message.author.id,
      authorUsername: message.author.username,
      authorHasAdminPrivileges,
      content,
      messageCreatedAt: message.createdTimestamp,
    })

    if (!result.accepted || !result.integration) {
      logger.info("Message was not accepted for processing", {
        scope: "message",
        guildId: message.guildId,
        channelId: message.channelId,
        messageId: message.id,
        duplicate: result.duplicate,
      })
      return
    }

    captureBot("message_ingested", {
      guild_id: message.guildId,
      channel_id: message.channelId,
      workspace_id: result.integration.workspaceId,
      content_length: content.length,
    })
    logger.info("Stored message and resolved integration", {
      scope: "message",
      guildId: message.guildId,
      channelId: message.channelId,
      messageId: message.id,
      integrationId: result.integration.integrationId,
      workspaceId: result.integration.workspaceId,
      guildName: result.integration.guildName,
      authorHasAdminPrivileges,
      threadTitle: channelContext.threadTitle ?? null,
      forumTitle: channelContext.forumTitle ?? null,
    })
  } catch (error) {
    logger.error("Failed to record Discord message", {
      scope: "message",
      guildId: message.guildId,
      channelId: message.channelId,
      messageId: message.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

process.on("SIGINT", async () => {
  logger.info("Shutting down", { scope: "lifecycle" })
  await Promise.all([logger.flush(), flushPostHog()])
  client.destroy()
  process.exit(0)
})

process.on("SIGTERM", async () => {
  logger.info("Shutting down", { scope: "lifecycle" })
  await Promise.all([logger.flush(), flushPostHog()])
  client.destroy()
  process.exit(0)
})

void client.login(discordToken)
