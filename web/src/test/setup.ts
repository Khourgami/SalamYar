import '@testing-library/jest-dom/vitest'

import { afterEach, beforeAll } from 'vitest'
import { cleanup } from '@testing-library/react'

/**
 * jsdom has no `ResizeObserver`; recharts' `ResponsiveContainer` needs one. The stub reports a
 * fixed 800×280 box so the chart renders its bars in tests (DESIGN_SYSTEM §5.13).
 */
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    class ResizeObserverStub {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element): void {
        this.callback(
          [
            {
              target,
              contentRect: { width: 800, height: 280 },
            } as unknown as ResizeObserverEntry,
          ],
          this as unknown as ResizeObserver,
        )
      }
      unobserve(): void {}
      disconnect(): void {}
    }
    globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
  }
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})
