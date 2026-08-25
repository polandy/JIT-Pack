<script setup lang="ts">
/**
 * M23 — Hidden master data (FR-24.3, ADR-033)
 *
 * The other half of the lifecycle delete: a master item or Vorlage something
 * still uses is *retired* rather than removed, and until this screen existed
 * that was one-way in practice — the data half of the FR's "free restore"
 * was built and no surface listed the rows it applied to.
 *
 * It lives beside the conflict log rather than inside M9 and M7, for the
 * same reason the conflict log does: it is a corrective surface, used after
 * a mistake and never while browsing. Retired rows staying out of the normal
 * flow is the point of retiring them, so a filter chip on M9's tag axis (a
 * lifecycle state is not a tag) and a section at the foot of both lists (two
 * surfaces for one rule, in the screen FR-24.4 made lean on purpose) were
 * both rejected.
 *
 * **Restoring can collide.** Retiring frees the name — the unique indexes
 * are partial over the active rows — so an active row may hold it by now.
 * The collision is met here, before the mutation is enqueued, and the way
 * out is a new name written in the same mutation (`domain/masterRestore.ts`).
 */
import {
  IonPage,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonIcon,
  IonButton,
  IonSegment,
  IonSegmentButton,
  alertController,
} from '@ionic/vue'
import { archiveOutline, arrowUndoOutline, trashOutline } from 'ionicons/icons'
import { computed, inject, ref } from 'vue'

import ItemMark from '@/components/items/ItemMark.vue'
import { t, formatDate } from '@/i18n'
import type { MessageKey } from '@/i18n'
import { presentToast } from '@/lib/toast'
import { useMasterStore } from '@/stores/masterStore'
import { DELETION_REMOVE } from '@/domain/masterDeletion'
import { RESTORE_NAME_TAKEN, type RestoreVerdict } from '@/domain/masterRestore'
import type { MasterItem, Template } from '@/types/domain'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'

const store = useMasterStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

/** The two things FR-24.3 governs, and the two segments this screen has. */
const SEGMENT_ITEMS = 'items'
const SEGMENT_TEMPLATES = 'templates'
type Segment = typeof SEGMENT_ITEMS | typeof SEGMENT_TEMPLATES

const segment = ref<Segment>(SEGMENT_ITEMS)

/** How long the toast a restore raises stays up, in ms — one sentence's worth. */
const TOAST_MS = 3000

/**
 * One row of either list. The screen renders items and Vorlagen the same
 * way on purpose: the same rule hid them and the same two actions apply.
 */
interface RetiredRow {
  id: string
  name: string
  retiredAt: string | null
  mark: string | null
  /** Only an item has a photo that outranks its mark (FR-28.4). */
  photoItem: MasterItem | null
  references: number
  /** Whether a *permanent* delete would now be physical (FR-24.3's second branch). */
  removable: boolean
  /** The sentence the permanent-delete confirm carries. */
  removeKey: MessageKey
  /** The sentence a collided restore explains itself with. */
  takenKey: MessageKey
  verdict: (name?: string) => RestoreVerdict<MasterItem> | RestoreVerdict<Template> | null
  restore: (name?: string) => boolean
  purge: () => void
}

const itemRows = computed<RetiredRow[]>(() =>
  store.retiredItemList.map((item) => {
    const outlook = orchestrator.masterItemDeletionOutlook(item.id)
    return {
      id: item.id,
      name: item.name,
      retiredAt: item.retired_at ?? null,
      mark: item.icon ?? null,
      photoItem: item,
      references: outlook.references,
      removable: outlook.kind === DELETION_REMOVE,
      removeKey: outlook.certain ? 'items.editor.deleteRemove' : 'items.editor.deleteRemoveMaybe',
      takenKey: 'retired.nameTakenItem',
      verdict: (name?: string) => orchestrator.masterItemRestoreVerdict(item.id, name),
      restore: (name?: string) => orchestrator.restoreMasterItem(item.id, name),
      purge: () => orchestrator.deleteMasterItem(item.id),
    }
  }),
)

const templateRows = computed<RetiredRow[]>(() =>
  store.retiredTemplateList.map((template) => {
    const outlook = orchestrator.templateDeletionOutlook(template.id)
    return {
      id: template.id,
      name: template.name,
      retiredAt: template.retired_at ?? null,
      mark: template.icon ?? null,
      photoItem: null,
      references: outlook.references,
      removable: outlook.kind === DELETION_REMOVE,
      removeKey: outlook.certain ? 'templates.deleteRemove' : 'templates.deleteRemoveMaybe',
      // Which scope holds the name is a fact, not a bug — `templates.name`
      // is UNIQUE instance-wide and across both scopes (FR-1.6).
      takenKey: 'retired.nameTakenGroup',
      verdict: (name?: string) => orchestrator.templateRestoreVerdict(template.id, name),
      restore: (name?: string) => orchestrator.restoreTemplate(template.id, name),
      purge: () => orchestrator.deleteTemplate(template.id),
    }
  }),
)

const rows = computed(() => (segment.value === SEGMENT_ITEMS ? itemRows.value : templateRows.value))

const emptyKey = computed<MessageKey>(() =>
  segment.value === SEGMENT_ITEMS ? 'retired.emptyItems' : 'retired.emptyTemplates',
)

/**
 * The sentence naming who holds the name. Asked through the orchestrator's
 * own rule rather than re-derived, so what the alert says and what refused
 * the restore can never disagree.
 */
function takenMessage(row: RetiredRow, name: string): string {
  const verdict = row.verdict(name)
  // Only a taken name has a holder to name. The other two verdicts reach
  // here only if the row vanished under us, and the row's own sentence is
  // the least wrong thing to say then.
  if (verdict === null || verdict.kind !== RESTORE_NAME_TAKEN) return t(row.takenKey, { name })
  const holder = verdict.holder
  if (segment.value === SEGMENT_TEMPLATES) {
    const scope = (holder as Template).kind
    return t(scope === 'group' ? 'retired.nameTakenGroup' : 'retired.nameTakenTemplate', {
      name: holder.name,
    })
  }
  return t('retired.nameTakenItem', { name: holder.name })
}

/**
 * The restore. Non-destructive and reversible by the same delete that hid
 * the row, so it takes no confirm step — a dialog here would ask the user
 * to agree to what they just asked for.
 */
async function onRestore(row: RetiredRow) {
  if (row.restore()) {
    await presentToast({ message: t('retired.restored', { name: row.name }), duration: TOAST_MS })
    return
  }
  await promptForFreeName(row)
}

/**
 * The collision, as the user meets it: the sentence names who holds the
 * name, and the input is the way out rather than a dead end. Returning
 * `false` from the handler keeps the alert open with the typed name, the
 * same idiom M7's rename uses — dismissing it would throw the edit away.
 */
async function promptForFreeName(row: RetiredRow) {
  const alert = await alertController.create({
    header: t('retired.nameTakenTitle'),
    message: takenMessage(row, row.name),
    inputs: [
      {
        name: 'name',
        value: row.name,
        placeholder: t('retired.namePlaceholder'),
        attributes: { 'aria-label': 'name' },
      },
    ],
    buttons: [
      { text: t('common.cancel'), role: 'cancel' },
      {
        text: t('retired.restore'),
        handler: async (values: { name?: string }) => {
          const name = values.name?.trim()
          if (!name) return false
          if (!row.restore(name)) {
            await presentToast({ message: takenMessage(row, name), duration: TOAST_MS })
            return false
          }
          await presentToast({ message: t('retired.restored', { name }), duration: TOAST_MS })
          return true
        },
      },
    ],
  })
  alert.setAttribute('data-testid', 'm23-name-taken')
  await alert.present()
}

/**
 * FR-24.3's second branch, reached again. Once whatever kept the row alive
 * is itself gone the row is unreferenced, and without this a retire would
 * be permanent by omission. Offered only where the delete would actually be
 * physical, so the button never does nothing.
 */
async function onPurge(row: RetiredRow) {
  const alert = await alertController.create({
    header: t('retired.purgeConfirm', { name: row.name }),
    message: t(row.removeKey),
    buttons: [
      { text: t('common.cancel'), role: 'cancel' },
      {
        text: t('retired.purge'),
        role: 'destructive',
        handler: () => {
          row.purge()
          void presentToast({
            message: t('retired.purged', { name: row.name }),
            duration: TOAST_MS,
          })
        },
      },
    ],
  })
  alert.setAttribute('data-testid', 'm23-purge-confirm')
  await alert.present()
}

function hiddenOn(row: RetiredRow): string {
  return row.retiredAt === null
    ? ''
    : t('retired.hiddenOn', { date: formatDate(new Date(row.retiredAt)) })
}
</script>

<template>
  <IonPage>
    <IonContent>
      <!-- No <h1>: the route carries `titleKey`, so the one header bar
           already names this screen (ADR-011). A second copy of the same
           words cost two lines of a 430 px page. -->
      <p class="page-hint ion-padding">{{ t('retired.hint') }}</p>

      <IonSegment
        :value="segment"
        data-testid="m23-segment"
        @ionChange="(e: CustomEvent) => (segment = e.detail.value as Segment)"
      >
        <IonSegmentButton :value="SEGMENT_ITEMS" data-testid="m23-segment-items">
          <IonLabel>{{ t('retired.segmentItems') }} ({{ itemRows.length }})</IonLabel>
        </IonSegmentButton>
        <IonSegmentButton :value="SEGMENT_TEMPLATES" data-testid="m23-segment-templates">
          <IonLabel>{{ t('retired.segmentTemplates') }} ({{ templateRows.length }})</IonLabel>
        </IonSegmentButton>
      </IonSegment>

      <div v-if="rows.length === 0" class="empty-state" data-testid="m23-empty">
        <IonIcon :icon="archiveOutline" class="empty-icon" />
        <p>{{ t(emptyKey) }}</p>
      </div>

      <IonList v-else class="jp-card list-card" lines="full">
        <IonItem v-for="row in rows" :key="row.id" data-testid="m23-row">
          <ItemMark
            slot="start"
            :mark="row.mark"
            surface="packing"
            :photo-item="row.photoItem"
            :size="22"
            class="row-mark"
          />
          <IonLabel>
            <h2 data-testid="m23-row-name">{{ row.name }}</h2>
            <p>{{ hiddenOn(row) }}</p>
            <p v-if="row.references > 0" class="usage">
              {{ t('retired.stillUsed', { n: row.references }) }}
            </p>
          </IonLabel>

          <div slot="end" class="row-actions">
            <IonButton
              fill="outline"
              size="small"
              data-testid="m23-restore"
              @click="onRestore(row)"
            >
              <IonIcon slot="start" :icon="arrowUndoOutline" />
              {{ t('retired.restore') }}
            </IonButton>
            <IonButton
              v-if="row.removable"
              fill="clear"
              size="small"
              color="danger"
              :aria-label="t('retired.purge')"
              data-testid="m23-purge"
              @click="onPurge(row)"
            >
              <IonIcon slot="icon-only" :icon="trashOutline" />
            </IonButton>
          </div>
        </IonItem>
      </IonList>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.page-hint {
  color: var(--ion-color-medium);
  font-size: var(--jp-text-sm);
  margin: 0;
}

.list-card {
  margin: 12px 8px 8px;
}

.row-mark {
  margin-inline-end: 12px;
}

.usage {
  font-size: var(--jp-text-xs);
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: var(--ion-color-medium);
  margin-top: 48px;
  padding: 0 24px;
  text-align: center;
}

.empty-icon {
  font-size: var(--jp-icon-2xl);
  margin-bottom: 16px;
}
</style>
