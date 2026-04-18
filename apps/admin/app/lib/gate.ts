import { useUser } from "@clerk/clerk-react"

const BLOCKED_TOKEN = "alby"

export function useIsDataBlocked(): boolean {
  const { user } = useUser()
  if (!user) return false
  const haystack = [
    user.fullName,
    user.firstName,
    user.lastName,
    user.username,
    ...(user.emailAddresses?.map((e) => e.emailAddress) ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  return haystack.includes(BLOCKED_TOKEN)
}
