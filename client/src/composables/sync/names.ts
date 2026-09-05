/**
 * The name guards the master-data groups share (R-4).
 *
 * They live beside the groups rather than inside one of them because two
 * groups need them — templates and series — and `useSyncOrchestrator` still
 * exposes both lookups on its facade for the views that ask before writing.
 */
import { findNameCollision, renameTarget } from '@/domain/nameCollision'
import type { Template, TripSeries } from '@/types/domain'

/** The two lists the guards read — a `MasterReads` satisfies it. */
export interface NameReads {
  readonly activeTemplateList: Template[]
  readonly seriesList: TripSeries[]
}

/**
 * Whether an edit patch renames a row onto a name somebody else holds. The
 * guard sits here rather than only in the views because Local Mode has no
 * constraint behind it: this is the only thing between the user and two
 * rows nothing on screen can tell apart.
 */
export function isTakenRename(
  fields: Record<string, unknown>,
  id: string,
  find: (name: string, excludeId?: string) => { id: string } | undefined,
): boolean {
  const next = renameTarget(fields)
  return next !== null && find(next, id) !== undefined
}

/** The two lookups, bound to the master store they read. */
export interface NameGuards {
  templateNameCollision(name: string, excludeId?: string): Template | undefined
  seriesNameCollision(name: string, excludeId?: string): TripSeries | undefined
}

/** createNameGuards binds the collision lookups to one master store. */
export function createNameGuards(masterStore: NameReads): NameGuards {
  return {
    /**
     * templateNameCollision names the template already holding `name`
     * (FR-1.6), or undefined. `templates.name` is UNIQUE **instance-wide and
     * across both scopes**, so a Gruppe can hold the name a Ferien-Vorlage
     * wants — the caller reports the kind so that reads as a fact rather than
     * as a bug. Retired templates are not consulted: since FR-24.3 the
     * database's uniqueness is over the active rows, and refusing a name the
     * constraint would accept — held by a row no screen shows — is a name taken
     * away with nothing the user can do about it.
     */
    templateNameCollision(name, excludeId) {
      return findNameCollision(name, masterStore.activeTemplateList, excludeId)
    },
    /** seriesNameCollision names the series already holding `name` (FR-13.1). */
    seriesNameCollision(name, excludeId) {
      return findNameCollision(name, masterStore.seriesList, excludeId)
    },
  }
}
