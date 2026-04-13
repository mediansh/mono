type DiscordLogoProps = {
  size?: number | string
  className?: string
  weight?: string
}

export function DiscordLogoIcon({ size = 24, className }: DiscordLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      stroke="currentColor"
      strokeWidth="16"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* Main body */}
      <path d="M72 176s-32-12-40-36c0 0-8-40 0-76 0 0 24-20 48-24l8 16s20-6 40-6 40 6 40 6l8-16c24 4 48 24 48 24 8 36 0 76 0 76-8 24-40 36-40 36l-12-16s-20 8-44 8-44-8-44-8Z" />
      {/* Left eye */}
      <circle cx="100" cy="140" r="16" fill="currentColor" stroke="none" />
      {/* Right eye */}
      <circle cx="156" cy="140" r="16" fill="currentColor" stroke="none" />
    </svg>
  )
}
