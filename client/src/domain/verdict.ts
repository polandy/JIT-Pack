/**
 * FR-9.6 — three verdicts and a reason. A trip is judged afterwards row by
 * row: *hätte mit gemusst* (`flag_missing`), *unnötig dabei* (`flag_unused`)
 * and *zu viel* (`needed_quantity`, the number actually used — ADR-103). A
 * row carries one verdict; what it is offered follows from what happened to
 * it and from when it is asked. The reason is an ordinary row comment
 * (FR-7.1) and lives in the comment actions, not here.
 *
 * Pure, no I/O: M4's closing pass, M5's verdict block and the app action
 * that writes a verdict all read these rules.
 */
import {
  STATE_SKIPPED,
  TRIP_STATUS_ACTIVE,
  TRIP_STATUS_ARCHIVED,
  type ReviewFlag,
  type TripItem,
  type TripStatus,
} from '@/types/domain'

export const VERDICT_MISSING = 'missing' as const satisfies ReviewFlag
export const VERDICT_UNUSED = 'unused' as const satisfies ReviewFlag
/** *Zu viel*: fewer would have done — the row carries how many were used. */
export const VERDICT_FEWER = 'fewer'

/** One of FR-9.6's three verdicts; the two flags keep FR-9.1's names. */
export type RowVerdict = ReviewFlag | typeof VERDICT_FEWER

/**
 * The verdicts in the order a row reads them when a concurrent offline edit
 * left several (a set flag merges additively, NFR-4.2a): the sheet shows the
 * first, M14 shows a proposal for each. Also the order a sheet offers them.
 */
export const ROW_VERDICTS: readonly RowVerdict[] = [VERDICT_MISSING, VERDICT_UNUSED, VERDICT_FEWER]

/** While the trip runs — M5 on an active trip. */
export const VERDICT_WINDOW_DURING = 'during'
/** Afterwards — FR-9.3's closing pass, and M5 on an archived trip. */
export const VERDICT_WINDOW_AFTER = 'after'

/**
 * When a verdict is asked. It decides *missing*: while the trip runs any row
 * can turn out to be missing, afterwards only one left at home — a thing
 * bought after the trip was not missing on it (FR-9.3).
 */
export type VerdictWindow = typeof VERDICT_WINDOW_DURING | typeof VERDICT_WINDOW_AFTER

/** The fields of a row the verdict rules read. */
export type VerdictRow = Pick<
  TripItem,
  'state' | 'packed_count' | 'flag_missing' | 'flag_unused' | 'needed_quantity'
>

/** The three columns one verdict writes, as domain values (sync/ encodes them). */
export interface VerdictFields {
  flag_missing: boolean
  flag_unused: boolean
  needed_quantity: number | null
}

/** The smallest number a *zu viel* verdict can name — none used is *unnötig*. */
export const MIN_NEEDED_QUANTITY = 1

/**
 * verdictWindow says when a trip in `status` is judged, or null for a
 * planning trip, which offers no verdict (FR-9.6). The closing pass runs on
 * the still-active trip and judges it afterwards.
 */
export function verdictWindow(status: TripStatus, closingPass: boolean): VerdictWindow | null {
  if (status === TRIP_STATUS_ARCHIVED) return VERDICT_WINDOW_AFTER
  if (status === TRIP_STATUS_ACTIVE)
    return closingPass ? VERDICT_WINDOW_AFTER : VERDICT_WINDOW_DURING
  return null
}

/** rowVerdict reads the verdict a row carries, or null; see ROW_VERDICTS for several. */
export function rowVerdict(row: VerdictRow): RowVerdict | null {
  return ROW_VERDICTS.find((verdict) => carries(row, verdict)) ?? null
}

/** A row whose verdict columns may be absent — an excursion line (FR-31.6) carries none. */
export type LooseVerdictRow = Pick<VerdictRow, 'state' | 'packed_count'> &
  Partial<Pick<VerdictRow, 'flag_missing' | 'flag_unused' | 'needed_quantity'>>

/**
 * rowVerdict for a row wider than {@link VerdictRow} (M4's pass chip, M4's
 * closing tally): the absent columns default to "no verdict" rather than
 * widen the rule's own, stricter type.
 */
export function looseRowVerdict(row: LooseVerdictRow): RowVerdict | null {
  return rowVerdict({
    state: row.state,
    packed_count: row.packed_count,
    flag_missing: row.flag_missing ?? false,
    flag_unused: row.flag_unused ?? false,
    needed_quantity: row.needed_quantity ?? null,
  })
}

/**
 * verdictChoices lists what a row is offered in `window`, in ROW_VERDICTS'
 * order (FR-9.6): *unused* on a row that went along, *fewer* once two or
 * more were packed, *missing* on a row that stayed home or on any row while
 * the trip runs. A verdict the row already carries is always offered, so it
 * can be cleared.
 */
export function verdictChoices(row: VerdictRow, window: VerdictWindow): RowVerdict[] {
  const skipped = row.state === STATE_SKIPPED
  const offered: Record<RowVerdict, boolean> = {
    [VERDICT_MISSING]: window === VERDICT_WINDOW_DURING || skipped,
    [VERDICT_UNUSED]: !skipped,
    [VERDICT_FEWER]: !skipped && neededRange(row) !== null,
  }
  return ROW_VERDICTS.filter((verdict) => offered[verdict] || carries(row, verdict))
}

/**
 * neededRange is the range *zu viel* takes — from one to one less than was
 * packed (ADR-103) — or null when fewer than two were packed.
 */
export function neededRange(
  row: Pick<TripItem, 'packed_count'>,
): { min: number; max: number } | null {
  const max = row.packed_count - 1
  return max >= MIN_NEEDED_QUANTITY ? { min: MIN_NEEDED_QUANTITY, max } : null
}

/** verdictFields snapshots what a verdict write would change — the undo's record. */
export function verdictFields(row: VerdictRow): VerdictFields {
  return {
    flag_missing: row.flag_missing,
    flag_unused: row.flag_unused,
    needed_quantity: row.needed_quantity ?? null,
  }
}

/**
 * verdictPatch is the write that leaves `row` with exactly `verdict` (null:
 * none) — the other two cleared, because a row carries one verdict (FR-9.6).
 *
 * Throws a RangeError for a *zu viel* whose `needed` lies outside
 * neededRange: clamping would store a number the user never gave, which is
 * the guess ADR-103 exists to avoid. The stepper offers only the range.
 */
export function verdictPatch(
  row: VerdictRow,
  verdict: RowVerdict | null,
  needed?: number,
): VerdictFields {
  if (verdict === VERDICT_FEWER) {
    const range = neededRange(row)
    if (
      range === null ||
      needed === undefined ||
      !Number.isInteger(needed) ||
      needed < range.min ||
      needed > range.max
    ) {
      throw new RangeError(
        `needed quantity ${needed} is outside 1..${row.packed_count - 1} for ${row.packed_count} packed`,
      )
    }
  }
  return {
    flag_missing: verdict === VERDICT_MISSING,
    flag_unused: verdict === VERDICT_UNUSED,
    needed_quantity: verdict === VERDICT_FEWER ? (needed as number) : null,
  }
}

/** Where FR-9.3's closing pass lists a row: what went along, what stayed home. */
export interface PassSections<R> {
  packed: R[]
  stayedHome: R[]
}

/**
 * passSection places one row in the closing pass, or null for a row neither
 * packed nor skipped — it has no outcome to judge (FR-9.3). A skipped row
 * stayed home whatever its count says: the skip is the later decision.
 */
export function passSection(
  row: Pick<TripItem, 'state' | 'packed_count'>,
): keyof PassSections<unknown> | null {
  if (row.state === STATE_SKIPPED) return 'stayedHome'
  return row.packed_count > 0 ? 'packed' : null
}

/**
 * passSectionGroup is {@link passSection} shaped as a grouping key — the key
 * doubles as the name; the component translates it, since `domain/` never
 * carries display strings.
 */
export function passSectionGroup(row: Pick<TripItem, 'state' | 'packed_count'>): {
  key: string
  name: string | null
} {
  const section = passSection(row)
  return { key: section ?? '', name: section }
}

/** passSections splits rows into the closing pass's two lists, in their given order. */
export function passSections<R extends Pick<TripItem, 'state' | 'packed_count'>>(
  rows: readonly R[],
): PassSections<R> {
  const sections: PassSections<R> = { packed: [], stayedHome: [] }
  for (const row of rows) {
    const section = passSection(row)
    if (section) sections[section].push(row)
  }
  return sections
}

function carries(row: VerdictRow, verdict: RowVerdict): boolean {
  if (verdict === VERDICT_MISSING) return row.flag_missing
  if (verdict === VERDICT_UNUSED) return row.flag_unused
  return row.needed_quantity != null
}
