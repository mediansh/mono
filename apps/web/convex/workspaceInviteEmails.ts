import { Inbound } from "@inboundemail/sdk"
import { v } from "convex/values"
import { action } from "./_generated/server"
import { api } from "./_generated/api"
import { getRoleLabel } from "../lib/workspace-permissions"

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function getAppBaseUrl() {
  const baseUrl =
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL
  if (!baseUrl) {
    throw new Error(
      "Missing APP_URL / NEXT_PUBLIC_APP_URL for workspace invite email links"
    )
  }
  return baseUrl.replace(/\/$/, "")
}

export const sendInviteEmail = action({
  args: {
    workspaceId: v.id("workspaces"),
    inviteToken: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ ok: boolean; error?: string }> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) {
      return { ok: false, error: "Unauthorized" }
    }

    const apiKey = process.env.INBOUND_API_KEY
    if (!apiKey) {
      console.error("[workspaceInviteEmails] INBOUND_API_KEY is not configured", {
        userId: identity.subject,
      })
      return { ok: false, error: "INBOUND_API_KEY is not configured" }
    }

    const fromEmail =
      process.env.INBOUND_FROM_EMAIL ?? "Median <agent@inbnd.dev>"

    const invite = await ctx.runQuery(
      api.workspaces.getEmailInviteDeliveryContext,
      {
        workspaceId: args.workspaceId,
        token: args.inviteToken,
      }
    )

    const inviterName =
      identity.name ?? identity.givenName ?? identity.nickname ?? "A teammate"
    const roleLabel = getRoleLabel(invite.role)
    const inviteUrl = `${getAppBaseUrl()}/invite/${invite.token}`
    const inbound = new Inbound(apiKey, "https://inbound.new/api/e2")
    const safeInviterName = escapeHtml(inviterName)
    const safeWorkspaceName = escapeHtml(invite.workspaceName)
    const safeRoleLabel = escapeHtml(roleLabel)
    const safeInviteUrl = escapeHtml(inviteUrl)

    console.log("[workspaceInviteEmails] Sending workspace invite email", {
      userId: identity.subject,
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
      const message =
        typeof error === "string" ? error : "Invite email failed to send"
      console.error("[workspaceInviteEmails] Invite email failed to send", {
        userId: identity.subject,
        recipientEmail: invite.invitedEmail,
        error: message,
      })
      return { ok: false, error: message }
    }

    console.log("[workspaceInviteEmails] Invite email sent successfully", {
      userId: identity.subject,
      recipientEmail: invite.invitedEmail,
      workspaceName: invite.workspaceName,
    })
    return { ok: true }
  },
})
