import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { z } from "zod"
import { withAxiom, logger } from "@/lib/logger"
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit"

const errorReportSchema = z.object({
  source: z.enum([
    "window.error",
    "unhandledrejection",
    "react.error-boundary",
  ]),
  message: z.string().min(1).max(4000),
  stack: z.string().max(12000).optional(),
  digest: z.string().max(255).optional(),
  pathname: z.string().max(2048).optional(),
  userAgent: z.string().max(1024).optional(),
  metadata: z
    .record(z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional(),
})

export const POST = withAxiom(async (request: Request) => {
  const { userId } = await auth()
  const ip = getRequestIp(request)
  const rateLimit = checkRateLimit({
    key: `error-report:${userId ?? "anonymous"}:${ip}`,
    limit: 30,
    windowMs: 60_000,
  })

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many error reports. Try again shortly." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      }
    )
  }

  try {
    const body = await request.json()
    const parsed = errorReportSchema.safeParse(body)

    if (!parsed.success) {
      logger.warn("Invalid error report payload", { userId })
      return NextResponse.json(
        { error: "Invalid error report." },
        { status: 400 }
      )
    }

    const report = parsed.data

    logger.error("Client error reported", {
      ...report,
      userId: userId ?? null,
    })

    return NextResponse.json({ ok: true })
  } catch {
    logger.error("Failed to process error report", { userId })
    return NextResponse.json(
      { error: "Unable to record error." },
      { status: 500 }
    )
  }
})
