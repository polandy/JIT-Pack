/**
 * Whether a dashboard block is folded, remembered (FR-7.9).
 *
 * The person's own choice about how much of the dashboard they want to see, so
 * it is a viewing preference and not data — the M9 property-sheet hint's
 * precedent: this device's storage, never synced, never in a partition.
 * Storage that throws or is absent (a private window, Local Mode's blocked
 * site data) leaves the block open for the visit, which is the state it starts
 * in.
 */
import { ref, type Ref } from 'vue'

/** Namespaced so a block's key cannot collide with another preference's. */
const KEY_PREFIX = 'jp_dash_fold_'

const FOLDED = 'folded'
const OPEN = 'open'

/** The state of one block, and the one way to change it. */
export interface BlockFold {
  open: Ref<boolean>
  toggle: () => void
}

function read(key: string): boolean {
  try {
    return globalThis.localStorage?.getItem(KEY_PREFIX + key) !== FOLDED
  } catch {
    return true
  }
}

function write(key: string, open: boolean) {
  try {
    globalThis.localStorage?.setItem(KEY_PREFIX + key, open ? OPEN : FOLDED)
  } catch {
    // A preference that cannot be kept is still honoured for this visit.
  }
}

/** useBlockFold binds one block, named by `key`, to its remembered state. */
export function useBlockFold(key: string): BlockFold {
  const open = ref(read(key))
  function toggle() {
    open.value = !open.value
    write(key, open.value)
  }
  return { open, toggle }
}
