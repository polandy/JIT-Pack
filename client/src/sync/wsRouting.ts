/**
 * What the orchestrator does with each WebSocket frame (Sync-API §7), as a
 * pure switch over the generated `WSEvent` union: each case reads the payload
 * its type carries, and a frame type the server adds fails the type check in
 * this file rather than being dropped unseen.
 *
 * The frames are pings, not data (P-1): the work they start — a pull, a
 * presence update, a lock — is the orchestrator's, handed in as `WSRoutes`.
 */
import { WS_EVENT_TYPE } from '@/api/types'
import type { LiveLocation, PresenceMember, RosterMember, WSEvent } from '@/api/types'
import { assertNever } from '@/lib/assertNever'

/** The orchestrator's answer to each frame. */
export interface WSRoutes {
  drainTrip(tripId: string): void
  drainMaster(): void
  setPresence(tripId: string, users: PresenceMember[]): void
  setRoster(users: RosterMember[]): void
  applyLocation(frame: LiveLocation): void
  lockItem(tripId: string, itemId: string, byUser: string): void
  unlockItem(tripId: string, itemId: string): void
  /** Thin ping (§7): the row itself comes via GET /notifications. */
  surfaceNotifications(): void
}

/**
 * Hands one frame to its route. A frame missing the ids its route needs is
 * dropped: it is runtime data, whatever its type says.
 */
export function routeWSEvent(event: WSEvent, to: WSRoutes): void {
  switch (event.type) {
    case WS_EVENT_TYPE['trip.changed']: {
      const tripId = event.payload?.trip_id
      if (tripId) to.drainTrip(tripId)
      return
    }
    case WS_EVENT_TYPE['master.changed']:
      to.drainMaster()
      return
    case WS_EVENT_TYPE.presence: {
      const tripId = event.payload?.trip_id
      if (tripId) to.setPresence(tripId, event.payload.users ?? [])
      return
    }
    case WS_EVENT_TYPE.roster:
      to.setRoster(event.payload?.users ?? [])
      return
    case WS_EVENT_TYPE.location: {
      const frame = event.payload
      if (frame?.trip_id && frame.user_id) to.applyLocation(frame)
      return
    }
    case WS_EVENT_TYPE['item.locked']: {
      const { trip_id: tripId, item_id: itemId, by_user: byUser } = event.payload ?? {}
      if (tripId && itemId) to.lockItem(tripId, itemId, byUser ?? '')
      return
    }
    case WS_EVENT_TYPE['item.unlocked']: {
      const { trip_id: tripId, item_id: itemId } = event.payload ?? {}
      if (tripId && itemId) to.unlockItem(tripId, itemId)
      return
    }
    case WS_EVENT_TYPE['notification.created']:
      to.surfaceNotifications()
      return
    case WS_EVENT_TYPE.pong:
      // The socket's watchdog eats it before it gets here.
      return
    default:
      assertNever(event)
  }
}
