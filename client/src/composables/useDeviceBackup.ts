/**
 * FR-19.6's one-tap backup: the whole device as one portable file.
 *
 * Lifted out of App.vue when M17 gained a second caller (FR-19.8's move):
 * one function behind both surfaces, because a second exporter is how the
 * server's copy drifted (ADR-025). Stamps the NFR-4.11 export time; the
 * caller decides what else to refresh with the timestamp it returns.
 */
import { toastController } from '@ionic/vue'
import { computed } from 'vue'

import { t } from '@/i18n'
import { saveText } from '@/lib/download'
import { backupFilename, buildBackup } from '@/local/backup'
import { markExported } from '@/local/exportReminder'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'

/** How long the "saved as …" toast stays up. */
const BACKUP_TOAST_MS = 4000

/** The device backup: whether there is anything to write, and the write. */
export function useDeviceBackup() {
  const masterStore = useMasterStore()
  const tripStore = useTripStore()

  /** Whether a backup would contain anything (NFR-4.11). */
  const hasBackupContent = computed(
    () => masterStore.templateList.length > 0 || tripStore.tripList.length > 0,
  )

  /** Writes the file, stamps the export time and returns that time. */
  async function saveBackup(now: number = Date.now()): Promise<number> {
    const yaml = buildBackup({
      templates: masterStore.templateList.map((template) => ({
        template,
        items: masterStore.getTemplateItems(template.id),
      })),
      trips: tripStore.tripList.map((trip) => ({
        trip,
        items: tripStore.getItems(trip.id),
        travelers: tripStore.getTravelers(trip.id),
        containers: tripStore.getContainers(trip.id),
        // FR-27.4: how the trip follows its groups travels with it, or a
        // restored device starts asking questions the user already answered.
        sources: tripStore.getTemplateSources(trip.id),
        generated: tripStore.getGeneratedPositions(trip.id),
        appliedChanges: tripStore.getAppliedChanges(trip.id),
      })),
      ...masterStore.portableResolvers(),
      template: (id) => masterStore.getTemplate(id),
      composition: masterStore.compositionSource(),
    })
    const filename = backupFilename(now)
    saveText(yaml, filename)
    markExported(now)
    const toast = await toastController.create({
      message: t('sync.detail.backupSaved', { file: filename }),
      duration: BACKUP_TOAST_MS,
      position: 'top',
    })
    await toast.present()
    return now
  }

  return { hasBackupContent, saveBackup }
}
