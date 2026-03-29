import { createProxyRouteHandler } from "@axiomhq/nextjs"
import { logger } from "@/lib/logger"

const proxyHandler = createProxyRouteHandler(logger)

export const POST = proxyHandler
