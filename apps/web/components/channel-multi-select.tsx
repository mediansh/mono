"use client"

import { useMemo, useState } from "react"
import { Check, Hash, SpinnerGap } from "@phosphor-icons/react"
import { Input } from "@workspace/ui/components/input"

export type IntegrationChannelOption = {
  id: string
  name: string
  parentName?: string | null
}

type ChannelMultiSelectProps = {
  channels: IntegrationChannelOption[]
  selectedChannelIds: string[]
  onToggleChannel: (channelId: string) => void
  loadingLabel: string
  emptySelectionLabel: string
  selectedCountLabel: (count: number) => string
  groupByParent?: boolean
}

export function ChannelMultiSelect({
  channels,
  selectedChannelIds,
  onToggleChannel,
  loadingLabel,
  emptySelectionLabel,
  selectedCountLabel,
  groupByParent = false,
}: ChannelMultiSelectProps) {
  const [search, setSearch] = useState("")

  const filteredChannels = useMemo(() => {
    if (!search) return channels
    const query = search.toLowerCase()
    return channels.filter((channel) => channel.name.toLowerCase().includes(query))
  }, [channels, search])

  const groupedChannels = useMemo(() => {
    if (!groupByParent) {
      return [["", filteredChannels]] as const
    }

    return Array.from(
      filteredChannels.reduce<Map<string, IntegrationChannelOption[]>>(
        (groups, channel) => {
          const key = channel.parentName ?? ""
          const existing = groups.get(key) ?? []
          existing.push(channel)
          groups.set(key, existing)
          return groups
        },
        new Map()
      )
    )
  }, [filteredChannels, groupByParent])

  if (channels.length === 0) {
    return (
      <div className="px-3.5 py-3">
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground/60">
          <SpinnerGap size={14} className="animate-spin" />
          {loadingLabel}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {channels.length > 8 ? (
        <div className="px-3.5 pb-1 pt-2.5">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter channels..."
            className="h-7 text-xs"
          />
        </div>
      ) : null}

      <div className="max-h-56 overflow-y-auto px-1.5 py-1.5">
        {filteredChannels.length === 0 ? (
          <p className="px-3 py-2 text-[12px] text-muted-foreground/50">
            No channels match &ldquo;{search}&rdquo;
          </p>
        ) : (
          groupedChannels.map(([groupName, groupChannels]) => (
            <div key={groupName || "__ungrouped"}>
              {groupByParent && groupName ? (
                <div className="mb-0.5 mt-1.5 px-2.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/40 first:mt-0">
                  {groupName}
                </div>
              ) : null}
              {groupChannels.map((channel) => {
                const isSelected = selectedChannelIds.includes(channel.id)
                return (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => onToggleChannel(channel.id)}
                    className="flex w-full items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-muted/50"
                  >
                    <span
                      className={`flex size-3.5 shrink-0 items-center justify-center rounded-[6px] border transition-colors ${
                        isSelected
                          ? "border-foreground bg-foreground"
                          : "border-muted-foreground/30"
                      }`}
                    >
                      {isSelected ? (
                        <Check size={10} weight="bold" className="text-background" />
                      ) : null}
                    </span>
                    <Hash size={11} className="text-muted-foreground/50" />
                    <span
                      className={
                        isSelected ? "text-foreground" : "text-muted-foreground"
                      }
                    >
                      {channel.name}
                    </span>
                  </button>
                )
              })}
            </div>
          ))
        )}
      </div>

      <div className="border-t border-border px-3.5 py-1.5">
        <p className="text-[12px] text-muted-foreground/60">
          {selectedChannelIds.length > 0
            ? selectedCountLabel(selectedChannelIds.length)
            : emptySelectionLabel}
        </p>
      </div>
    </div>
  )
}
