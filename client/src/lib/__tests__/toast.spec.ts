// @vitest-environment jsdom
/**
 * FR-9.4: a bottom toast must never be presented onto the tab bar.
 *
 * The rule is asserted on what reaches Ionic — the options object — rather
 * than on geometry, which belongs to E2E-M22-09. What a unit test can pin
 * here is the decision: which anchor is chosen, and when none is.
 *
 * The jsdom docblock above is load-bearing: the helper asks the document for
 * the tab bar, and since the suite made a DOM opt-in a missing declaration is
 * a `ReferenceError` here rather than a quietly green run.
 */
import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect, vi, beforeEach } from 'vitest'

const create = vi.fn(async (options: Record<string, unknown>) => ({
  present: vi.fn(async () => {}),
  options,
}))

vi.mock('@ionic/vue', () => ({ toastController: { create: (o: never) => create(o) } }))

const { TAB_BAR_ANCHOR_ID, TOAST_DURATION_MS, presentToast } = await import('../toast')

/** A tab bar that is actually laid out — jsdom reports 0 unless told otherwise. */
function mountTabBar(height: number): HTMLElement {
  const nav = document.createElement('nav')
  nav.id = TAB_BAR_ANCHOR_ID
  nav.getBoundingClientRect = () => ({ height }) as DOMRect
  document.body.append(nav)
  return nav
}

beforeEach(() => {
  create.mockClear()
  document.body.innerHTML = ''
})

describe('presentToast', () => {
  it('anchors a bottom toast to the tab bar so it clears the navigation', async () => {
    const nav = mountTabBar(56)
    await presentToast({ message: 'gespeichert' })
    expect(create.mock.calls[0]![0]!.positionAnchor).toBe(nav)
    expect(create.mock.calls[0]![0]!.position).toBe('bottom')
  })

  it('gives a toast the shared duration when the caller names none (U-4)', async () => {
    await presentToast({ message: 'gespeichert' })
    expect(create.mock.calls[0]![0]!.duration).toBe(TOAST_DURATION_MS)
  })

  it('leaves a caller-named duration alone — a toast with an action needs longer', async () => {
    await presentToast({ message: 'gespeichert', duration: 6000 })
    expect(create.mock.calls[0]![0]!.duration).toBe(6000)
  })

  it('leaves a caller-named anchor alone — a FAB sits higher than the bar', async () => {
    mountTabBar(56)
    await presentToast({ message: 'gespeichert', positionAnchor: 'm4-fab-anchor' })
    expect(create.mock.calls[0]![0]!.positionAnchor).toBe('m4-fab-anchor')
  })

  it('anchors nothing when the tab bar is not rendered (M4 is full-screen)', async () => {
    await presentToast({ message: 'gespeichert' })
    expect(create.mock.calls[0]![0]!.positionAnchor).toBeUndefined()
  })

  /*
   * Above 900 px the bar is `display: none` (G-9 hands the job to the rail).
   * Ionic measures a hidden anchor as a zeroed box and subtracts a whole
   * viewport height from the offset, which throws the toast off screen — so a
   * hidden bar has to be treated as no bar at all, not merely as one of
   * height zero.
   */
  it('anchors nothing when the tab bar is present but not laid out', async () => {
    mountTabBar(0)
    await presentToast({ message: 'gespeichert' })
    expect(create.mock.calls[0]![0]!.positionAnchor).toBeUndefined()
  })

  it('never anchors a top toast — the bar is at the other edge', async () => {
    mountTabBar(56)
    await presentToast({ message: 'offline', position: 'top' })
    expect(create.mock.calls[0]![0]!.positionAnchor).toBeUndefined()
    expect(create.mock.calls[0]![0]!.position).toBe('top')
  })

  it('presents the toast it created', async () => {
    const el = await presentToast({ message: 'gespeichert' })
    expect(el.present).toHaveBeenCalled()
  })
})

/**
 * The default only reaches a toast that goes through `presentToast`. M4's
 * snackbar deliberately does not — it is created, checked and armed before
 * it is presented — so it has to name a lifetime itself, and when it lost
 * one it sat over the row menu until the page moved (found by E2E-M4-39,
 * not by any unit test).
 */
describe('a toast created outside the helper names its own duration', () => {
  const sources = globSync('src/**/*.{ts,vue}', { cwd: process.cwd() })
    .map((path) => path.replace(/\\/g, '/'))
    .filter((path) => path !== 'src/lib/toast.ts' && !path.includes('__tests__/'))
    .map((path) => ({ path, source: readFileSync(resolve(process.cwd(), path), 'utf8') }))

  it('finds the sources to check at all', () => {
    expect(sources.length).toBeGreaterThan(100)
  })

  it('leaves no direct creation without a duration', () => {
    const offenders = sources.flatMap(({ path, source }) => {
      const hits: string[] = []
      const create = /toastController\.create\(\{/g
      let match: RegExpExecArray | null
      while ((match = create.exec(source)) !== null) {
        // The options object ends at its closing brace; nesting here is one
        // level deep at most (`buttons: [{ … }]`), which the counter handles.
        let depth = 0
        let end = match.index + match[0].length - 1
        for (; end < source.length; end += 1) {
          if (source[end] === '{') depth += 1
          else if (source[end] === '}' && (depth -= 1) === 0) break
        }
        const options = source.slice(match.index, end)
        if (!/\bduration:/.test(options)) {
          hits.push(`${path}:${source.slice(0, match.index).split('\n').length}`)
        }
      }
      return hits
    })
    expect(offenders).toEqual([])
  })
})
