/**
 * The one instant a spec's own writes are stamped with.
 *
 * A spec that builds mutations hands them a fixed clock rather than the
 * machine's (`app/no-real-clock-in-specs`), and the HLC and the ISO stamps
 * read the same one — as the orchestrator wires them in the app — so a
 * `packed_at` and the `hlc` beside it name the same moment.
 */
import { isoFrom, type NowMs } from '@/lib/clock'
import { HLCGenerator } from '@/sync/hlc'
import { createMutations } from '@/sync/mutations'

/** The instant, as rows store it. */
export const FIXED_NOW_ISO = '2026-03-14T09:00:00.000Z'

/** A millisecond clock that always reads {@link FIXED_NOW_ISO}. */
export const fixedClock: NowMs = () => Date.parse(FIXED_NOW_ISO)

/** Mutations whose HLC and ISO stamps both read {@link fixedClock}. */
export function fixedMutations(): ReturnType<typeof createMutations> {
  return createMutations(new HLCGenerator(fixedClock, 'aabbccdd'), isoFrom(fixedClock))
}
