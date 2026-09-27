import { computed, onMounted, onUnmounted, ref, type Ref } from 'vue'

import {
  gestureAfter,
  nextHeadState,
  SCROLLER_INPUTS,
  type HeadScrollState,
} from '@/lib/headScroll'

/** The `ion-content` a list scrolls in, as a template ref hands it over. */
export type ScrollContentRef = Ref<{ $el: HTMLIonContentElement } | null>

/**
 * The header line *and the page head above it* yield to the list on the way
 * down and come back on an upward gesture — M4's, and every list built like
 * it (M27, FR-31.6). The rule itself is a pure step in `lib/headScroll.ts`;
 * this is the listening around it. Bind `onScroll`/`onScrollEnd` to the
 * content's `ion-scroll`/`ion-scroll-end` with `:scroll-events="true"`.
 */
export function useHeadScroll(content: ScrollContentRef) {
  const head = ref<HeadScrollState>({ top: 0, collapsed: false })
  const collapsed = computed(() => head.value.collapsed)

  /**
   * The scroller behind the ion-content. Resolved at mount rather than from
   * the first event: `nextHeadState` needs its geometry to tell a list that
   * survives yielding from one that does not, and the first event of a page is
   * the one a short list's jump starts on. The event stays as the fallback.
   */
  let scrollEl: HTMLElement | null = null

  /**
   * Whether the reader is the one scrolling right now (FR-21.17).
   *
   * Armed by the inputs that scroll a list and disarmed when the scroller
   * comes to rest, so a flick's momentum still counts as the flick — or when
   * focus moves, which announces the browser's own scroll before it happens. Without
   * it the head answered scrolls nobody made — the browser's own, when it
   * brings a control into view for a keyboard focus or for a click aimed at
   * a row below the fold — and each answer moved every row by the head's
   * height while a finger was already on its way to one (E2E-M4-135).
   */
  let gesture = false

  /**
   * The window, and the one observable thing about it.
   *
   * It closes on Ionic's `ionScrollEnd`, which is a debounce after the last
   * scroll event — so *whether* it is open is a race against a timer for
   * anything outside this screen, and E2E-M4-135 lost that race on a loaded
   * shard: it measured a scroll nobody made while the flick that set it up was
   * still settling, and read the head answering the reader as the defect it was
   * written to catch. A plain `let` is deliberate — a ref would re-render the
   * list on every wheel event — so the state is mirrored onto the host element
   * instead, the way the G-19 toast carries `data-presented`. Nothing in the app
   * reads it; it exists so a case can wait for the window rather than hope.
   */
  function armGesture(open: boolean): void {
    gesture = open
    content.value?.$el.toggleAttribute('data-scroll-gesture', open)
  }

  function onScrollerInput(event: Event) {
    const key = event instanceof KeyboardEvent ? event.key : undefined
    const armed = gestureAfter(gesture, {
      type: event.type,
      key,
      onScroller: event.target === scrollEl,
    })
    if (armed !== gesture) armGesture(armed)
  }

  /** False once the screen is gone, so a scroller resolving late is not listened to at all. */
  let listening = true

  onMounted(() => {
    void content.value?.$el.getScrollElement?.().then((el) => {
      // A scroller that does not resolve is the state the rule already knows
      // as `viewport: null` — and there is nothing to listen on either.
      if (el == null || !listening) return
      scrollEl = el
      for (const type of SCROLLER_INPUTS)
        el.addEventListener(type, onScrollerInput, { passive: true })
    })
  })

  onUnmounted(() => {
    listening = false
    for (const type of SCROLLER_INPUTS) scrollEl?.removeEventListener(type, onScrollerInput)
  })

  function onScroll(event: CustomEvent<{ scrollTop: number }>) {
    if (scrollEl === null) {
      const host = event.target as { getScrollElement?: () => Promise<HTMLElement> }
      void host.getScrollElement?.().then((el) => (scrollEl = el))
    }
    head.value = nextHeadState(head.value, {
      top: event.detail.scrollTop,
      viewport: scrollEl,
      gesture,
    })
  }

  /** The scroller has come to rest, so whatever moves it next has to say who asked. */
  function onScrollEnd() {
    armGesture(false)
  }

  return { collapsed, onScroll, onScrollEnd }
}
