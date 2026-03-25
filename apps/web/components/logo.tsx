import { cn } from "@workspace/ui/lib/utils"

function MedianSymbol({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 260 200"
      fill="currentColor"
      className={className}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M260 0V200H0V0H260ZM60 30V170H200V30H60Z"
      />
    </svg>
  )
}

export function Logo({
  className,
  symbolOnly = false,
}: {
  className?: string
  symbolOnly?: boolean
}) {
  if (symbolOnly) {
    return <MedianSymbol className={cn("h-[1em] w-auto", className)} />
  }

  return (
    <div className={cn("flex items-center", className)}>
      <MedianSymbol className="mr-[0.3em] h-[0.85em] w-auto shrink-0" />
      <span className="font-sans font-black leading-none tracking-tight">
        Median
      </span>
    </div>
  )
}
