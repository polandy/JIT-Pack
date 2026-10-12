/**
 * M27's delete (FR-31.1): asked first, then the excursion goes — with the
 * day of the idea it was made from, through the planner's port (FR-29.15) —
 * and the screen returns to the trip's excursions.
 */
import { inject } from 'vue'
import { useRouter } from 'vue-router'

import { confirmDestructive } from '@/composables/shared/confirm'
import { useOrchestrator } from '@/composables/shared/useOrchestrator'
import { t } from '@/i18n'
import { IDEA_PLAN_WRITES } from '@/kernel/ideaBridge'
import { tripExcursionsPath } from '@/router/paths'
import type { Excursion } from '@/types/domain'

/** Builds M27's ⋮ *Löschen* for one trip. */
export function useExcursionDelete(tripId: string) {
  const orchestrator = useOrchestrator()
  const router = useRouter()
  const ideaPlan = inject(IDEA_PLAN_WRITES, null)

  return async function remove(excursion: Excursion | null | undefined): Promise<void> {
    if (!excursion) return
    const ok = await confirmDestructive({
      header: t('excursions.delete'),
      message: t('excursions.deleteConfirm', { name: excursion.name }),
      confirmLabel: t('common.delete'),
      testid: 'm27-delete-confirm',
    })
    if (!ok) return
    orchestrator.excursions.deleteExcursion(tripId, excursion.id, ideaPlan ?? undefined)
    void router.replace(tripExcursionsPath(tripId))
  }
}
