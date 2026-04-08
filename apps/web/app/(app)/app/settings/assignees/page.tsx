"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useAction, useMutation, useQuery } from "convex/react"
import { motion } from "motion/react"
import {
  ArrowClockwise,
  CheckCircle,
  ImageSquare,
  LinkSimple,
  SpinnerGap,
  UsersThree,
} from "@phosphor-icons/react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { AssigneeAvatar } from "@/components/assignee-avatar"
import { SettingsAccessState } from "@/components/settings-access-state"
import { useWorkspace } from "@/components/workspace-provider"
import { buildTaskAssignee, formatAssigneeRole } from "@/lib/task-board"
import { hasWorkspaceAdminPermission } from "@/lib/workspace-permissions"

const fadeUp = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] as const },
  },
}

type MemberAssigneeRecord = {
  memberId: Id<"workspaceMembers">
  id: string
  name: string
  avatar: string
  role: "owner" | "admin" | "member" | "guest"
  email?: string
  linearUserId?: string
}

type ExternalAssigneeRecord = {
  id: string
  name: string
  avatar: string
  role: "owner" | "admin" | "member" | "guest"
  email?: string
  linearUserId?: string
}

async function uploadImageFile(uploadUrl: string, file: File) {
  const result = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
  })

  if (!result.ok) {
    throw new Error("Failed to upload the image")
  }

  const data = (await result.json()) as { storageId?: string }
  if (!data.storageId) {
    throw new Error("Upload did not return a storage id")
  }

  return data.storageId as Id<"_storage">
}

function MemberAssigneeCard({
  assignee,
  isUploading,
  onSelectImage,
}: {
  assignee: MemberAssigneeRecord
  isUploading: boolean
  onSelectImage: () => void
}) {
  return (
    <div className="rounded-[4px] border border-border/80 bg-background/40 p-3">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onSelectImage}
          disabled={isUploading}
          className="relative rounded-full transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <AssigneeAvatar
            assignee={buildTaskAssignee(assignee)}
            className="size-10"
            emptyClassName="size-10"
          />
          <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
            {isUploading ? (
              <SpinnerGap size={11} className="animate-spin" />
            ) : (
              <ImageSquare size={11} />
            )}
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[13px] font-medium text-foreground">
              {assignee.name}
            </p>
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
              {formatAssigneeRole(assignee.role)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
            {assignee.email ?? "No email on file"}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Members are assignable by default. Clicking the avatar uploads a profile picture for this assignee.
          </p>
        </div>
      </div>
    </div>
  )
}

function ExternalAssigneeCard({
  assignee,
}: {
  assignee: ExternalAssigneeRecord
}) {
  return (
    <div className="rounded-[4px] border border-border/80 bg-background/40 p-3">
      <div className="flex items-start gap-3">
        <AssigneeAvatar
          assignee={buildTaskAssignee(assignee)}
          className="size-10"
          emptyClassName="size-10"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[13px] font-medium text-foreground">
              {assignee.name}
            </p>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">
              Synced from Linear
            </span>
          </div>
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
            {assignee.email ?? "No email available"}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Linked assignees are managed by the Linear sync and stay available for issue assignment even if they are not Median members.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function AssigneesSettingsPage() {
  const { currentWorkspace } = useWorkspace()
  const router = useRouter()
  const [syncingLinear, setSyncingLinear] = useState(false)
  const [uploadingMemberId, setUploadingMemberId] = useState<string | null>(null)
  const [memberAvatarPreviews, setMemberAvatarPreviews] = useState<
    Record<string, string>
  >({})
  const pendingMemberIdRef = useRef<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const autoRefreshKeyRef = useRef<string | null>(null)

  const integrationState = useQuery(
    api.linear.getWorkspaceLinearIntegration,
    currentWorkspace ? { workspaceId: currentWorkspace._id } : "skip"
  )
  const assigneeSettings = useQuery(
    api.workspaces.getWorkspaceAssigneeSettings,
    currentWorkspace ? { workspaceId: currentWorkspace._id } : "skip"
  )
  const generateUploadUrl = useMutation(api.workspaces.generateUploadUrl)
  const updateMemberAssigneeAvatar = useMutation(
    api.workspaces.updateMemberAssigneeAvatar
  )
  const refreshWorkspaceLinearAssignees = useAction(
    api.linear.refreshWorkspaceLinearAssignees
  )

  const linearIntegration = integrationState?.integration ?? null
  const isLinearLinked = Boolean(linearIntegration)
  const memberAssignees = assigneeSettings?.memberAssignees ?? []
  const externalAssignees = assigneeSettings?.externalAssignees ?? []

  useEffect(() => {
    if (!currentWorkspace || !isLinearLinked) {
      autoRefreshKeyRef.current = null
      return
    }

    const nextKey = `${currentWorkspace._id}:${linearIntegration?.teamId ?? "linear"}`
    if (autoRefreshKeyRef.current === nextKey) {
      return
    }

    autoRefreshKeyRef.current = nextKey
    setSyncingLinear(true)
    void refreshWorkspaceLinearAssignees({ workspaceId: currentWorkspace._id })
      .catch((error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to refresh assignees from Linear."
        )
      })
      .finally(() => {
        setSyncingLinear(false)
      })
  }, [
    currentWorkspace,
    isLinearLinked,
    linearIntegration?.teamId,
    refreshWorkspaceLinearAssignees,
  ])

  if (!currentWorkspace) return null
  if (!hasWorkspaceAdminPermission(currentWorkspace.role)) {
    return (
      <div className="mx-auto w-full max-w-2xl px-6 py-6">
        <SettingsAccessState />
      </div>
    )
  }

  async function handleRefreshLinearAssignees() {
    if (!currentWorkspace) return
    setSyncingLinear(true)
    try {
      await refreshWorkspaceLinearAssignees({ workspaceId: currentWorkspace._id })
      toast.success("Linear assignees refreshed.")
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to refresh assignees from Linear."
      )
    } finally {
      setSyncingLinear(false)
    }
  }

  function handleSelectMemberAvatar(memberId: string) {
    pendingMemberIdRef.current = memberId
    fileInputRef.current?.click()
  }

  async function handleMemberAvatarChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0]
    const memberId = pendingMemberIdRef.current
    event.target.value = ""

    if (!file || !memberId) {
      pendingMemberIdRef.current = null
      return
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file.")
      pendingMemberIdRef.current = null
      return
    }

    try {
      setUploadingMemberId(memberId)
      const uploadUrl = await generateUploadUrl()
      const previewUrl = URL.createObjectURL(file)
      setMemberAvatarPreviews((current) => ({
        ...current,
        [memberId]: previewUrl,
      }))
      const storageId = await uploadImageFile(uploadUrl, file)

      await updateMemberAssigneeAvatar({
        memberId: memberId as Id<"workspaceMembers">,
        storageId,
      })

      toast.success("Profile picture updated.")
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to update the profile picture."
      )
    } finally {
      pendingMemberIdRef.current = null
      setUploadingMemberId(null)
    }
  }

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.06 } } }}
      className="mx-auto w-full max-w-3xl px-6 py-6"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleMemberAvatarChange}
        className="hidden"
      />

      <motion.div
        variants={fadeUp}
        className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
      >
        <div>
          <h2 className="text-[14px] font-semibold">Assignees</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Members are assignable by default. Linear can add extra synced assignees for issue assignment.
          </p>
        </div>
        {isLinearLinked ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRefreshLinearAssignees}
              disabled={syncingLinear}
              className="inline-flex h-9 items-center gap-2 rounded-[4px] border border-border bg-card px-3 text-[11px] font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
            >
              {syncingLinear ? (
                <SpinnerGap size={13} className="animate-spin" />
              ) : (
                <ArrowClockwise size={13} />
              )}
              Refresh
            </button>
            <div className="inline-flex h-9 items-center gap-2 rounded-[4px] border border-emerald-500/30 bg-emerald-500/10 px-3 text-[11px] font-medium text-emerald-400">
              <CheckCircle size={13} weight="fill" />
              Linked
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => router.push("/app/integrations/linear")}
            className="inline-flex h-9 items-center gap-2 rounded-[4px] border border-border bg-card px-3 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
          >
            <LinkSimple size={13} />
            Sync with Linear
          </button>
        )}
      </motion.div>

      <motion.div variants={fadeUp} className="space-y-4">
        <div className="rounded-[4px] bg-card ring-1 ring-border">
          <div className="border-b border-border px-5 py-4">
            <div className="flex items-center gap-2">
              <UsersThree size={16} className="text-muted-foreground" />
              <h3 className="text-[13px] font-semibold">Member Assignees</h3>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Everyone in the Members section is assignable here automatically. Uploading an avatar here also updates the assignee used on tasks, and linked workspaces push that avatar to Linear when the user can be matched there.
            </p>
          </div>
          <div className="space-y-3 p-5">
            {memberAssignees.length > 0 ? (
              memberAssignees.map((assignee) => (
                <MemberAssigneeCard
                  key={assignee.memberId}
                  assignee={{
                    ...assignee,
                    avatar:
                      memberAvatarPreviews[String(assignee.memberId)] ??
                      assignee.avatar,
                  }}
                  isUploading={uploadingMemberId === assignee.memberId}
                  onSelectImage={() => handleSelectMemberAvatar(String(assignee.memberId))}
                />
              ))
            ) : (
              <p className="text-[12px] text-muted-foreground">
                No members found for this workspace yet.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-[4px] bg-card ring-1 ring-border">
          <div className="border-b border-border px-5 py-4">
            <h3 className="text-[13px] font-semibold">Synced from Linear</h3>
            <p className="mt-1 text-[11px] text-muted-foreground">
              These assignees come from Linear and stay available for issue assignment even if they are not Median members.
            </p>
          </div>
          <div className="space-y-3 p-5">
            {externalAssignees.length > 0 ? (
              externalAssignees.map((assignee) => (
                <ExternalAssigneeCard key={assignee.id} assignee={assignee} />
              ))
            ) : (
              <p className="text-[12px] text-muted-foreground">
                {isLinearLinked
                  ? "No extra Linear-only assignees are synced into this workspace right now."
                  : "Connect Linear to import extra synced assignees."}
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
