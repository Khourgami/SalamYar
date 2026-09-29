import clsx from 'clsx'
import type { ClassValue } from 'clsx'

/** Small wrapper so the primitives read the same way. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs)
}
