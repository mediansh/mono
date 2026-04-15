import { after, NextResponse } from "next/server"
import { z } from "zod"
import type { Id } from "@/convex/_generated/dataModel"
import { logger, withAxiom } from "@/lib/logger"
import { processSlackFeedbackInBackground } from "@/lib/slack-feedback-worker"

const bodySchema = z.object({
  integrationId: z.string().min(1),
})

export const POST = withAxiom(async (request: Request) => {
  const expectedSecret = process.env.SLACK_BOT_SECRET
  const providedSecret = request.headers.get("x-median-worker-secret")

  if (!expectedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = bodySchema.parse(await request.json())

    after(async () => {
      await processSlackFeedbackInBackground({
        integrationId: body.integrationId as Id<"slackWorkspaceIntegrations">,
      })
    })

    return NextResponse.json({ accepted: true }, { status: 202 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request"
    logger.error("Invalid Slack feedback worker request", { error: message })
    return NextResponse.json({ error: message }, { status: 400 })
  }
})
