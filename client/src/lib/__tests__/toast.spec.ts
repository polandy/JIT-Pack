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

/**
 * A stand-in that is a real element, because the settled flag below is an
 * attribute: an object literal would let `dataset` be asserted against
 * something no browser would have produced. `present` records what the
 * attribute was *while it ran*, which is the only way to pin that the flag
 * goes on afterwards rather than before.
 */
let presentedDuringPresent: string | null = null

const create = vi.fn(async (options: Record<string, unknown>) => {
  const el = document.createElement('ion-toast')
  Object.assign(el, {
    options,
    present: vi.fn(async () => {
      presentedDuringPresent = el.getAttribute('data-presented')
    }),
  })
  return el
})

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
  presentedDuringPresent = null
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
    await presentToast({ message: 'gespeichert', positionAnchor: 'some-fab' })
    expect(create.mock.calls[0]![0]!.positionAnchor).toBe('some-fab')
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
 * The settled signal E2E-M22-09 measures against.
 *
 * Ionic's `present()` resolves once the enter animation has played, so the
 * moment after it is the first moment the toast's box is the box a reader
 * sees. Before that the wrapper is still translating and measures somewhere
 * it will not stay. Waiting on
 * `document.getAnimations().every(a => a.playState !== 'running')` instead
 * is no wait at all: it is true *before* the enter animation is created as
 * well as after it finishes, and an assertion that cannot fail flakes.
 *
 * `SheetModal` carries `data-presented` for exactly this reason; this is the
 * same flag on the one toast funnel.
 */
describe('the toast says when it has finished arriving', () => {
  it('carries no settled flag while the enter animation is still playing', async () => {
    await presentToast({ message: 'gespeichert' })
    expect(presentedDuringPresent).toBeNull()
  })

  it('marks itself presented once the enter animation has played', async () => {
    const el = await presentToast({ message: 'gespeichert' })
    expect(el.getAttribute('data-presented')).toBe('true')
  })
})

/**
 * The default only reaches a toast that goes through `presentToast`. M4's
 * snackbar deliberately does not — it is created, checked and armed before
 * it is presented — so it has to name a lifetime itself; without one it sits
 * over the row menu until the page moves (E2E-M4-39).
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
