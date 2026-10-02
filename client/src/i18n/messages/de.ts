/**
 * German catalogue (NFR-4.12) — fully supported alongside English, not a stub.
 *
 * Must define exactly the key set of en.ts; the catalogue-integrity test
 * enforces that, so a new English string cannot ship untranslated.
 *
 * Wording follows the concept prototype (dev-docs/UI_Concept_Prototype.html),
 * which was written and tested in German — the informal "du" address it uses
 * is deliberate for a household app.
 */

import { sharedDe } from './shared/de'
import { inventoryDe } from './inventory/de'
import { templatesDe } from './templates/de'
import { packingDe } from './packing/de'
import { tripsDe } from './trips/de'
import { excursionsDe } from './excursions/de'
import { settingsDe } from './settings/de'
import type { en } from './en'

export const de: Record<keyof typeof en, string> = {
  ...sharedDe,
  ...inventoryDe,
  ...templatesDe,
  ...packingDe,
  ...tripsDe,
  ...excursionsDe,
  ...settingsDe,
}
