/** Plate mark: a ring (the plate) with a quarter-arc fill (the portion). */
export function Logo({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="var(--ink)" />
      <circle cx="16" cy="16" r="8.5" fill="none" stroke="var(--page)" strokeOpacity="0.28" strokeWidth="3" />
      <path d="M16 7.5a8.5 8.5 0 0 1 8.5 8.5" fill="none" stroke="var(--energy-track)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="16" cy="16" r="2.25" fill="var(--page)" />
    </svg>
  )
}
