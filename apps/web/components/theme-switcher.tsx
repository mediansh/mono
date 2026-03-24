"use client"

import { useSyncExternalStore } from "react"
import { useTheme } from "next-themes"
import { Desktop, Sun, Moon } from "@phosphor-icons/react"

const themes = [
  { value: "system", icon: Desktop },
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
] as const

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  )

  if (!mounted) return null

  return (
    <div className="border-navbar-foreground/10 inline-flex items-center gap-0.5 rounded-full border p-0.5">
      {themes.map(({ value, icon: Icon }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          className={`rounded-full p-1.5 transition-colors ${
            theme === value
              ? "bg-navbar-foreground/10 text-navbar-foreground"
              : "text-navbar-foreground/40 hover:text-navbar-foreground/70"
          }`}
          aria-label={`${value} theme`}
        >
          <Icon size={14} weight={theme === value ? "fill" : "regular"} />
        </button>
      ))}
    </div>
  )
}
