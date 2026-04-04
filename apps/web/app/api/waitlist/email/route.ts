import { NextResponse } from "next/server"
import { z } from "zod"
import { Inbound } from "@inboundemail/sdk"
import { withAxiom, logger } from "@/lib/logger"

const bodySchema = z.object({
  email: z.string().email(),
})

export const POST = withAxiom(async (request: Request) => {
  const apiKey = process.env.INBOUND_API_KEY
  if (!apiKey) {
    logger.error("INBOUND_API_KEY is not configured")
    return NextResponse.json(
      { error: "INBOUND_API_KEY is not configured" },
      { status: 500 }
    )
  }

  const fromEmail = process.env.INBOUND_FROM_EMAIL ?? "Median <agent@inbnd.dev>"

  try {
    const body = bodySchema.parse(await request.json())
    const inbound = new Inbound(apiKey, "https://inbound.new/api/e2")

    logger.info("Sending waitlist confirmation email", {
      recipientEmail: body.email,
    })

    const { error } = await inbound.email.send({
      from: fromEmail,
      to: [body.email],
      subject: "You're on the Median waitlist",
      html: `
        <div style="font-family: Inter, Arial, sans-serif; padding: 24px; color: #0f172a;">
          <p style="margin: 0 0 12px;">Thanks for joining the Median waitlist.</p>
          <p style="margin: 0 0 12px;">We're building the feedback engine for modern teams &mdash; and you'll be among the first to try it.</p>
          <p style="margin: 0; color: #64748b; font-size: 14px;">We'll reach out when your spot is ready.</p>
        </div>
      `,
      text: "Thanks for joining the Median waitlist. We're building the feedback engine for modern teams — and you'll be among the first to try it. We'll reach out when your spot is ready.",
    })

    if (error) {
      logger.error("Waitlist email failed to send", {
        recipientEmail: body.email,
        error: typeof error === "string" ? error : "Unknown email error",
      })
      return NextResponse.json(
        { error: typeof error === "string" ? error : "Failed to send email" },
        { status: 502 }
      )
    }

    logger.info("Waitlist email sent successfully", {
      recipientEmail: body.email,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request"
    logger.error("Waitlist email request failed", { error: message })
    return NextResponse.json({ error: message }, { status: 400 })
  }
})
