import { createOnRequestError } from "@axiomhq/nextjs"
import { logger } from "@/lib/logger"

export const onRequestError = createOnRequestError(logger)

export async function register() {
  logger.info("Next.js instrumentation registered", {
    runtime: process.env.NEXT_RUNTIME,
  })
}
