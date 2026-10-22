/**
 * FR-9.6's verdict and its reason — one act, and one undo (FR-25.31). The
 * rules are `domain/verdict.ts`'s; this group writes them. The reason is an
 * ordinary FR-7.1 comment on the row, so it reads and syncs as any other.
 */
import { verdictFields, verdictPatch, type RowVerdict, type VerdictFields } from '@/domain/verdict'
import { CLIENT_ACTOR_PLACEHOLDER } from '@/sync/mutations'
import type { SyncContext } from '../context'
import type { createCommentActions } from './comments'

/** What one setVerdict changed — everything undoVerdict needs to take it back. */
export interface VerdictUndo {
  tripId: string
  rowId: string
  /** The row's verdict columns before the act. */
  previous: VerdictFields
  /** The reason comment the act added, or null when the reason was blank. */
  commentId: string | null
}

/** createVerdictActions binds the verdict group to one sync context. */
export function createVerdictActions(
  ctx: SyncContext,
  deps: { comments: Pick<ReturnType<typeof createCommentActions>, 'deleteComment'> },
) {
  const { mutations, write, tripStore } = ctx

  /**
   * setVerdict leaves the row with exactly `verdict` (null: none) and, for a
   * non-blank `reason`, a comment on it — in one write, so the two never
   * travel apart. Returns the undo record, or null when the row is not on
   * the trip. A *zu viel* outside the row's range throws before any write
   * (`verdictPatch`).
   */
  function setVerdict(
    tripId: string,
    rowId: string,
    verdict: RowVerdict | null,
    needed?: number,
    reason?: string,
  ): VerdictUndo | null {
    const row = tripStore.getItems(tripId).find((item) => item.id === rowId)
    if (!row) return null
    const patch = verdictPatch(row, verdict, needed)
    const body = reason?.trim() ?? ''
    const comment = body
      ? mutations.addComment(tripId, rowId, CLIENT_ACTOR_PLACEHOLDER, body)
      : null
    write(mutations.setVerdict(rowId, patch), ...(comment ? [comment.mutation] : []))
    return { tripId, rowId, previous: verdictFields(row), commentId: comment?.id ?? null }
  }

  /** undoVerdict restores the row's previous verdict and removes the reason the act added. */
  function undoVerdict(undo: VerdictUndo) {
    write(mutations.setVerdict(undo.rowId, undo.previous))
    if (undo.commentId) deps.comments.deleteComment(undo.commentId)
  }

  return { setVerdict, undoVerdict }
}
