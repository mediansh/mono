import Image from "next/image"

export function Logo({ className }: { className?: string }) {
  return (
    <Image
      src="/median-full.png"
      alt="Median"
      width={260}
      height={200}
      className={`h-5 w-auto dark:invert ${className ?? ""}`}
      priority
    />
  )
}
