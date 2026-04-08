"use client"

import { useUser } from "@clerk/nextjs"
import {
  normalizeAssigneeEmail,
  normalizeAssigneeName,
  type TaskAssignee,
} from "@/lib/task-board"

export type CurrentUserProfile = {
  userId?: string
  email?: string
  name?: string
  imageUrl?: string
  aliases?: string[]
}

type WorkspaceMemberLike = {
  userId: string
  name?: string | null
  email?: string | null
  imageUrl?: string | null
}

function normalizeProfile(profile: CurrentUserProfile | null): CurrentUserProfile | null {
  if (!profile) {
    return null
  }

  return {
    userId: profile.userId?.trim() || undefined,
    email: normalizeAssigneeEmail(profile.email),
    name: profile.name?.trim() || undefined,
    imageUrl: profile.imageUrl?.trim() || undefined,
    aliases: Array.from(
      new Set(
        (profile.aliases ?? [])
          .map((alias) => normalizeAssigneeName(alias).toLowerCase())
          .filter(Boolean)
      )
    ),
  }
}

function normalizeAliasValue(value?: string | null) {
  const normalized = normalizeAssigneeName(value ?? "").toLowerCase()
  return normalized || undefined
}

function matchesAlias(target: string | undefined, aliases: string[] | undefined) {
  if (!target || !aliases?.length) {
    return false
  }

  return aliases.some(
    (alias) =>
      alias === target ||
      alias.startsWith(`${target} `) ||
      target.startsWith(`${alias} `)
  )
}

function isCurrentUserMatch(
  target: {
    userId?: string | null
    email?: string | null
    name?: string | null
  },
  profile: CurrentUserProfile | null
) {
  if (!profile) {
    return false
  }

  if (target.userId?.trim() && profile.userId && target.userId.trim() === profile.userId) {
    return true
  }

  const normalizedTargetEmail = normalizeAssigneeEmail(target.email)
  if (normalizedTargetEmail && profile.email && normalizedTargetEmail === profile.email) {
    return true
  }

  const targetAliases = [
    normalizeAliasValue(target.name),
    normalizeAliasValue(target.email),
    normalizeAliasValue(target.email?.split("@")[0]),
  ].filter((alias): alias is string => Boolean(alias))

  return targetAliases.some((alias) => matchesAlias(alias, profile.aliases))
}

export function useCurrentUserProfile() {
  const { user } = useUser()

  return normalizeProfile(
    user
      ? {
          userId: user.id,
          email: user.primaryEmailAddress?.emailAddress,
          name: user.fullName ?? user.username ?? undefined,
          imageUrl: user.imageUrl,
          aliases: [
            user.fullName ?? undefined,
            user.username ?? undefined,
            user.firstName ?? undefined,
            user.lastName ?? undefined,
            user.primaryEmailAddress?.emailAddress ?? undefined,
            user.primaryEmailAddress?.emailAddress?.split("@")[0] ?? undefined,
          ].filter((alias): alias is string => Boolean(alias)),
        }
      : null
  )
}

export function resolveAssigneeWithCurrentUserProfile<T extends TaskAssignee>(
  assignee: T | null | undefined,
  profile: CurrentUserProfile | null
) {
  if (
    !assignee ||
    !isCurrentUserMatch(
      { userId: assignee.id, email: assignee.email, name: assignee.name },
      profile
    )
  ) {
    return assignee
  }

  return {
    ...assignee,
    id: profile?.userId ?? assignee.id,
    name: profile?.name ?? assignee.name,
    email: profile?.email ?? assignee.email,
    avatar: profile?.imageUrl ?? assignee.avatar,
  } satisfies T
}

export function resolveMemberWithCurrentUserProfile<T extends WorkspaceMemberLike>(
  member: T,
  profile: CurrentUserProfile | null
) {
  if (!isCurrentUserMatch(member, profile)) {
    return member
  }

  return {
    ...member,
    name: profile?.name ?? member.name,
    email: profile?.email ?? member.email,
    imageUrl: profile?.imageUrl ?? member.imageUrl,
  } satisfies T
}
