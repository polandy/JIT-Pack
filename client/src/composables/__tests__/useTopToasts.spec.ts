// @vitest-environment jsdom
/**
 * G-23 / FR-6.2 — the top of the screen holds one toast at a time.
 *
 * Ionic is a stand-in whose `onDidDismiss` the test resolves by hand: a toast
 * goes away when the test says so, never after six seconds of a real clock.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface StageToast {
  el: HTMLElement
  options: Record<string, unknown>
  dismiss: () => void
}

let toasts: StageToast[] = []
/** What `onDidDismiss` was asked for before `present` ran, per toast. */
let subscribedBeforePresent: boolean[] = []

const create = vi.fn(async (options: Record<string, unknown>) => {
  const el = document.createElement('ion-toast')
  let resolveDismiss: () => void = () => {}
  const didDismiss = new Promise<void>((resolve) => (resolveDismiss = resolve))
  let subscribed = false
  Object.assign(el, {
    onDidDismiss: () => {
      subscribed = true
      return didDismiss
    },
    present: async () => {
      subscribedBeforePresent.push(subscribed)
    },
  })
  toasts.push({ el, options, dismiss: resolveDismiss })
  return el
})

vi.mock('@ionic/vue', () => ({ toastController: { create: (o: never) => create(o) } }))

const { TOP_TOAST_DURATION_MS, useTopToasts } = await import('../useTopToasts')

/** Let the queue's chain of awaits run to its next resting point. */
async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

describe('G-23 top toasts', () => {
  beforeEach(() => {
    toasts = []
    subscribedBeforePresent = []
    create.mockClear()
  })

  it('presents at the top for the top-toast duration', async () => {
    const { presentTopToast } = useTopToasts()
    presentTopToast({ options: { message: 'a' } })
    await settle()
    expect(toasts[0]!.options).toMatchObject({
      message: 'a',
      position: 'top',
      duration: TOP_TOAST_DURATION_MS,
    })
  })

  it('creates a second toast only once the first is dismissed', async () => {
    const { presentTopToast } = useTopToasts()
    presentTopToast({ options: { message: 'a' } })
    presentTopToast({ options: { message: 'b' } })
    await settle()
    expect(toasts.map((t) => t.options.message)).toEqual(['a'])

    toasts[0]!.dismiss()
    await settle()
    expect(toasts.map((t) => t.options.message)).toEqual(['a', 'b'])
  })

  it('runs onDismissed after the dismissal, never while the toast waits or is on screen', async () => {
    const { presentTopToast } = useTopToasts()
    const first = vi.fn()
    const second = vi.fn()
    presentTopToast({ options: { message: 'a' }, onDismissed: first })
    presentTopToast({ options: { message: 'b' }, onDismissed: second })
    await settle()
    expect(first).not.toHaveBeenCalled()

    toasts[0]!.dismiss()
    await settle()
    expect(first).toHaveBeenCalledOnce()
    expect(second).not.toHaveBeenCalled()
  })

  it('listens for the dismissal before presenting, so one during the enter animation is heard', async () => {
    const { presentTopToast } = useTopToasts()
    presentTopToast({ options: { message: 'a' } })
    await settle()
    expect(subscribedBeforePresent).toEqual([true])
  })

  it('marks the toast on screen with how many wait behind it, as they arrive', async () => {
    const { presentTopToast } = useTopToasts()
    presentTopToast({ options: { message: 'a' } })
    await settle()
    expect(toasts[0]!.el.getAttribute('data-waiting')).toBe('0')
    expect(toasts[0]!.el.getAttribute('data-presented')).toBe('true')

    presentTopToast({ options: { message: 'b' } })
    expect(toasts[0]!.el.getAttribute('data-waiting')).toBe('1')

    toasts[0]!.dismiss()
    await settle()
    expect(toasts[1]!.el.getAttribute('data-waiting')).toBe('0')
  })
})
