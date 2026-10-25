// @vitest-environment jsdom
/**
 * `useHeadScroll` — which event closes the FR-21.17 gesture window (E2E-M4-135).
 *
 * `lib/headScroll.spec.ts` already pins the pure rule; what it cannot reach is
 * *when* this composable decides the window has closed. Two prior fixes both
 * trusted Ionic's `ionScrollEnd` for that, and both still read a scroll as
 * nobody's that the reader was still making — `ionScrollEnd` is a 120 ms
 * silence timer, not a report that the scroll which just fired is over, and a
 * main thread stalled that long mid-flick lets it fire early. Forcing that
 * stall onto a real page turned out not to prove anything: a single large
 * wheel already crosses the yield threshold on its first event, while the
 * window is still open, so the collapse lands before a premature close could
 * ever matter — the race is undetectable from outside the composable. What is
 * provable is the seam itself — which event actually disarms the gesture — so
 * these mount a stub scroller and call the handlers directly, with no timing
 * in play at all.
 */
import { describe, it, expect, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'

import { useHeadScroll } from '@/composables/useHeadScroll'

/**
 * A scroller stub, plain `EventTarget` rather than a real element: jsdom's
 * `HTMLElement` carries `onscrollend` on its own prototype regardless of what
 * an instance sets, so `'onscrollend' in el` — the production check — would
 * read `true` for every `div` whether or not the stub meant to have one.
 */
function stubScroller(restsNatively: boolean) {
  const el = new EventTarget() as EventTarget & { scrollTop: number; onscrollend?: null }
  el.scrollTop = 0
  if (restsNatively) el.onscrollend = null
  return el
}

/** Mounts the composable in a real component — half of what it promises is tied to `onMounted`. */
async function mountHeadScroll(el: EventTarget & { scrollTop: number }) {
  const toggleAttribute = vi.fn()
  const content = ref<{ $el: HTMLIonContentElement } | null>({
    $el: {
      getScrollElement: () => Promise.resolve(el as unknown as HTMLElement),
      toggleAttribute,
    } as unknown as HTMLIonContentElement,
  })
  let api!: ReturnType<typeof useHeadScroll>
  mount(
    defineComponent({
      setup() {
        api = useHeadScroll(content)
        return () => h('div')
      },
    }),
  )
  // The listeners attach once `getScrollElement()`'s promise settles.
  await nextTick()
  await nextTick()

  // A wheel arms the gesture window the way a reader's flick does — the
  // starting point every case needs before it can test how the window closes.
  el.dispatchEvent(new WheelEvent('wheel'))
  expect(toggleAttribute).toHaveBeenCalledWith('data-scroll-gesture', true)
  toggleAttribute.mockClear()

  return { api: () => api, toggleAttribute }
}

describe('useHeadScroll — which event closes the window (FR-21.17, E2E-M4-135)', () => {
  it("leaves the gesture window open on Ionic's ionScrollEnd where the engine has its own scrollend", async () => {
    const el = stubScroller(true)
    const { toggleAttribute, api } = await mountHeadScroll(el)

    // Ionic's watchdog firing mid-flick is exactly the race E2E-M4-135's
    // third occurrence found: on the bug this closed the window outright.
    api().onScrollEnd()
    expect(toggleAttribute).not.toHaveBeenCalled()

    // Only the scroller's own rest — not yet seen — may close it.
    el.dispatchEvent(new Event('scrollend'))
    expect(toggleAttribute).toHaveBeenCalledWith('data-scroll-gesture', false)
  })

  it('still closes the gesture window on ionScrollEnd where the engine has no native scrollend', async () => {
    const el = stubScroller(false)
    const { toggleAttribute, api } = await mountHeadScroll(el)

    // No native rest to prefer, so the fallback stands — unchanged by this
    // fix, which only ever withholds trust from the timer, never removes it.
    api().onScrollEnd()
    expect(toggleAttribute).toHaveBeenCalledWith('data-scroll-gesture', false)
  })
})
