"use client"

import { Logger, ConsoleTransport } from "@axiomhq/logging"
import { ProxyTransport } from "@axiomhq/logging"

export const clientLogger = new Logger({
  transports: [
    new ProxyTransport({ url: "/api/axiom" }),
    new ConsoleTransport({ prettyPrint: true }),
  ],
  args: { service: "median-web", side: "client" },
})
