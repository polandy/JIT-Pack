// @vitest-environment jsdom
/**
 * What a session ending has to do, and in which order (ADR-007, ADR-047).
 *
 * It lived in `App.vue`'s setup, which is to say nowhere a test could reach:
 * the root component mounts the whole app. The two effects are handed in, so
 * the rule is a function.
 *
 * **Every case takes a fresh module graph**, because `refresh.ts` keeps the
 * "already ended" latch in module state and never resets it — deliberately,
 * since a new session is only ever entered through a full reload. One
 * `endSession()` would otherwise fire every later case's handler at the
 * moment it is attached.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
})

/** A fresh `sessionEnd` and the `refresh` it is bound to, from one registry. */
async function freshModules() {
  const [{ clearOnSessionEnd }, { endSession }] = await Promise.all([
    import('../sessionEnd'),
    import('../refresh'),
  ])
  return { clearOnSessionEnd, endSession }
}

describe('a session that ends', () => {
  it('forgets the identity before it navigates, never after', async () => {
    const { clearOnSessionEnd, endSession } = await freshModules()
    const order: string[] = []
    const stop = clearOnSessionEnd({
      forget: () => order.push('forget'),
      toLogin: () => order.push('login'),
    })

    endSession()

    // The order is the assertion: a login rendered while the previous viewer
    // is still cached is the frame this exists to make impossible.
    expect(order).toEqual(['forget', 'login'])
    stop()
  })

  /*
   * The latch (#324): the request that ends a session is sent from a child's
   * `onMounted`, which runs before the root's, so the handler can be attached
   * *after* the end has already fired. Both effects still have to run — this
   * is the clause that was a product defect the first time round.
   */
  it('reaches a handler attached after the session had already ended', async () => {
    const { clearOnSessionEnd, endSession } = await freshModules()
    endSession()

    const order: string[] = []
    const stop = clearOnSessionEnd({
      forget: () => order.push('forget'),
      toLogin: () => order.push('login'),
    })

    expect(order).toEqual(['forget', 'login'])
    stop()
  })

  it('stops reaching a handler that was disposed', async () => {
    const { clearOnSessionEnd, endSession } = await freshModules()
    const order: string[] = []
    const stop = clearOnSessionEnd({
      forget: () => order.push('forget'),
      toLogin: () => order.push('login'),
    })
    stop()

    endSession()

    expect(order).toEqual([])
  })
})
