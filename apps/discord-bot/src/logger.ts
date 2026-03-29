import { Axiom } from "@axiomhq/js"
import { Logger, AxiomJSTransport, ConsoleTransport } from "@axiomhq/logging"

const token = process.env.AXIOM_TOKEN
const dataset = process.env.AXIOM_DATASET ?? "median"

function createLogger() {
  if (!token) {
    console.warn("[discord-bot] AXIOM_TOKEN not set — logging to console only")
    return new Logger({
      transports: [new ConsoleTransport({ prettyPrint: true })],
      args: { service: "median-discord-bot" },
    })
  }

  const axiom = new Axiom({ token })

  return new Logger({
    transports: [
      new AxiomJSTransport({ axiom, dataset }),
      new ConsoleTransport({ prettyPrint: true }),
    ],
    args: { service: "median-discord-bot" },
  })
}

export const logger = createLogger()
