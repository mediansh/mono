import { posthog } from "@/lib/posthog"

/**
 * Capture a client-side analytics event.
 * Safe to call anywhere — no-ops if PostHog is not initialized.
 */
export function capture(event: string, properties?: Record<string, unknown>) {
  try {
    if (typeof window !== "undefined" && posthog?.__loaded) {
      posthog.capture(event, properties)
    }
  } catch {
    // silently ignore analytics errors — never break the app
  }
}

// ── Task Events ──────────────────────────────────────────

export function trackTaskCreated(props: {
  taskId?: string
  status: string
  priority: string
  labelCount: number
  hasDescription: boolean
  hasAttachments: boolean
  source: "manual" | "ai" | "discord" | "x" | "linear" | "github" | "cli"
}) {
  capture("task_created", props)
}

export function trackTasksGeneratedAI(props: {
  promptLength: number
  taskCount: number
  durationMs: number
}) {
  capture("tasks_generated_ai", props)
}

export function trackTaskUpdated(props: {
  taskId: string
  fields: string[]
}) {
  capture("task_updated", props)
}

export function trackTaskDeleted(props: {
  taskId: string
}) {
  capture("task_deleted", props)
}

export function trackTaskMoved(props: {
  taskId: string
  fromStatus: string
  toStatus: string
  method: "drag" | "button" | "bulk"
}) {
  capture("task_moved", props)
}

export function trackTasksBulkUpdated(props: {
  taskCount: number
  field: string
  value: string
}) {
  capture("tasks_bulk_updated", props)
}

export function trackTasksBulkDeleted(props: {
  taskCount: number
}) {
  capture("tasks_bulk_deleted", props)
}

export function trackRequestAccepted(props: {
  taskId: string
  source?: string
}) {
  capture("request_accepted", props)
}

export function trackRequestDenied(props: {
  taskId: string
  source?: string
}) {
  capture("request_denied", props)
}

// ── Workspace Events ─────────────────────────────────────

export function trackWorkspaceCreated(props: {
  hasLogo: boolean
}) {
  capture("workspace_created", props)
}

export function trackWorkspaceUpdated(props: {
  fields: string[]
}) {
  capture("workspace_updated", props)
}

export function trackWorkspaceDeleted() {
  capture("workspace_deleted")
}

// ── Member Events ────────────────────────────────────────

export function trackInviteLinkCreated(props: {
  role: string
}) {
  capture("invite_link_created", props)
}

export function trackInviteEmailSent(props: {
  role: string
}) {
  capture("invite_email_sent", props)
}

export function trackMemberRoleChanged(props: {
  newRole: string
}) {
  capture("member_role_changed", props)
}

export function trackMemberRemoved() {
  capture("member_removed")
}

export function trackInviteRevoked() {
  capture("invite_revoked")
}

export function trackInviteAccepted() {
  capture("invite_accepted")
}

// ── Label Events ─────────────────────────────────────────

export function trackLabelsSaved(props: {
  labelCount: number
}) {
  capture("labels_saved", props)
}

// ── Integration Events ───────────────────────────────────

export function trackIntegrationConnected(props: {
  platform: "discord" | "linear" | "github" | "x"
}) {
  capture("integration_connected", props)
}

export function trackIntegrationDisconnected(props: {
  platform: "discord" | "linear" | "github" | "x"
}) {
  capture("integration_disconnected", props)
}

export function trackIntegrationSettingsChanged(props: {
  platform: "discord" | "linear" | "github" | "x"
  setting: string
}) {
  capture("integration_settings_changed", props)
}

// ── Board Interaction Events ─────────────────────────────

export function trackColumnToggled(props: {
  column: string
  collapsed: boolean
}) {
  capture("column_toggled", props)
}

export function trackNewTaskModalOpened(props: {
  defaultStatus?: string
}) {
  capture("new_task_modal_opened", props)
}

export function trackAIPromptTabSelected() {
  capture("ai_prompt_tab_selected")
}

// ── Navigation / Page Events ─────────────────────────────

export function trackPageView(props: {
  path: string
  title?: string
}) {
  capture("$pageview", props)
}
