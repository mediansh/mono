import { auth } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { z } from "zod"

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

export async function POST(request: Request) {
  const { userId } = await auth()

  try {
    const body = await request.json()
    const parsed = errorReportSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid error report." },
        { status: 400 }
      )
    }

    const report = parsed.data

    console.error("[median:error]", {
      ...report,
      userId: userId ?? null,
      timestamp: new Date().toISOString(),
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { error: "Unable to record error." },
      { status: 500 }
    )
  }
}
