import { computed, type ComputedRef } from 'vue'

import type { useOrchestrator } from '@/composables/shared/useOrchestrator'
import type { PageLinks } from './domain/connections'

/** The server's read of a short link's page, where this device has one (FR-29.16). */
export function usePageLinks(
  tripId: string,
  orchestrator: ReturnType<typeof useOrchestrator>,
): ComputedRef<PageLinks | null> {
  return computed(() => {
    const preview = orchestrator.moduleHost.linkPreview
    if (!preview.offered()) return null
    return async (url) => (await preview.read(tripId, url))?.links ?? null
  })
}
