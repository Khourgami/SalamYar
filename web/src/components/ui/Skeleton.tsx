import { cn } from '@/components/ui/cn'

/**
 * DESIGN_SYSTEM §5.9 — `neutral-100` block with a gentle opacity pulse.
 * The `prefers-reduced-motion` rule in `index.css` disables the animation.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      data-testid="skeleton"
      className={cn('animate-pulse rounded-md bg-neutral-100', className)}
    />
  )
}
