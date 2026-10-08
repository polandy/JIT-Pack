/**
 * What a screen that carries GPX tracks does with them (FR-29.17, FR-29.20,
 * FR-31.15): a chosen file read on this device and uploaded, another file
 * put under a track, a download, a confirmed removal, and the route editor
 * opened on a track's own file or on nothing — its save written back as a
 * new track or as the old one's file, with an undo that puts the old file
 * back. An idea's board and an excursion's list use it alike; what the
 * tracks hang on is the owner's, reached through `TrackOwner`.
 */
import { computed, ref, type Ref } from 'vue'

import type { TrackUpload } from '@/api/types'
import type { EditedTrack, SavedRoute } from '@/lib/trackEdit'
import { trackHueClass, type MapLine } from '@/lib/trackColors'
import { gpxFileName, writeGpx } from '@/domain/shared/route'
import {
  MAX_TRACKS,
  decodeLine,
  parseGpx,
  readTrack,
  type TrackSettings,
} from '@/domain/shared/track'
import { t } from '@/i18n'
import { confirmDestructive } from '@/composables/shared/confirm'
import { saveBlob } from '@/lib/download'
import { presentToast } from '@/composables/shared/toast'
import type { TrackFields } from '@/types/domain'

/** The writes of whatever carries the tracks: an idea, an excursion. */
export interface TrackOwner<T extends TrackFields> {
  /** Its tracks, in their order. */
  tracks(): T[]
  /** A new track behind the last one; null when it carries as many as it may. */
  add(upload: TrackUpload): Promise<string | null>
  replace(track: T, upload: TrackUpload): Promise<void>
  update(track: T, settings: TrackSettings): void
  remove(track: T): void
  file(track: T): Promise<Blob | null>
}

/** The route being edited: which track (none when drawn from nothing) and its file. */
interface RouteEditing<T extends TrackFields> {
  owner: TrackOwner<T>
  track: T | null
  original: EditedTrack | null
  /** The file as it was, for the undo after a replacement. */
  gpx: string | null
}

/**
 * Binds the track acts to the owner `current` names — null while nothing
 * that carries tracks is open, when every act does nothing. Toasts stand
 * above `toastAnchor`, the screen's FAB.
 */
export function useTrackOwner<T extends TrackFields>(
  current: () => TrackOwner<T> | null,
  toastAnchor: string,
) {
  /** Whether a file is being read and sent; the controls that start one wait for it. */
  const busy = ref(false)
  const editing = ref<RouteEditing<T> | null>(null) as Ref<RouteEditing<T> | null>

  function toast(message: string) {
    void presentToast({ message, positionAnchor: toastAnchor })
  }

  function refusal(reason: 'too_large' | 'no_track') {
    toast(reason === 'too_large' ? t('track.tooLarge') : t('track.noTrack'))
  }

  /**
   * Reads a chosen file on this device (ADR-085) and hands what it read to
   * `send`. A file that is too large or holds no track is said and kept
   * nowhere; so is an upload that failed — Server Mode uploads now or not
   * at all, as for a picture.
   */
  async function withFile(file: File, send: (upload: TrackUpload) => Promise<unknown>) {
    if (busy.value) return
    busy.value = true
    try {
      const read = readTrack(await file.text(), file.name, file.size)
      if (!read.ok) {
        refusal(read.reason)
        return
      }
      await send(read.upload)
    } catch {
      toast(t('track.uploadFailed'))
    } finally {
      busy.value = false
    }
  }

  async function add(file: File) {
    const owner = current()
    if (owner) await withFile(file, (upload) => owner.add(upload))
  }

  async function replace(track: T, file: File) {
    const owner = current()
    if (owner) await withFile(file, (upload) => owner.replace(track, upload))
  }

  function update(track: T, settings: TrackSettings) {
    current()?.update(track, settings)
  }

  async function download(track: T) {
    const file = await current()?.file(track)
    if (file) saveBlob(file, track.file_name)
    else toast(t('track.uploadFailed'))
  }

  async function remove(track: T) {
    const owner = current()
    if (!owner) return
    const confirmed = await confirmDestructive({
      header: t('track.remove'),
      message: t('track.removeConfirm'),
      confirmLabel: t('track.remove'),
      testid: 'track-remove-confirm',
    })
    if (confirmed) owner.remove(track)
  }

  // --- Editing a route (FR-29.20, ADR-088) ---

  const editedTracks = computed(() => editing.value?.owner.tracks() ?? [])

  /** The owner's other tracks, faint under the route, in the colours its card gives them. */
  const others = computed<MapLine[]>(() =>
    editedTracks.value.flatMap((track, index) =>
      track.id === editing.value?.track?.id
        ? []
        : [
            {
              id: track.id,
              points: decodeLine(track.line),
              hueClass: trackHueClass(index),
              chosen: false,
            },
          ],
    ),
  )

  /** The edited track keeps its colour; a new one takes the next. */
  const hueClass = computed(() => {
    const edited = editing.value?.track
    const index = edited
      ? editedTracks.value.findIndex((track) => track.id === edited.id)
      : editedTracks.value.length
    return trackHueClass(Math.max(0, index))
  })

  /** Whether the save may add a track rather than only replace one. */
  const canAddNew = computed(() => editedTracks.value.length < MAX_TRACKS)

  /**
   * Opens the editor: on a track's own file, read again from where it is
   * kept (the row's line is thinned and carries no heights), or on nothing.
   */
  async function edit(track: T | null) {
    const owner = current()
    if (!owner || busy.value) return
    if (!track) {
      editing.value = { owner, track: null, original: null, gpx: null }
      return
    }
    busy.value = true
    try {
      const file = await owner.file(track)
      const gpx = file ? await file.text() : null
      const points = gpx ? parseGpx(gpx).points : []
      if (!gpx || points.length < 2) {
        toast(t('track.loadFailed'))
        return
      }
      editing.value = {
        owner,
        track,
        gpx,
        original: { name: track.name, kind: track.kind, withKid: track.with_kid, points },
      }
    } finally {
      busy.value = false
    }
  }

  function closeEditor() {
    editing.value = null
  }

  /**
   * Saves an edited route as the GPX file this device writes (ADR-088),
   * through FR-29.17's upload: a new track — carrying the original's
   * *Mit Kind* and pauses — or the original's file replaced, with an undo
   * that puts the old file back.
   */
  async function save(route: SavedRoute) {
    const open = editing.value
    if (!open || busy.value) return
    const xml = writeGpx(route.name, route.kind, route.points)
    const read = readTrack(xml, gpxFileName(route.name), new Blob([xml]).size)
    if (!read.ok) {
      refusal(read.reason)
      return
    }
    const upload: TrackUpload = { ...read.upload, name: route.name, kind: route.kind }
    const { owner, track: source } = open
    busy.value = true
    try {
      if (route.how === 'replace' && source && open.gpx !== null) {
        await owner.replace(source, upload)
        editing.value = null
        const old = open.gpx
        await presentToast({
          message: t('track.routeReplaced', { name: source.name }),
          positionAnchor: toastAnchor,
          cssClass: 'pack-toast',
          buttons: [{ text: t('packing.undo'), handler: () => void putBack(owner, source, old) }],
        })
        return
      }
      const id = await owner.add(upload)
      editing.value = null
      const added = id ? owner.tracks().find((track) => track.id === id) : undefined
      if (added && source && (source.with_kid || source.pause_min > 0)) {
        owner.update(added, { with_kid: source.with_kid, pause_min: source.pause_min })
      }
      toast(t('track.routeSavedNew'))
    } catch {
      toast(t('track.uploadFailed'))
    } finally {
      busy.value = false
    }
  }

  /** The replacement's undo: the old file uploaded again under the same id. */
  async function putBack(owner: TrackOwner<T>, track: T, gpx: string) {
    const read = readTrack(gpx, track.file_name, new Blob([gpx]).size)
    if (!read.ok) return
    try {
      await owner.replace(track, read.upload)
    } catch {
      toast(t('track.uploadFailed'))
    }
  }

  return {
    busy,
    add,
    replace,
    update,
    download,
    remove,
    editor: {
      open: computed(() => editing.value !== null),
      original: computed(() => editing.value?.original ?? null),
      others,
      hueClass,
      canAddNew,
    },
    edit,
    closeEditor,
    save,
  }
}
