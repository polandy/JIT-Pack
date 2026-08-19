/**
 * The one-line summary a group row shows (FR-27.12).
 *
 * The cut is `previewLines` in the domain — how many names fit is a rule, and
 * it is tested there. What lives here is only the *sentence*: the names joined,
 * and the remainder as a localized "+N". It is a `lib/` module rather than a
 * domain one because it reaches for `t()`, which the pure layer must not.
 */
import { t } from '@/i18n'
import type { LinePreview } from '@/domain/templates'

/** "Kamera · Stativ +2", or just the names when everything fits. */
export function previewText(preview: LinePreview): string {
  const names = preview.names.join(' · ')
  return preview.rest > 0 ? `${names} ${t('templates.previewMore', { n: preview.rest })}` : names
}
