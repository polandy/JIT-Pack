// @vitest-environment jsdom
/**
 * The thumbnail owns an object URL's lifetime (FR-22.1), and an object URL
 * is the one thing in this client that a component can leak: nothing else
 * holds a handle to it once the ref has moved on.
 *
 * Both cases here are the *second* answer arriving — a superseded one and
 * one that outlived the component. Neither is a rare shape: M9 renders a
 * thumbnail per row, so a filter keystroke changes the item under a mount
 * while its predecessor is still reading IndexedDB, and scrolling the list
 * unmounts rows mid-read by design.
 *
 * The positive signal both cases assert against is `URL.revokeObjectURL` —
 * an absence needs one, and "no leak" is otherwise green by construction.
 */
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ItemThumbnail from '../ItemThumbnail.vue'
import type { MasterItem } from '@/types/domain'
import { ORCHESTRATOR } from '@/composables/useOrchestrator'

function item(over: Partial<MasterItem> = {}): MasterItem {
  return {
    id: 'i-1',
    name: 'Zahnbürste',
    icon: null,
    image_hash: 'hash-1',
    weight_grams: null,
    value_cents: null,
    ...over,
  }
}

/** An orchestrator whose reads are resolved by the test, one at a time. */
function deferred() {
  const pending: Array<(url: string) => void> = []
  return {
    /** How many reads this mount has started. */
    started: () => pending.length,
    /** Answer the nth read — the order is the point in two of the cases. */
    answer: (nth: number, url: string) => {
      const resolve = pending[nth]
      if (!resolve) throw new Error(`no read #${nth} was started`)
      resolve(url)
    },
    orchestrator: {
      itemImageUrl: () => new Promise<string>((resolve) => pending.push(resolve)),
    },
  }
}

let revoked: string[]

beforeEach(() => {
  revoked = []
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: () => 'blob:unused',
    revokeObjectURL: (u: string) => revoked.push(u),
  })
})

describe('ItemThumbnail — the answer that arrives second (FR-22.1)', () => {
  it('renders the photo the current item resolves to', async () => {
    const { answer, orchestrator } = deferred()
    const w = mount(ItemThumbnail, {
      props: { item: item() },
      global: { provide: { [ORCHESTRATOR]: orchestrator } },
    })

    answer(0, 'blob:one')
    await w.vm.$nextTick()
    await w.vm.$nextTick()

    expect(w.get('img').attributes('src')).toBe('blob:one')
  })

  it('drops a resolution its item has already been replaced, and revokes it', async () => {
    const { started, answer, orchestrator } = deferred()
    const w = mount(ItemThumbnail, {
      props: { item: item() },
      global: { provide: { [ORCHESTRATOR]: orchestrator } },
    })

    await w.setProps({ item: item({ id: 'i-2', image_hash: 'hash-2' }) })
    expect(started()).toBe(2)

    // The second read finishes first — the ordinary case for two IndexedDB
    // reads of different sizes, and the one the unfixed build painted wrong.
    answer(1, 'blob:current')
    await w.vm.$nextTick()
    answer(0, 'blob:stale')
    await w.vm.$nextTick()
    await w.vm.$nextTick()

    expect(w.get('img').attributes('src')).toBe('blob:current')
    expect(revoked).toEqual(['blob:stale'])
  })

  it('revokes a resolution that arrives after the row it belonged to is gone', async () => {
    const { answer, orchestrator } = deferred()
    const w = mount(ItemThumbnail, {
      props: { item: item() },
      global: { provide: { [ORCHESTRATOR]: orchestrator } },
    })

    w.unmount()
    answer(0, 'blob:orphan')
    await Promise.resolve()
    await Promise.resolve()

    expect(revoked).toEqual(['blob:orphan'])
  })

  it('leaves a plain URL alone — Server Mode hands out no blob to revoke', async () => {
    const { answer, orchestrator } = deferred()
    const w = mount(ItemThumbnail, {
      props: { item: item() },
      global: { provide: { [ORCHESTRATOR]: orchestrator } },
    })

    w.unmount()
    answer(0, '/api/v1/items/i-1/image')
    await Promise.resolve()
    await Promise.resolve()

    expect(revoked).toEqual([])
  })
})
