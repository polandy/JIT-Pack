/**
 * English catalogue — the primary locale (NFR-4.12) and the fallback for
 * any key a translation is missing.
 *
 * Keys are flat and dot-namespaced by screen or concern rather than nested,
 * so a missing translation is a single visible diff against this file and
 * the catalogue-integrity test can compare key sets directly.
 *
 * A message may carry two forms separated by ' | ' (singular | plural);
 * `t` picks between them from the `n` parameter.
 */
import { sharedEn } from './shared/en'
import { inventoryEn } from './inventory/en'
import { templatesEn } from './templates/en'
import { packingEn } from './packing/en'
import { tripsEn } from './trips/en'
import { tasksEn } from './tasks/en'
import { dashboardEn } from './dashboard/en'
import { excursionsEn } from './excursions/en'
import { tracksEn } from './tracks/en'
import { settingsEn } from './settings/en'
import { syncEn } from './sync/en'

export const en = {
  ...sharedEn,
  ...inventoryEn,
  ...templatesEn,
  ...packingEn,
  ...tripsEn,
  ...tasksEn,
  ...dashboardEn,
  ...excursionsEn,
  ...tracksEn,
  ...settingsEn,
  ...syncEn,
} as const
