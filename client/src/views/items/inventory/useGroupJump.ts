/**
 * FR-24.8: the group heading as a jump control, and FR-24.6's measurement of
 * the tool bar the headings stick beneath.
 *
 * Reads two template refs of the page that calls it — `content` (the
 * `IonContent`) and `tools` (the `InventoryTools` bar).
 */
import {
  computed,
  onBeforeUnmount,
  ref,
  useTemplateRef,
  watch,
  type ComponentPublicInstance,
} from 'vue'

import type { InventoryCore } from './useInventoryCore'

/** The jump sheet's state and the scroll it ends in; call once, in the page's setup. */
export function useGroupJump(core: InventoryCore) {
  const { groups, searching, sort, groupLabel } = core

  const jumpOpen = ref(false)

  /** The groups as the jump sheet lists them (FR-24.8). */
  const jumpGroups = computed(() =>
    groups.value.map(([key, items]) => ({ key, label: groupLabel(key), count: items.length })),
  )

  /** Whether jumping is a question at all: one group is already on screen. */
  const canJump = computed(
    () => !searching.value && sort.value === 'grouped' && jumpGroups.value.length > 1,
  )

  /**
   * The section elements, by group key, so a jump has something to scroll to.
   * A Map filled by the template rather than a query on `document`: the page is
   * mounted twice during an Ionic transition, and a selector would find the
   * outgoing copy as readily as this one.
   */
  const sections = new Map<string, HTMLElement>()

  function registerSection(key: string, ref: unknown) {
    // A component ref: the group's element is behind `$el`.
    const el = (ref as ComponentPublicInstance | null)?.$el
    if (el instanceof HTMLElement) sections.set(key, el)
    else sections.delete(key)
  }

  /** The group whose rows the list is showing — what the sheet marks. */
  const currentGroup = ref<string | null>(null)

  /**
   * The jump waits for the sheet to be *gone*, not merely closed.
   *
   * While an Ionic overlay is presented the scroll host is locked
   * (`backdrop-no-scroll`), so a `scrollTo` issued in the same breath as the
   * dismissal is clamped: measured on the family instance, a jump to the last
   * group moved the list 120 px instead of 9 000. Keeping the key until the
   * sheet reports it has dismissed makes the scroll a consequence of a settled
   * state rather than a race against an animation.
   */
  const pendingJump = ref<string | null>(null)

  function requestJump(key: string) {
    pendingJump.value = key
    jumpOpen.value = false
  }

  function onJumpDismissed() {
    jumpOpen.value = false
    const key = pendingJump.value
    pendingJump.value = null
    if (key !== null) void jumpTo(key)
  }

  async function openJump() {
    // The sheet opens either way: which group is on screen decorates it, and a
    // measurement that failed must not cost the control.
    currentGroup.value = await topmostGroup()
    jumpOpen.value = true
  }

  /** The first group whose heading has not yet scrolled past the tool bar. */
  async function topmostGroup(): Promise<string | null> {
    const scroller = await scrollElement()
    if (!scroller) return null
    const box = scroller.getBoundingClientRect()
    const edge = box.top + toolsHeight.value
    let last: string | null = null
    for (const [key] of groups.value) {
      const el = sections.get(key)
      if (!el) continue
      if (el.getBoundingClientRect().top <= edge + 1) last = key
      else break
    }
    return last ?? groups.value[0]?.[0] ?? null
  }

  /**
   * Scroll the group into view (FR-24.8). It **scrolls and does not anchor**:
   * the rows above stay where they are, so a jump
   * is undone by scrolling back rather than by a second jump.
   *
   * The offset is computed from the two boxes rather than from `offsetTop`,
   * which is relative to whichever ancestor happens to be positioned — inside
   * `ion-content` that is not the scroller.
   */
  async function jumpTo(key: string) {
    const scroller = await scrollElement()
    const section = sections.get(key)
    if (!scroller || !section) return
    const top =
      scroller.scrollTop +
      section.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top -
      toolsHeight.value
    scroller.scrollTo({ top: Math.max(0, top), behavior: 'auto' })
  }

  const contentEl = useTemplateRef<ComponentPublicInstance>('content')

  /**
   * `ion-content`'s own scroller — the element an offset is real in.
   *
   * Two hops rather than one: a template ref on an Ionic component resolves to
   * the *component instance*, so the custom element (and with it
   * `getScrollElement`) is behind `$el`. Reading it directly is the mistake
   * that silently wedged the jump sheet: the await threw, and the sheet that
   * was to open after it never did.
   */
  async function scrollElement(): Promise<HTMLElement | null> {
    const el = contentEl.value?.$el as HTMLIonContentElement | undefined
    return el?.getScrollElement ? await el.getScrollElement() : null
  }

  /**
   * How far the group headings have to stay clear of the tool bar (FR-24.6).
   *
   * Both are sticky, and a heading that sticks at `top: 0` slides *under* the
   * bar instead of beneath it. The height is measured rather than guessed
   * because the bar grows a row when a tag chip is active and wraps on a narrow
   * screen — a constant here would be right on one device and wrong on the next.
   */
  const toolsRef = useTemplateRef<ComponentPublicInstance>('tools')
  // A component ref, like the content's: the bar's element is behind `$el`.
  const toolsEl = computed(() => (toolsRef.value?.$el as HTMLElement | undefined) ?? null)
  const toolsHeight = ref(0)
  let observer: ResizeObserver | null = null

  watch(toolsEl, (el) => {
    observer?.disconnect()
    observer = null
    if (!el) {
      toolsHeight.value = 0
      return
    }
    toolsHeight.value = el.offsetHeight
    // Guarded rather than assumed: jsdom has no ResizeObserver, and a unit test
    // that mounts this page must not fail on a measurement it cannot take. The
    // offset above is still read, so the fallback is a stale height rather than
    // none — and `top: 0` is where an unmeasured heading sticks, which is the
    // pre-FR-24.6 behaviour rather than a broken one.
    if (typeof ResizeObserver === 'undefined') return
    observer = new ResizeObserver(() => (toolsHeight.value = el.offsetHeight))
    observer.observe(el)
  })

  onBeforeUnmount(() => observer?.disconnect())

  return {
    jumpOpen,
    jumpGroups,
    canJump,
    registerSection,
    currentGroup,
    requestJump,
    onJumpDismissed,
    openJump,
    toolsHeight,
  }
}
