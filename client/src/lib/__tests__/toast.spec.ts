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
import { describe, it, expect, vi, beforeEach } from 'vitest'

const create = vi.fn(async (options: Record<string, unknown>) => ({
  present: vi.fn(async () => {}),
  options,
}))

vi.mock('@ionic/vue', () => ({ toastController: { create: (o: never) => create(o) } }))

const { TAB_BAR_ANCHOR_ID, presentToast } = await import('../toast')

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
