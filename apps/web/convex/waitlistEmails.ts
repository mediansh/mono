"use node"

import { Inbound } from "@inboundemail/sdk"
import { v } from "convex/values"
import { action } from "./_generated/server"

export const sendConfirmationEmail = action({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args): Promise<{ ok: boolean; error?: string }> => {
    const apiKey = process.env.INBOUND_API_KEY
    if (!apiKey) {
      console.error("[waitlist] INBOUND_API_KEY is not configured")
      return { ok: false, error: "INBOUND_API_KEY is not configured" }
    }

    const fromEmail =
      process.env.INBOUND_FROM_EMAIL ?? "Median <agent@inbnd.dev>"
    const inbound = new Inbound(apiKey, "https://inbound.new/api/e2")

    console.log("[waitlist] Sending waitlist confirmation email", {
      recipientEmail: args.email,
    })

    const { error } = await inbound.email.send({
      from: fromEmail,
      to: [args.email],
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
      const message = typeof error === "string" ? error : "Unknown email error"
      console.error("[waitlist] Waitlist email failed to send", {
        recipientEmail: args.email,
        error: message,
      })
      return { ok: false, error: message }
    }

    console.log("[waitlist] Waitlist email sent successfully", {
      recipientEmail: args.email,
    })
    return { ok: true }
  },
})
