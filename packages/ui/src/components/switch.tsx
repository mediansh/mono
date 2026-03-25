import * as React from "react"
import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@workspace/ui/lib/utils"

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "group relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border bg-muted transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:bg-foreground data-[checked]:border-foreground",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block size-3.5 rounded-full bg-muted-foreground/60 transition-transform translate-x-0.5 group-data-[checked]:translate-x-[18px] group-data-[checked]:bg-background"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
