import { ref } from 'vue'

/**
 * Whether the FR-25.13e switch in the inventory browse-sheet is on — the
 * *„schon drin ausblenden"* posture.
 *
 * **Device-local, never synced**, the `useInventoryProperties` stance: it is a
 * viewing preference rather than data, and syncing it would make one person's
 * way of working through the inventory everyone's.
 *
 * It is deliberately **one** value rather than one per screen: M4, M6 and M8
 * present the same sheet, and someone who wants the carried rows out of the way
 * wants that while composing a template as much as while packing.
 */

const STORAGE_KEY = 'jitpack_browse_hide_carried'

function read(): boolean {
  try {
    // Anything but the stored `true` is off: an unreadable or hand-edited value
    // must never hide inventory the user did not ask to hide.
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

/** Shared across callers, so two mounts of the sheet cannot disagree. */
const hideCarried = ref<boolean>(read())

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(hideCarried.value))
  } catch {
    // Not persistable — still applies for this session.
  }
}

export function browseHideCarried() {
  function toggle(): void {
    hideCarried.value = !hideCarried.value
    persist()
  }

  /** Re-read the stored preference — what a reload sees. */
  function reload(): void {
    hideCarried.value = read()
  }

  return { hideCarried, toggle, reload }
}
