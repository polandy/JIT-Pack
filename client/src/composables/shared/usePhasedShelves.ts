/**
 * Two shelves read top to bottom on one screen — M6's lists *Vor der Reise* /
 * *Vor Ort* (FR-30) and M25's phases *Vor der Reise* / *Während der Reise*
 * (FR-7.14) — and the rules both screens read them by, so the twins stay one
 * look and feel rather than two transcriptions of it.
 *
 * - A shelf with nothing open under its heading, or the finished packing's
 *   *before* (FR-7.12), leaves reading order for one fold line at the end
 *   (`restShelves`), which names what stands below it (`restLabel`) and opens
 *   only where something does (`restExpandable`).
 * - A drop target is the shelf and the group (`dropKey`), since the same tag
 *   can head a group on both shelves; `readDropKey` takes it apart again.
 *
 * What a shelf holds — lines or tasks, bought or done — is the screen's: it
 * hands in the counts and the words, this knows neither.
 */
import { computed, reactive } from 'vue'

import { t, type MessageKey } from '@/i18n'

/**
 * The fold line's words. Every key but the two history ones reads `{shelf}`
 * (the shelf's name), `{due}` (how many stand in the *Fällig* block) and `{n}`
 * (how many are finished).
 */
export interface ShelfWords<Shelf extends string> {
  /** The shelf's name, as its heading reads. */
  name: (shelf: Shelf) => MessageKey
  /** The closed *before* with finished rows below it, `{n}` of them. */
  history: MessageKey
  /** The closed *before* with nothing below it. */
  historyEmpty: MessageKey
  rest: MessageKey
  restDone: MessageKey
  restDue: MessageKey
  restDueDone: MessageKey
}

export interface PhasedShelvesOptions<Shelf extends string> {
  /** The shelves in reading order. */
  shelves: readonly Shelf[]
  /** FR-7.12: the shelf that is history — read, never worked. */
  closed: (shelf: Shelf) => boolean
  /** How many open rows stand under the shelf's own heading. */
  open: (shelf: Shelf) => number
  /** How many of the shelf's open rows stand in the *Fällig* block instead. */
  due: (shelf: Shelf) => number
  /** How many of the shelf's rows are finished — bought, done. */
  done: (shelf: Shelf) => number
  words: ShelfWords<Shelf>
}

/**
 * Between the shelf and the group in a drop target: `before/apotheke`. Read
 * at its first occurrence only, so a group key that carries one — a free-text
 * tag on M6 — still reads back whole.
 */
const DROP_KEY_SEPARATOR = '/'

export function usePhasedShelves<Shelf extends string>(options: PhasedShelvesOptions<Shelf>) {
  const { shelves, closed: isClosed, open, due, done, words } = options

  function inOrder(shelf: Shelf): boolean {
    return !isClosed(shelf) && open(shelf) > 0
  }

  const restShelves = computed(() => shelves.filter((shelf) => !inOrder(shelf)))

  /** Which fold lines stand open; every one starts folded. */
  const restOpen = reactive(Object.fromEntries(shelves.map((shelf) => [shelf, false]))) as Record<
    Shelf,
    boolean
  >

  function toggleRest(shelf: Shelf) {
    restOpen[shelf] = !restOpen[shelf]
  }

  /** *„Vor der Reise · nichts offen · 2 gekauft"* (*„· 1 fällig"* while the block holds some) — or the closed *before*'s own words. */
  function restLabel(shelf: Shelf): string {
    const n = done(shelf)
    if (isClosed(shelf)) return n > 0 ? t(words.history, { n }) : t(words.historyEmpty)
    const name = t(words.name(shelf))
    const inBlock = due(shelf)
    if (inBlock > 0) {
      return n > 0
        ? t(words.restDueDone, { shelf: name, due: inBlock, n })
        : t(words.restDue, { shelf: name, due: inBlock })
    }
    return n > 0 ? t(words.restDone, { shelf: name, n }) : t(words.rest, { shelf: name })
  }

  /** The line opens where there is something below it: a finished row, or the lock's sentence. */
  function restExpandable(shelf: Shelf): boolean {
    return isClosed(shelf) || done(shelf) > 0
  }

  function dropKey(shelf: Shelf) {
    return (group: { key: string }) => `${shelf}${DROP_KEY_SEPARATOR}${group.key}`
  }

  function readDropKey(target: string): { shelf: Shelf; key: string } {
    const at = target.indexOf(DROP_KEY_SEPARATOR)
    return { shelf: target.slice(0, at) as Shelf, key: target.slice(at + 1) }
  }

  return {
    isClosed,
    inOrder,
    restShelves,
    restOpen,
    toggleRest,
    restLabel,
    restExpandable,
    dropKey,
    readDropKey,
  }
}
