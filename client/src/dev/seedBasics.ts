import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'

/** What the dev seed's parts share, so each part of the seed stays its own file. */
export type Orchestrator = ReturnType<typeof useSyncOrchestrator>

/** The sample trip's travellers; the last one is the child. */
export const TRAVELERS = ['Andy', 'Sia', 'Leonardo']

/** Today plus `days`, as `YYYY-MM-DD`. */
export function isoDay(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

/**
 * The server stamps the real author on insert (invariant 3); in Local Mode
 * nothing does, and the seed's own placeholder is what the M10 section then
 * fails to name — which is the correct Local Mode rendering, not a defect.
 */
export const SEED_AUTHOR_ID = 'dev-seed'
