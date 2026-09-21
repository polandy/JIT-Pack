// @vitest-environment jsdom
/**
 * M4's pack snackbar (FR-25.2 for the pack, FR-5.5/FR-20.2 for the skip).
 *
 * The two rules worth stating here are both invisible from the screen, which
 * is why they lived for months as comments rather than cases:
 *
 *  - **A second pack keeps its own undo.** The outgoing toast resolves its
 *    dismissal *after* the incoming one has armed a new record, so clearing
 *    the reference in the wrong order disarms the undo the user is looking at.
 *  - **A snackbar whose screen is gone is never presented.** `create` is
 *    awaited, and leaving inside that window used to put the confirmation —
 *    with an undo for a trip nobody is on any more — over the next screen.
 *    The view called this "guarded rather than covered by a case"; from a
 *    composable it is one `unmount()` away.
 *
 * The jsdom docblock is load-bearing: `onUnmounted` needs a mounted instance.
 */
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { t } from '@/i18n'

/** One created toast, with both of its promises under the test's control. */
interface FakeToast {
  present: ReturnType<typeof vi.fn>
  dismiss: ReturnType<typeof vi.fn>
  options: Record<string, never>
  /** Resolve `onDidDismiss()`, i.e. the snackbar has gone. */
  fireDismiss: () => void
}

let toasts: FakeToast[] = []
/** `create` resolvers, held so a test can leave the screen mid-await. */
let pendingCreates: Array<() => void> = []

const create = vi.fn((options: Record<string, never>) => {
  let fireDismiss = () => {}
  const dismissed = new Promise<void>((resolve) => {
    fireDismiss = () => resolve()
  })
  const toast: FakeToast = {
    present: vi.fn(async () => {}),
    dismiss: vi.fn(async () => {}),
    options,
    fireDismiss,
  }
  Object.assign(toast, { onDidDismiss: () => dismissed })
  toasts.push(toast)
  return new Promise((resolve) => pendingCreates.push(() => resolve(toast)))
})

vi.mock('@ionic/vue', () => ({ toastController: { create: (o: never) => create(o) } }))

const { usePackAnnouncer } = await import('../usePackAnnouncer')
const { FAB_ANCHOR } = await import('@/lib/fabAnchors')
const { TOAST_DURATION_MS } = await import('@/lib/toast')

/** Let every awaited `toastController.create` resolve. */
function settleCreates(): void {
  const waiting = pendingCreates
  pendingCreates = []
  for (const resolve of waiting) resolve()
}

type Announcer = ReturnType<typeof usePackAnnouncer>

function mountAnnouncer(anchor?: string | null): { api: Announcer; unmount: () => void } {
  let api!: Announcer
  const wrapper = mount(
    defineComponent({
      setup() {
        api = anchor === undefined ? usePackAnnouncer() : usePackAnnouncer(anchor)
        return () => null
      },
    }),
  )
  return { api, unmount: () => wrapper.unmount() }
}

/** Announce and let the awaited creation through, as a screen would. */
async function announce(api: Announcer, name: string): Promise<void> {
  const done = api.announcePacked(name)
  settleCreates()
  await done
}

const row = { id: 'i1', name: 'Zelt', quantity: 1, packed_count: 0, state: 'open' }

beforeEach(() => {
  create.mockClear()
  toasts = []
  pendingCreates = []
})

describe('usePackAnnouncer — the snackbar (FR-25.2)', () => {
  it('names the packed row and counts the announcement', async () => {
    const { api } = mountAnnouncer()

    await announce(api, 'Zelt')

    expect(create.mock.calls[0]![0]!.message).toBe(t('packing.packedToast', { name: 'Zelt' }))
    expect(toasts[0]!.present).toHaveBeenCalledOnce()
    expect(api.packAnnouncements.value).toBe(1)
  })

  it('gives the snackbar a lifetime and the FAB anchor — it bypasses presentToast', async () => {
    const { api } = mountAnnouncer()

    await announce(api, 'Zelt')

    const options = create.mock.calls[0]![0]!
    expect(options.duration).toBe(TOAST_DURATION_MS)
    expect(options.position).toBe('bottom')
    expect(options.positionAnchor).toBe(FAB_ANCHOR.m4)
  })

  /*
   * FR-7.7: a screen without a FAB names no anchor, and the snackbar then
   * sits where a snackbar sits. Anchoring to an element that is not on the
   * page is not a cosmetic mistake — Ionic positions the toast off the
   * viewport, where it is visible, enabled, stable and **unclickable**, so
   * the undo exists and cannot be reached (found by E2E-M25-02, which is
   * where M25 first raised one).
   *
   * `null` rather than `undefined` on purpose: a default parameter takes its
   * default when you pass `undefined`, which is how the first fix for that
   * defect silently did nothing at all.
   */
  it('leaves the anchor out where the screen has no FAB to sit above', async () => {
    const { api } = mountAnnouncer(null)

    await announce(api, 'Zelt')

    const options = create.mock.calls[0]![0]!
    expect(options.positionAnchor).toBeUndefined()
    // The rest of the snackbar is unchanged: it is the same snackbar, on a
    // screen that simply has nothing for it to stand above.
    expect(options.position).toBe('bottom')
    expect(options.duration).toBe(TOAST_DURATION_MS)
  })

  it('offers the armed undo behind its button', async () => {
    const { api } = mountAnnouncer()
    const restore = vi.fn()
    api.rowUndo.actWithUndo([row] as never, () => {}, restore)

    await announce(api, 'Zelt')
    const buttons = create.mock.calls[0]![0]!.buttons as unknown as Array<{
      text: string
      handler: () => void
    }>
    const button = buttons[0]!
    button.handler()

    expect(button.text).toBe(t('packing.undo'))
    expect(restore).toHaveBeenCalledOnce()
  })

  it('disarms the undo when its own snackbar goes', async () => {
    const { api } = mountAnnouncer()
    const restore = vi.fn()
    api.rowUndo.actWithUndo([row] as never, () => {}, restore)
    await announce(api, 'Zelt')

    toasts[0]!.fireDismiss()
    await Promise.resolve()

    expect(api.rowUndo.pending.value).toEqual([])
  })

  it('leaves the second pack armed when the first snackbar reports its dismissal late', async () => {
    // The ordering this composable exists to pin: `dismiss()` on the outgoing
    // toast resolves *after* the new one is armed, so a handler that does not
    // check its own identity disarms the undo the user is being offered.
    const { api } = mountAnnouncer()
    await announce(api, 'Zelt')
    const restore = vi.fn()
    api.rowUndo.actWithUndo([row] as never, () => {}, restore)
    await announce(api, 'Schlafsack')

    toasts[0]!.fireDismiss()
    await Promise.resolve()

    expect(toasts[0]!.dismiss).toHaveBeenCalledOnce()
    expect(api.rowUndo.pending.value).toHaveLength(1)
  })
})

describe('usePackAnnouncer — the skip (FR-5.5, FR-20.2)', () => {
  it('names the companions a cascade took along', async () => {
    const { api } = mountAnnouncer()

    const done = api.announceSkipped('Zelt', ['Hering', 'Gestänge'])
    settleCreates()
    await done

    // Asserted as the key's own rendering rather than as English copy: what
    // has logic here is which of the two messages the branch picks.
    expect(create.mock.calls[0]![0]!.message).toBe(
      t('packing.skippedToastWith', { name: 'Zelt', companions: 'Hering, Gestänge' }),
    )
  })

  it('says nothing about companions when the skip took none', async () => {
    const { api } = mountAnnouncer()

    const done = api.announceSkipped('Zelt', [])
    settleCreates()
    await done

    expect(create.mock.calls[0]![0]!.message).toBe(t('packing.skippedToast', { name: 'Zelt' }))
  })
})

describe('usePackAnnouncer — the removal (FR-5.8)', () => {
  it('names the removed row, behind the same undo button', async () => {
    const { api } = mountAnnouncer()

    const done = api.announceRemoved('Zelt')
    settleCreates()
    await done

    const options = create.mock.calls[0]![0]!
    expect(options.message).toBe(t('packing.removedToast', { name: 'Zelt' }))
    expect(options.buttons).toEqual([expect.objectContaining({ text: t('packing.undo') })])
  })
})

describe('usePackAnnouncer — leaving the screen', () => {
  it('never presents a snackbar whose screen was left while it was being created', async () => {
    const { api, unmount } = mountAnnouncer()

    const done = api.announcePacked('Zelt')
    unmount()
    settleCreates()
    await done

    expect(toasts[0]!.present).not.toHaveBeenCalled()
    expect(toasts[0]!.dismiss).toHaveBeenCalledOnce()
    // The counter is the positive signal the absence is read against: it moves
    // for every snackbar that reaches the screen, so a zero here is a claim
    // that can fail rather than one that cannot.
    expect(api.packAnnouncements.value).toBe(0)
  })

  it('dismisses the standing snackbar and disarms its undo on the way out', async () => {
    const { api, unmount } = mountAnnouncer()
    const restore = vi.fn()
    api.rowUndo.actWithUndo([row] as never, () => {}, restore)
    await announce(api, 'Zelt')

    unmount()

    expect(toasts[0]!.dismiss).toHaveBeenCalledOnce()
    expect(api.rowUndo.pending.value).toEqual([])
  })
})

describe('usePackAnnouncer — a ticked-off task (FR-7.3, FR-7.4)', () => {
  it('offers the undo on the same snackbar a pack does', async () => {
    const { api } = mountAnnouncer()
    const restore = vi.fn()
    api.rowUndo.armAction('Pass erneuern', restore)

    const done = api.announceTaskDone('Pass erneuern')
    settleCreates()
    await done

    expect(toasts[0]!.options['message']).toBe(
      t('packing.taskDoneToast', { body: 'Pass erneuern' }),
    )
    const buttons = toasts[0]!.options['buttons'] as unknown as Array<{ handler: () => void }>
    buttons[0]!.handler()

    expect(restore).toHaveBeenCalledOnce()
  })
})

describe('usePackAnnouncer — any other act (FR-25.31)', () => {
  it("says the caller's sentence behind the same undo button", async () => {
    const { api } = mountAnnouncer()
    const restore = vi.fn()
    api.rowUndo.armAction('Zelt', restore)

    const done = api.announceAct('„Zelt“: Menge 3')
    settleCreates()
    await done

    expect(toasts[0]!.options['message']).toBe('„Zelt“: Menge 3')
    expect(toasts[0]!.options['cssClass']).toBe('pack-toast')
    expect(api.packAnnouncements.value).toBe(1)
    const buttons = toasts[0]!.options['buttons'] as unknown as Array<{ handler: () => void }>
    buttons[0]!.handler()
    expect(restore).toHaveBeenCalledOnce()
  })
})
