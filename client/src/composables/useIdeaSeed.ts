/**
 * FR-29.13: a screen entered from an idea opens its creator pre-filled.
 *
 * The idea's sheet links to M27, M25 or M6 with `?fromIdea=` (`ideaBridgePath`).
 * The screen hands its creator the idea once both have arrived — the trip's
 * partition, which a cold start may still be loading, and the idea in it —
 * and then takes the parameter off the address with a replace, so a reload or
 * a return to the screen does not open the creator a second time. The origin
 * beside it (`?from=`) stays: `‹ back` still leads to the idea.
 *
 * Ionic keeps a page alive behind the next one, so the watch also asks that
 * the route is still this screen's — otherwise a hidden M6 would answer a link
 * meant for M25.
 */
import { inject, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { IDEA_LOOKUP, type IdeaSeed } from '@/lib/ideaBridge'
import { FROM_IDEA_QUERY_PARAM } from '@/router/paths'

export function useIdeaSeed(
  tripId: string,
  ready: () => boolean,
  open: (seed: IdeaSeed) => void,
): void {
  const route = useRoute()
  const router = useRouter()
  const lookup = inject(IDEA_LOOKUP, null)
  const ownPath = route.path

  // The source is the idea's id, not its seed: a seed is a fresh object on
  // every read, and a watch on it would open the creator again on any change
  // to the idea before the replace lands.
  watch(
    () => {
      const ideaId = route.query[FROM_IDEA_QUERY_PARAM]
      if (route.path !== ownPath || typeof ideaId !== 'string' || !ready()) return undefined
      return lookup?.idea(tripId, ideaId) ? ideaId : undefined
    },
    (ideaId) => {
      const seed = ideaId === undefined ? undefined : lookup?.idea(tripId, ideaId)
      if (!seed) return
      open(seed)
      const query = { ...route.query }
      delete query[FROM_IDEA_QUERY_PARAM]
      void router.replace({ path: route.path, query })
    },
    { immediate: true },
  )
}
