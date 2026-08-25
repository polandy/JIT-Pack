/**
 * "Tell me when this element is first on screen, once per key" (ADR-033).
 *
 * It exists so a list can fetch what a *visible* row needs instead of what
 * every row might need: M2's progress ring reads a trip's own rows, and
 * loading all of them on mount costs the whole archive on every visit while
 * loading none of them made the ring say `0/0`.
 *
 * The observer is injected rather than constructed, for the usual reason and
 * one specific one: jsdom has no `IntersectionObserver`, so the fallback path
 * below is not hypothetical — it is what the unit tests run on by default.
 */

/** The part of `IntersectionObserver` this uses, so a test can supply it. */
export interface VisibilityObserver {
  observe(el: Element): void
  unobserve(el: Element): void
  disconnect(): void
}

/** What the observer reports back; a subset of `IntersectionObserverEntry`. */
interface VisibilityEntry {
  target: Element
  isIntersecting: boolean
}

/** Returns null where the browser has none, which the fallback answers. */
function browserObserver(
  callback: (entries: VisibilityEntry[]) => void,
): VisibilityObserver | null {
  if (typeof IntersectionObserver === 'undefined') return null
  return new IntersectionObserver((entries) => callback(entries))
}

export interface OnFirstVisible {
  /** Watch `el`; `key` is reported once, the first time it is on screen. */
  observe(el: Element, key: string): void
  /** Stop watching everything — the screen is going away. */
  stop(): void
}

export function useOnFirstVisible(
  onVisible: (key: string) => void,
  createObserver: (
    callback: (entries: VisibilityEntry[]) => void,
  ) => VisibilityObserver | null = browserObserver,
): OnFirstVisible {
  const keys = new WeakMap<Element, string>()
  const reported = new Set<string>()

  const report = (el: Element) => {
    const key = keys.get(el)
    if (key === undefined || reported.has(key)) return
    reported.add(key)
    observer?.unobserve(el)
    onVisible(key)
  }

  const observer = createObserver((entries) => {
    for (const entry of entries) if (entry.isIntersecting) report(entry.target)
  })

  return {
    observe(el, key) {
      keys.set(el, key)
      // No observer means no way to tell what is on screen. Reporting
      // everything costs the requests this exists to save; reporting nothing
      // would leave the screen wrong, which is the worse of the two.
      if (!observer) {
        report(el)
        return
      }
      observer.observe(el)
    },
    stop() {
      observer?.disconnect()
    },
  }
}
