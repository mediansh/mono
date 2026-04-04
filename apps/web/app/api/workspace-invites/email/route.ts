import { auth, currentUser } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import { z } from "zod"
import { Inbound } from "@inboundemail/sdk"
import { getRoleLabel } from "@/lib/workspace-permissions"
import { withAxiom, logger } from "@/lib/logger"

const bodySchema = z.object({
  email: z.string().email(),
  role: z.enum(["guest", "member", "admin"]),
  workspaceName: z.string().min(1),
  inviteUrl: z.string().url(),
})

export const POST = withAxiom(async (request: Request) => {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const apiKey = process.env.INBOUND_API_KEY
  if (!apiKey) {
    logger.error("INBOUND_API_KEY is not configured", { userId })
    return NextResponse.json(
      { error: "INBOUND_API_KEY is not configured" },
      { status: 500 }
    )
  }

  const fromEmail = process.env.INBOUND_FROM_EMAIL ?? "Median <agent@inbnd.dev>"

  try {
    const body = bodySchema.parse(await request.json())
    const user = await currentUser()
    const inviterName = user?.fullName ?? user?.firstName ?? "A teammate"
    const roleLabel = getRoleLabel(body.role)
    const inbound = new Inbound(apiKey, "https://inbound.new/api/e2")

    logger.info("Sending workspace invite email", {
      userId,
      recipientEmail: body.email,
      role: body.role,
      workspaceName: body.workspaceName,
    })

    const { error } = await inbound.email.send({
      from: fromEmail,
      to: [body.email],
      subject: `${inviterName} invited you to ${body.workspaceName} on Median`,
      html: `
        <div style="font-family: Inter, Arial, sans-serif; padding: 24px; color: #0f172a;">
          <p style="margin: 0 0 12px;">${inviterName} invited you to join <strong>${body.workspaceName}</strong> on Median.</p>
          <p style="margin: 0 0 20px;">You will join as a <strong>${roleLabel}</strong>.</p>
          <a href="${body.inviteUrl}" style="display: inline-block; border-radius: 999px; background: #14120B; color: white; padding: 12px 18px; text-decoration: none; font-weight: 600;">Accept invite</a>
          <p style="margin: 20px 0 0; color: #64748b; font-size: 14px;">If the button does not work, open this link:<br /><a href="${body.inviteUrl}">${body.inviteUrl}</a></p>
        </div>
      `,
      text: `${inviterName} invited you to join ${body.workspaceName} on Median as a ${roleLabel}. Open ${body.inviteUrl} to accept the invite.`,
    })

    if (error) {
      logger.error("Invite email failed to send", {
        userId,
        recipientEmail: body.email,
        error: typeof error === "string" ? error : "Unknown email error",
      })
      return NextResponse.json(
        { error: typeof error === "string" ? error : "Invite email failed to send" },
        { status: 502 }
      )
    }

    logger.info("Invite email sent successfully", {
      userId,
      recipientEmail: body.email,
      workspaceName: body.workspaceName,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request"
    logger.error("Workspace invite email failed", {
      userId,
      error: message,
    })
    return NextResponse.json({ error: message }, { status: 400 })
  }
})
