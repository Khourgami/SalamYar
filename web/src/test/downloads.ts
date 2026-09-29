import { vi } from 'vitest'

export interface DownloadStub {
  createObjectURL: ReturnType<typeof vi.fn>
  revokeObjectURL: ReturnType<typeof vi.fn>
  /** Every `<a download>` element the app created, in order. */
  anchors: HTMLAnchorElement[]
  click: ReturnType<typeof vi.spyOn>
}

/** jsdom has no `URL.createObjectURL`, and navigation is a no-op — capture both instead. */
export function stubDownloads(): DownloadStub {
  const createObjectURL = vi.fn(() => 'blob:mock-url')
  const revokeObjectURL = vi.fn(() => undefined)
  // A real `URL` subclass, so MSW and React Router can still construct URLs.
  class StubURL extends URL {}
  Object.assign(StubURL, { createObjectURL, revokeObjectURL })
  vi.stubGlobal('URL', StubURL)

  const anchors: HTMLAnchorElement[] = []
  const nativeCreateElement = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(((
    tagName: string,
    options?: ElementCreationOptions,
  ) => {
    const element = nativeCreateElement(tagName, options)
    if (tagName === 'a') anchors.push(element as HTMLAnchorElement)
    return element
  }) as typeof document.createElement)

  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

  return { createObjectURL, revokeObjectURL, anchors, click }
}
