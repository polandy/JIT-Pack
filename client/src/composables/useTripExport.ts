/**
 * FR-18.3's single-trip YAML export, and the part of a trip every portable
 * file is built from.
 *
 * One function behind M2's ⋮ and M17's Local-Mode download, and one
 * `tripParts` behind those and the device backup: the stores are read into
 * `serializeTrip`'s input in exactly one place, so a column added to the
 * portable format cannot reach one caller and miss the others. The device
 * backup adds FR-27.4's refresh state on top; a single trip leaves it out
 * (`serializeTrip`'s `refresh`).
 */
import { serializeTrip } from '@/domain/portable'
import { safeFilename, saveText } from '@/lib/download'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import type { Trip } from '@/types/domain'

/** Reading a trip out of the stores, and writing one to a file. */
export function useTripExport() {
  const tripStore = useTripStore()
  const masterStore = useMasterStore()

  /** The trip's own rows, as every portable file takes them. */
  function tripParts(trip: Trip) {
    return {
      trip,
      items: tripStore.getItems(trip.id),
      travelers: tripStore.getTravelers(trip.id),
      containers: tripStore.getContainers(trip.id),
    }
  }

  /** Writes one trip as `<name>.yaml`, with or without its progress (FR-18.3). */
  function exportTripYaml(tripId: string, options: { includeProgress: boolean }) {
    const trip = tripStore.getTrip(tripId)
    if (!trip) return
    const yaml = serializeTrip({
      ...tripParts(trip),
      includeProgress: options.includeProgress,
      ...masterStore.portableResolvers(),
    })
    saveText(yaml, `${safeFilename(trip.name)}.yaml`)
  }

  return { tripParts, exportTripYaml }
}
