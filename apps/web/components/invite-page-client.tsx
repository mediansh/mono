"use client"

import Link from "next/link"
import { useState } from "react"
import { useMutation, useQuery } from "convex/react"
import { useAuth } from "@clerk/nextjs"
import { SealCheck, Link as LinkIcon, Users } from "@phosphor-icons/react"
import { motion } from "motion/react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import { RoleBadge } from "@/components/role-badge"
import { getRoleLabel } from "@/lib/workspace-permissions"
import { useInstantNavigation } from "@/hooks/use-instant-navigation"

export function InvitePageClient({ token }: { token: string }) {
  const { navigate } = useInstantNavigation()
  const { isLoaded, userId } = useAuth()
  const [accepting, setAccepting] = useState(false)

  const invite = useQuery(
    api.workspaces.getInviteByToken,
    token ? { token } : "skip"
  )
  const acceptInvite = useMutation(api.workspaces.acceptInvite)

  async function handleAcceptInvite() {
    if (!token) return
    setAccepting(true)
    try {
      await acceptInvite({ token })
      toast.success("Workspace joined.")
      navigate("/app")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to accept invite.")
      setAccepting(false)
    }
  }

  const authRedirect = token
    ? `/sign-in?redirect_url=${encodeURIComponent(`/invite/${token}`)}`
    : "/sign-in"

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(4,150,255,0.16),_transparent_38%),linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.95))] px-6 py-20 dark:bg-[radial-gradient(circle_at_top,_rgba(4,150,255,0.18),_transparent_32%),linear-gradient(180deg,_rgba(10,15,23,1),_rgba(10,15,23,0.96))]">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
        className="mx-auto flex w-full max-w-xl flex-col gap-6 rounded-[8px] border-2 border-border bg-background p-8 shadow-none"
      >
        <div className="flex size-14 items-center justify-center rounded-[8px] border border-border bg-accent">
          <Users
            size={24}
            className="text-foreground"
          />
        </div>

        {invite === undefined ? (
          <div className="space-y-3">
            <h1 className="text-2xl font-semibold">Loading invite…</h1>
            <p className="text-sm text-muted-foreground">
              Verifying the invite link before you join the workspace.
            </p>
          </div>
        ) : invite === null ? (
          <div className="space-y-4">
            <h1 className="text-2xl font-semibold">Invite unavailable</h1>
            <p className="text-sm leading-6 text-muted-foreground">
              This invite link has expired or was revoked. Ask a workspace admin to send
              a new one.
            </p>
            <Link
              href="/"
              className="inline-flex h-10 items-center justify-center rounded-[8px] border border-border px-4 text-sm font-medium transition-colors hover:bg-accent"
            >
              Back to home
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <RoleBadge role={invite.role} />
                <span className="text-xs text-muted-foreground">
                  {invite.inviteType === "email" ? "Email invite" : "Invite link"}
                </span>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Join {invite.workspaceName}
              </h1>
              <p className="text-sm leading-6 text-muted-foreground">
                You were invited to join this workspace as a{" "}
                <span className="font-medium text-foreground">
                  {getRoleLabel(invite.role).toLowerCase()}
                </span>
                .
                {invite.invitedEmail ? ` This invite is reserved for ${invite.invitedEmail}.` : ""}
              </p>
            </div>

            <div className="grid gap-3 rounded-[8px] border border-border/80 bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Permissions</span>
                <SealCheck
                  size={18}
                  weight="fill"
                  className="text-foreground"
                />
              </div>
              <p className="text-sm">
                {invite.role === "guest"
                  ? "View-only access to tasks."
                  : invite.role === "member"
                    ? "Can create, update, move, and delete tasks."
                    : "Can manage members, settings, and task workflows."}
              </p>
            </div>

            {!isLoaded ? null : userId ? (
              <button
                type="button"
                disabled={accepting}
                onClick={handleAcceptInvite}
                className="flex h-11 items-center justify-center gap-2 rounded-[8px] bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                <LinkIcon size={16} />
                {accepting ? "Joining..." : "Accept invite"}
              </button>
            ) : (
              <Link
                href={authRedirect}
                className="flex h-11 items-center justify-center gap-2 rounded-[8px] bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <LinkIcon size={16} />
                Sign in to accept
              </Link>
            )}
          </>
        )}
      </motion.div>
    </main>
  )
}
