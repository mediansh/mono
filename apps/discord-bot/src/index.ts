import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { config as loadEnv } from "dotenv"
import { ConvexHttpClient } from "convex/browser"
import { makeFunctionReference } from "convex/server"
import {
  Client,
  Events,
  GatewayIntentBits,
  InteractionContextType,
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
  intents: [GatewayIntentBits.Guilds],
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

void client.login(discordToken)
