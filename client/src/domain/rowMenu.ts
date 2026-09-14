/**
 * What M4's press-and-hold offers on a row (FR-5.5, FR-5.7, FR-9.3, G-3).
 *
 * The menu was a nested ternary inside `actionSheetController.create`, so
 * the rule could only be read by rendering M4 and holding a row down — and
 * two of its five outcomes are *empty*, which a running screen shows as
 * nothing happening. Here the whole decision is one function returning the
 * entries in the order they are offered; the view keeps the wording, the
 * glyphs and the handlers, which are its own.
 */
import type { TripItem } from '@/types/domain'

/**
 * One entry the row menu can offer. Not a label: the wording of `flagUnused`
 * versus `unflagUnused` is a catalogue key, and `domain/` does not read the
 * catalogue.
 */
export type RowMenuAction =
  | 'takeover'
  | 'release'
  | 'unskip'
  | 'quantity'
  | 'packingNow'
  | 'skip'
  /** FR-25.25: the FR-5.1 flag, switched from the row instead of from M5. */
  | 'latePackerOn'
  | 'latePackerOff'
  | 'flagUnused'
  | 'unflagUnused'

/** Everything outside the row that decides what the row may offer. */
export interface RowMenuContext {
  /** FR-9.3: in the review posture the row menu goes inert, by decision. */
  closingPass: boolean
  /** G-3: somebody else holds this row. */
  locked: boolean
  /**
   * FR-5.7 is Server Mode only — Local Mode has no server and Single-User
   * Mode has one account, so there is nobody to take a row from and the
   * entry is absent rather than shown inert (G-8).
   */
  canTakeOver: boolean
  /** The claim on this row is mine. */
  mine: boolean
  /** FR-9.3's window: whether *unused* is a judgement that means anything yet. */
  judgeable: boolean
}

/** The row fields the menu reads; a `TripItem` satisfies it. */
export type RowMenuItem = Pick<TripItem, 'state' | 'flag_unused' | 'late_packer'>

/**
 * The entries the menu offers, in order. An empty list means **no menu at
 * all** rather than an empty one: a sheet with nothing but *Cancel* in it
 * is a worse answer than the press doing nothing.
 *
 * `skipped` is read from the row rather than passed in, because a caller
 * that can disagree with the item about its own state is a caller that
 * eventually will.
 *
 * FR-25.24's *amount* leads an ordinary row's list: M4 puts it on the
 * row's own count as well, but a row of one renders a checkbox and has no
 * number to tap — the menu is where those rows can be corrected at all.
 */
export function rowMenuEntries(item: RowMenuItem, ctx: RowMenuContext): RowMenuAction[] {
  if (ctx.closingPass) return []
  // Every action on somebody else's row belongs to its holder — except the
  // one that makes it mine.
  if (ctx.locked) return ctx.canTakeOver ? ['takeover'] : []

  const entries: RowMenuAction[] = ctx.mine
    ? // A row I am holding offers the way out of that and nothing else:
      // packing it is already the checkbox's job, and skipping something
      // you are in the middle of packing is not a thing anyone means.
      ['release']
    : item.state === 'skipped'
      ? // FR-25.24 is absent here on purpose: the editor's smallest amount
        // is 1, so setting one on a skipped row would be an *unskip* that
        // leaves the row's FR-20.2 companions behind — the one thing the
        // entry above does correctly.
        ['unskip']
      : [
          'quantity',
          'packingNow',
          'skip',
          // FR-25.25: last of the row's own actions, because it is the one
          // that says something about *when* rather than about now. A
          // skipped row is offered none of it — nothing is being packed on
          // it, so a departure-day flag would describe an act that is not
          // going to happen.
          item.late_packer ? 'latePackerOff' : 'latePackerOn',
        ]

  // FR-9.3: the judgement leaves the fold. *Unused* used to cost three taps
  // into M5's *Details* block, which nothing ever asks for.
  if (ctx.judgeable) entries.push(item.flag_unused ? 'unflagUnused' : 'flagUnused')
  return entries
}
