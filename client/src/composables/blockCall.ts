/**
 * A dashboard block called from elsewhere on the page — M1's due line, whose
 * counts lead to the Aufgaben and Einkaufen blocks (FR-7.11, FR-30.10).
 *
 * A call rather than a scroll done by the caller, because what answering it
 * takes is the block's own business: unfolding a folded block for the visit,
 * bringing it into view, and marking it so the eye lands on it. The caller
 * knows only the anchor (`dueBlockAnchor`), which the block wears as its id.
 */
import { ref, watch } from 'vue'

/** The latest call. The serial makes the same block, called twice, answer twice. */
const latest = ref<{ anchor: string; serial: number } | null>(null)
let serial = 0

/** callBlock asks the block wearing `anchor` to come forward. */
export function callBlock(anchor: string): void {
  serial += 1
  latest.value = { anchor, serial }
}

/** onBlockCall runs `answer` each time the block wearing `anchor` is called. */
export function onBlockCall(anchor: () => string | undefined, answer: () => void): void {
  watch(latest, (call) => {
    if (call !== null && call.anchor === anchor()) answer()
  })
}
