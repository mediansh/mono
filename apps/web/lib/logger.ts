import { Axiom } from "@axiomhq/js"
import { Logger, ConsoleTransport, AxiomJSTransport } from "@axiomhq/logging"
import { nextJsFormatters } from "@axiomhq/nextjs"
import { createAxiomRouteHandler } from "@axiomhq/nextjs"

const token = process.env.AXIOM_TOKEN
const dataset = process.env.AXIOM_DATASET ?? "median"

function createLogger() {
  const console = new ConsoleTransport({
    prettyPrint: process.env.NODE_ENV === "development",
  })

  if (token) {
    const axiom = new Axiom({ token })
    return new Logger({
      transports: [new AxiomJSTransport({ axiom, dataset }), console],
      formatters: nextJsFormatters,
      args: { service: "median-web" },
    })
  }

  if (process.env.NODE_ENV === "production") {
    globalThis.console.warn("[median] AXIOM_TOKEN is not set — logs will not be sent to Axiom")
  }

  return new Logger({
    transports: [console],
    formatters: nextJsFormatters,
    args: { service: "median-web" },
  })
}

export const logger = createLogger()

export const withAxiom = createAxiomRouteHandler(logger)
