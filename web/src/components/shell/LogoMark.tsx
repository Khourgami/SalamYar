/**
 * DESIGN_SYSTEM §4.4 — a heart outline with a pulse line, 32×32 by default.
 * Decorative only: the app name next to it is the accessible text.
 */
export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      data-testid="logo-mark"
      className={className}
    >
      <path
        d="M16 27.5C16 27.5 5.5 21 5.5 13.5A5.9 5.9 0 0 1 16 9.6a5.9 5.9 0 0 1 10.5 3.9C26.5 21 16 27.5 16 27.5Z"
        stroke="var(--color-primary-600)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <polyline
        points="6.5,16 11,16 13,11.5 16,21 18.5,16 25.5,16"
        stroke="var(--color-accent-500)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
