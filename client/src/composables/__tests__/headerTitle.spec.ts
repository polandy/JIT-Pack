// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import { mount } from '@vue/test-utils'
import {
  clearHeadFor,
  headFor,
  resolveHead,
  setHeadFor,
  setHeaderTitle,
} from '@/composables/useHeaderTitle'
import { setLocale } from '@/i18n'

const PATH = '/trips/t1/shopping'
vi.mock('vue-router', () => ({ useRoute: () => ({ path: PATH }) }))

/**
 * ADR-011. The ordering these tests pin down is not hypothetical: Ionic
 * keeps the outgoing page mounted through the route transition, so its
 * unmount hook runs *after* the incoming page has registered its head.
 * A single shared slot loses the new head to the page that just left —
 * which is exactly how M4 rendered with an empty header.
 */
describe('page heads are keyed by route path', () => {
  beforeEach(() => {
    clearHeadFor('/trips/t1')
    clearHeadFor('/trips/new')
    clearHeadFor('/trips/t2')
  })

  it('returns null for a path nobody registered', () => {
    expect(headFor('/trips/t1')).toBeNull()
  })

  it('keeps each path independent', () => {
    setHeadFor('/trips/new', 'New trip', 'Step 1 of 4')
    setHeadFor('/trips/t1', 'Samedan 2026', null)

    expect(headFor('/trips/new')).toEqual({ title: 'New trip', meta: 'Step 1 of 4' })
    expect(headFor('/trips/t1')).toEqual({ title: 'Samedan 2026', meta: null })
  })

  it('a late unmount of the previous page does not wipe the current head', () => {
    setHeadFor('/trips/new', 'New trip', 'Step 4 of 4')
    setHeadFor('/trips/t1', 'Samedan 2026', null) // the incoming page

    clearHeadFor('/trips/new') // the outgoing page unmounts, afterwards

    expect(headFor('/trips/t1')?.title).toBe('Samedan 2026')
  })

  it('clears its own path so a stale head cannot outlive its page', () => {
    setHeadFor('/trips/t1', 'Samedan 2026', null)

    clearHeadFor('/trips/t1')

    expect(headFor('/trips/t1')).toBeNull()
  })

  it('treats an empty title as no head rather than storing a blank', () => {
    setHeadFor('/trips/t1', '', 'Samedan 2026')

    expect(headFor('/trips/t1')).toBeNull()
  })
})

/**
 * ADR-050: the frame asks one question — what should stand above this
 * outlet — and the answer has three cases. Stating it here rather than in
 * `App.vue` is what lets the header bar read the same answer.
 */
describe('resolveHead answers what the frame renders', () => {
  beforeEach(() => clearHeadFor('/trips/t1/shopping'))

  it('prefers the head the page registered over the route table', () => {
    setHeadFor('/trips/t1/shopping', 'Shopping', 'Samedan 2026')

    expect(resolveHead('/trips/t1/shopping', 'container.title')).toEqual({
      title: 'Shopping',
      meta: 'Samedan 2026',
    })
  })

  it('falls back to the route table title, with no meta line', () => {
    expect(resolveHead('/trips/t1/shopping', 'container.title')).toEqual({
      title: 'Luggage',
      meta: null,
    })
  })

  /**
   * NFR-4.12: the route table stores a catalogue key, so the head every
   * screen shares speaks the chosen language. It used to store the English
   * text, which no language switch could reach.
   */
  it('renders the route table title in the active locale', () => {
    setLocale('de')
    try {
      expect(resolveHead('/trips/t1/shopping', 'container.title')?.title).toBe('Gepäck')
    } finally {
      setLocale('en')
    }
  })

  it('answers nothing for a screen with neither — a tab root', () => {
    expect(resolveHead('/tabs/trips')).toBeNull()
  })
})

/**
 * The composable itself, driven through a component, because the registry
 * cases above call `setHeadFor` directly and would stay green with the meta
 * getter dropped on the floor — which is exactly the wiring a screen relies
 * on when its trip name arrives after the first render.
 */
describe('setHeaderTitle wires both lines, and follows their data', () => {
  beforeEach(() => clearHeadFor(PATH))

  function mountWith(title: () => string, meta?: () => string | null) {
    return mount(
      defineComponent({
        setup: () => {
          setHeaderTitle(title, meta)
          return () => null
        },
      }),
    )
  }

  it('registers the title and the meta line under the calling page path', () => {
    mountWith(
      () => 'Shopping',
      () => 'Samedan 2026',
    )

    expect(headFor(PATH)).toEqual({ title: 'Shopping', meta: 'Samedan 2026' })
  })

  it('follows the meta line when its data arrives after the first render', async () => {
    const trip = ref<string | null>(null)
    mountWith(
      () => 'Shopping',
      () => trip.value,
    )
    expect(headFor(PATH)?.meta).toBeNull()

    trip.value = 'Samedan 2026'
    await Promise.resolve()

    expect(headFor(PATH)?.meta).toBe('Samedan 2026')
  })

  it('leaves the meta line null for a screen that registers only a name', () => {
    mountWith(() => 'Items')

    expect(headFor(PATH)).toEqual({ title: 'Items', meta: null })
  })

  it('clears its own path when the page unmounts', () => {
    const wrapper = mountWith(() => 'Shopping')

    wrapper.unmount()

    expect(headFor(PATH)).toBeNull()
  })
})
