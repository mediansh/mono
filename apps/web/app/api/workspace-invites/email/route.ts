import { auth, currentUser } from "@clerk/nextjs/server"
import { fetchQuery } from "convex/nextjs"
import { NextResponse } from "next/server"
import { z } from "zod"
import { Inbound } from "@inboundemail/sdk"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { getRoleLabel } from "@/lib/workspace-permissions"
import { withAxiom, logger } from "@/lib/logger"
import { checkRateLimit, getRequestIp } from "@/lib/rate-limit"

const bodySchema = z.object({
  workspaceId: z.string().min(1),
  inviteToken: z.string().min(1),
})

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

export const POST = withAxiom(async (request: Request) => {
  const { userId, getToken } = await auth()
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
  const ip = getRequestIp(request)
  const rateLimit = checkRateLimit({
    key: `workspace-invite-email:${userId}:${ip}`,
    limit: 20,
    windowMs: 60 * 60 * 1000,
  })

  if (!rateLimit.allowed) {
    logger.warn("Workspace invite email rate limit exceeded", { userId, ip })
    return NextResponse.json(
      { error: "Too many invite emails sent. Try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      }
    )
  }

  try {
    const body = bodySchema.parse(await request.json())
    const convexToken = await getToken({ template: "convex" })
    if (!convexToken) {
      logger.warn("Missing Convex token for invite email", {
        userId,
        workspaceId: body.workspaceId,
      })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const invite = await fetchQuery(
      api.workspaces.getEmailInviteDeliveryContext,
      {
        workspaceId: body.workspaceId as Id<"workspaces">,
        token: body.inviteToken,
      },
      { token: convexToken }
    )

    const user = await currentUser()
    const inviterName = user?.fullName ?? user?.firstName ?? "A teammate"
    const roleLabel = getRoleLabel(invite.role)
    const inviteUrl = new URL(`/invite/${invite.token}`, request.url).toString()
    const inbound = new Inbound(apiKey, "https://inbound.new/api/e2")
    const safeInviterName = escapeHtml(inviterName)
    const safeWorkspaceName = escapeHtml(invite.workspaceName)
    const safeRoleLabel = escapeHtml(roleLabel)
    const safeInviteUrl = escapeHtml(inviteUrl)

    logger.info("Sending workspace invite email", {
      userId,
      recipientEmail: invite.invitedEmail,
      role: invite.role,
      workspaceName: invite.workspaceName,
    })

    const { error } = await inbound.email.send({
      from: fromEmail,
      to: [invite.invitedEmail],
      subject: `${inviterName} invited you to ${invite.workspaceName} on Median`,
      html: `
        <div style="font-family: Inter, Arial, sans-serif; padding: 24px; color: #0f172a;">
          <p style="margin: 0 0 12px;">${safeInviterName} invited you to join <strong>${safeWorkspaceName}</strong> on Median.</p>
          <p style="margin: 0 0 20px;">You will join as a <strong>${safeRoleLabel}</strong>.</p>
          <a href="${safeInviteUrl}" style="display: inline-block; border-radius: 999px; background: #14120B; color: white; padding: 12px 18px; text-decoration: none; font-weight: 600;">Accept invite</a>
          <p style="margin: 20px 0 0; color: #64748b; font-size: 14px;">If the button does not work, open this link:<br /><a href="${safeInviteUrl}">${safeInviteUrl}</a></p>
        </div>
      `,
      text: `${inviterName} invited you to join ${invite.workspaceName} on Median as a ${roleLabel}. Open ${inviteUrl} to accept the invite.`,
    })

    if (error) {
      logger.error("Invite email failed to send", {
        userId,
        recipientEmail: invite.invitedEmail,
        error: typeof error === "string" ? error : "Unknown email error",
      })
      return NextResponse.json(
        { error: typeof error === "string" ? error : "Invite email failed to send" },
        { status: 502 }
      )
    }

    logger.info("Invite email sent successfully", {
      userId,
      recipientEmail: invite.invitedEmail,
      workspaceName: invite.workspaceName,
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
