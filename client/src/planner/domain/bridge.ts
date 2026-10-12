/**
 * FR-29.13: which results an idea offers to become.
 */
import {
  IDEA_RESULT_EXCURSION,
  IDEA_RESULT_KINDS,
  type IdeaResult,
  type IdeaResultKind,
} from '@/domain/shared/ideaBridge'
import { IDEA_STATE_SHORTLISTED, type IdeaState } from '../types'

/**
 * The kinds of result an idea in `state` still offers, given what already
 * came of it: only a shortlisted idea offers any — it is the one the family
 * means to do — and an excursion is made once, where a task or a shopping
 * entry may be wanted several times (*Tisch reservieren*, *Tickets kaufen*).
 */
export function offeredResults(state: IdeaState, results: readonly IdeaResult[]): IdeaResultKind[] {
  if (state !== IDEA_STATE_SHORTLISTED) return []
  const hasExcursion = results.some((result) => result.kind === IDEA_RESULT_EXCURSION)
  return IDEA_RESULT_KINDS.filter((kind) => kind !== IDEA_RESULT_EXCURSION || !hasExcursion)
}
