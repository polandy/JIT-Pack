/**
 * The M18 portable import and the whole-backup restore (FR-18.4, NFR-4.11)
 * — the environment `@/domain/portableImport`'s rules run in on this
 * device. The rules themselves stay in `domain/`, where the command line
 * reaches them too (ADR-008).
 */
import { clearMigrationPending } from '@/mode'
import { optimisticInsert } from '@/sync/optimistic'
import type { PortableDocument } from '@/domain/portable'
import { importPortableBackup, importPortableDocument } from '@/domain/portableImport'
import type { PortableImportEnv, PortableImportResult } from '@/domain/portableImport'
import type { SyncContext } from '../context'

/** createPortableActions binds the portable group to one sync context. */
export function createPortableActions(ctx: SyncContext) {
  const { tripStore, masterStore, mutations, queue, drainPartitions, local } = ctx

  /**
   * The device's own stores, this session's mutation builders, and a write
   * that lands optimistically and queues for the server.
   */
  function portableImportEnv(): PortableImportEnv {
    return {
      /*
       * Trips live in the trip store rather than the master one, so the view
       * is assembled here — through getters, because ADR-030's rule reads it
       * back between writes and a snapshot taken now would not see the trip
       * the previous document just created.
       */
      master: {
        get itemList() {
          return masterStore.itemList
        },
        get tagList() {
          return masterStore.tagList
        },
        get templateList() {
          return masterStore.templateList
        },
        get tripList() {
          return tripStore.tripList
        },
      },
      mutations,
      // The partition the rules name is the one the funnel derives from the
      // table; an emitted row is whole, so it paints as given even where its
      // op is an upsert (a generated position).
      emit(_partition, _tripId, mutation) {
        queue({ mutation, optimistic: optimisticInsert(mutation) })
      },
    }
  }

  /** Land one M18 portable document, then push what it produced (FR-18.4). */
  function commitPortableImport(
    doc: PortableDocument,
    mergeDecisions: Map<string, string>,
    restoredTemplates?: Map<string, string>,
  ): PortableImportResult {
    const result = importPortableDocument(
      doc,
      mergeDecisions,
      portableImportEnv(),
      restoredTemplates,
    )
    drainPartitions(result.kind === 'trip' ? [result.id] : [])
    return result
  }

  /** Restore a whole backup file (NFR-4.11), then push what it produced. */
  function commitPortableRestore(docs: PortableDocument[]): PortableImportResult[] {
    const imported = importPortableBackup(docs, portableImportEnv())
    // FR-19.8: a restore onto a server is the third step of the move; in
    // Local Mode there is no move to finish.
    if (!local) clearMigrationPending()
    // Every trip the file brought, not none of them: a restore is the whole
    // device, and its rows live in one partition per trip (FR-19.5).
    drainPartitions(imported.filter((r) => r.kind === 'trip').map((r) => r.id))
    return imported
  }

  return { commitPortableImport, commitPortableRestore }
}
