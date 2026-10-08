import type { TrackKind } from '@/api/types'
import type { TrackPoint } from '@/domain/shared/track'
import type { RoutePoint } from '@/domain/shared/route'

/** The track an edit starts from: its file's points and the settings its time is counted with. */
export interface EditedTrack {
  name: string
  kind: TrackKind
  withKid: boolean
  points: TrackPoint[]
}

/** What saving hands up: how, under which name, and the route's points. */
export interface SavedRoute {
  how: 'new' | 'replace'
  name: string
  kind: TrackKind
  points: RoutePoint[]
}
