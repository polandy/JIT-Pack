/**
 * Selecting several rows of a list in place — the gesture M6 (FR-30.9), M25
 * (FR-7.8) and M9 (FR-24.9) share, so a long press means the same thing on
 * all three.
 *
 * It was M6's own code until the owner asked for the two lists to behave
 * alike (2026-09-24); moved rather than copied, `useTaskActs`'s reason: two
 * transcriptions of one gesture do not stay one gesture.
 *
 * Entered by a hold on an eligible row (`useLongPress`'s 500 ms and 8 px, so
 * a finger can still scroll), by a right-click, or by the screen's own app
 * bar icon. What a row *is* and whether it may be selected is the screen's
 * business; this holds only the keys.
 */
import { checkmarkDoneOutline } from 'ionicons/icons'
import { ref } from 'vue'

import { useLongPress } from './useLongPress'

/**
 * The app bar's icon for entering a selection (G-20), one for every list
 * that selects. Not `checkboxOutline`: that glyph is the *Aufgaben* view's
 * own, and on M6 and M25 the two stood one above the other meaning different
 * things (FR-7.14, owner 2026-09-25).
 */
export const SELECTION_ICON = checkmarkDoneOutline

/** `PointerEvent.button` for a mouse's main button, a touch and a pen tip. */
const PRIMARY_BUTTON = 0

export function useRowSelection() {
  const selecting = ref(false)
  const selected = ref<Set<string>>(new Set())

  /**
   * Set when a hold (or right-click) selects a row, so the click the browser
   * sends on that same press's release does not toggle the row straight off
   * again. **Cleared by the next press, not by a clock**: the ghost click has
   * no pointerdown of its own, a deliberate tap always does — so a tap is never
   * eaten however soon it follows, and no case has to wait a window out.
   */
  let justSelected = false

  function startWith(key: string) {
    // A right-click's own pointerdown armed the hold before its contextmenu
    // arrived; left armed, it fired half a second later, chose the row again
    // and swallowed the next real tap as its ghost click.
    hold.cancel()
    selecting.value = true
    selected.value = new Set([key])
    justSelected = true
  }

  // Declared before `startWith` runs, which only ever happens after setup.
  const hold = useLongPress<string>((key) => startWith(key))

  /** The mode, with nothing chosen yet — the app bar's own entry point. */
  function start() {
    selecting.value = true
  }

  function end() {
    selecting.value = false
    selected.value = new Set()
  }

  function toggle(key: string) {
    const next = new Set(selected.value)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    selected.value = next
  }

  /**
   * „Alle N": every eligible key — the same act, repeated, clears them again.
   * „Every" is judged by the keys on screen, not by a count: M9's filter can
   * hide a chosen row, and a count would then clear where it should take.
   */
  function toggleAll(keys: readonly string[]) {
    const all = keys.length > 0 && keys.every((key) => selected.value.has(key))
    selected.value = all ? new Set() : new Set(keys)
  }

  /**
   * A press on a row ends the ghost-click guard, and on an eligible row arms
   * the hold; nothing is armed while already selecting. Only the primary button holds — a right-click has its own way
   * in (`contextMenu`), and a touch or pen reports as the primary button.
   */
  function press(key: string, event: PointerEvent) {
    justSelected = false
    if (selecting.value || event.button !== PRIMARY_BUTTON) return
    hold.down(key, event.clientX, event.clientY)
  }

  function move(event: PointerEvent) {
    hold.move(event.clientX, event.clientY)
  }

  function release() {
    hold.cancel()
  }

  /** The desktop-equivalent entry point, and e2e's deterministic seam for the hold. */
  function contextMenu(key: string) {
    if (selecting.value) return
    startWith(key)
  }

  /**
   * A tap on a row: true when it was spent on the selection — swallowed as
   * the hold's ghost click, or toggling the row — and the screen must not
   * also treat it as its own tap.
   */
  function click(key: string, eligible: boolean): boolean {
    if (justSelected) {
      justSelected = false
      return true
    }
    if (!selecting.value) return false
    if (eligible) toggle(key)
    return true
  }

  return {
    selecting,
    selected,
    start,
    end,
    toggle,
    toggleAll,
    press,
    move,
    release,
    contextMenu,
    click,
  }
}

/** The handle a list hands its rows. */
export type RowSelection = ReturnType<typeof useRowSelection>
