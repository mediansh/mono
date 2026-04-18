type SkeletonProps = {
  className?: string
  style?: React.CSSProperties
}

function Skeleton({ className = "", style }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-sidebar-accent ${className}`}
      style={style}
    />
  )
}

export function SkeletonWall() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-64" />
        </div>
        <Skeleton className="h-7 w-28" />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-0 border border-sidebar-border bg-sidebar/30 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={`flex flex-col gap-2 px-4 py-3 ${i < 3 ? "border-r border-sidebar-border" : ""}`}
          >
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-2 w-24" />
          </div>
        ))}
      </div>

      <div className="mb-5 grid gap-3 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="border border-sidebar-border bg-sidebar/30 p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-[180px] w-full" />
          </div>
        ))}
      </div>

      <div className="mb-5 border border-sidebar-border bg-sidebar/30 p-3">
        <div className="mb-2 flex items-center justify-between">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-40" />
        </div>
        <Skeleton className="h-[220px] w-full" />
      </div>

      <div className="mb-5">
        <Skeleton className="mb-2 h-3 w-24" />
        <div className="overflow-hidden border border-sidebar-border">
          <div className="grid grid-cols-[1.6fr_80px_80px_80px_100px] gap-2 border-b border-sidebar-border bg-sidebar/50 px-3 py-2">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-2.5 w-10 justify-self-end" />
            <Skeleton className="h-2.5 w-10 justify-self-end" />
            <Skeleton className="h-2.5 w-10 justify-self-end" />
            <Skeleton className="h-2.5 w-14 justify-self-end" />
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-[1.6fr_80px_80px_80px_100px] items-center gap-2 border-b border-sidebar-border px-3 py-2 last:border-b-0"
            >
              <div className="flex items-center gap-2">
                <Skeleton className="size-1.5" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-3 w-8 justify-self-end" />
              <Skeleton className="h-3 w-8 justify-self-end" />
              <Skeleton className="h-3 w-8 justify-self-end" />
              <Skeleton className="h-3 w-10 justify-self-end" />
            </div>
          ))}
        </div>
      </div>

      <div>
        <Skeleton className="mb-2 h-3 w-32" />
        <div className="border border-sidebar-border">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex gap-3 border-b border-sidebar-border px-3 py-2.5 last:border-b-0"
            >
              <Skeleton className="mt-0.5 size-6 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-2 w-24" />
                </div>
                <Skeleton className="h-3 w-full max-w-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
