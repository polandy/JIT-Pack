/**
 * The Local Mode backup (NFR-4.11) — every trip and every template of this
 * device as one portable YAML file.
 *
 * Local Mode has no server copy, so FR-19.6 puts a one-tap backup behind the
 * G-2 detail. Per-document export already existed in M17, but a backup that
 * asks the user to remember each trip and template one by one is not a backup
 * anybody performs; this writes them all, in the same shape the importer
 * reads (`parsePortableAll`), so restoring is the ordinary M18 path.
 *
 * Pure by construction: the caller collects the rows out of the stores, this
 * decides only what the file contains.
 */

import { compositionFrom, joinDocuments, serializeTemplate, serializeTrip } from '@/domain/portable'
import type {
  Container,
  MasterItem,
  Template,
  TemplateInclude,
  TemplateItem,
  Traveler,
  Trip,
  TripItem,
} from '@/types/domain'

/** One template with the positions that belong to it. */
export interface BackupTemplate {
  template: Template
  items: TemplateItem[]
}

/** One trip with everything the portable shape references by name. */
export interface BackupTrip {
  trip: Trip
  items: TripItem[]
  travelers: Traveler[]
  containers: Container[]
}

export interface BackupSource {
  templates: BackupTemplate[]
  trips: BackupTrip[]
  /** Resolves a template position's master item — its name is what travels. */
  masterItem: (id: string) => MasterItem | undefined
  /**
   * FR-27.1/27.7: what a Ferien-Vorlage is composed of, and the tasks its
   * positions carry. A backup that dropped the composition would restore
   * every Vorlage as an empty shell.
   */
  composition: {
    includes: TemplateInclude[]
    templates: Template[]
    itemsOf: (templateId: string) => TemplateItem[]
    tasksOf: (templateItemId: string) => string[]
  }
}

/**
 * buildBackup writes the whole device as one multi-document YAML file, or an
 * empty string when there is nothing to write.
 *
 * Trip progress travels with it: a restore that silently unpacked everything
 * would be worse than no restore at all.
 */
export function buildBackup(source: BackupSource): string {
  const documents = [
    ...source.templates.map((entry) =>
      serializeTemplate(
        entry.template,
        entry.items,
        source.masterItem,
        compositionFrom(entry.template, source.composition),
      ),
    ),
    ...source.trips.map((entry) =>
      serializeTrip({
        trip: entry.trip,
        items: entry.items,
        travelers: entry.travelers,
        containers: entry.containers,
        includeProgress: true,
      }),
    ),
  ]
  return joinDocuments(documents)
}

/** backupFilename dates the file from an injected clock (UTC, so it is stable). */
export function backupFilename(now: number): string {
  return `jitpack-backup-${new Date(now).toISOString().slice(0, 10)}.yaml`
}
