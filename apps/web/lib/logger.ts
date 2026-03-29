import { Logger, ConsoleTransport, AxiomJSTransport } from "@axiomhq/logging"
import { nextJsFormatters } from "@axiomhq/nextjs"
import { createAxiomRouteHandler } from "@axiomhq/nextjs"
import axiomClient from "@/lib/axiom"

const dataset = process.env.AXIOM_DATASET ?? "median"

export const logger = new Logger({
  transports: [
    new AxiomJSTransport({ axiom: axiomClient, dataset }),
    new ConsoleTransport({ prettyPrint: process.env.NODE_ENV === "development" }),
  ],
  formatters: nextJsFormatters,
  args: { service: "median-web" },
})

export const withAxiom = createAxiomRouteHandler(logger)
