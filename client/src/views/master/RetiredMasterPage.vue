<script setup lang="ts">
/**
 * M23 — Hidden master data (FR-24.3, ADR-034)
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
 *
 * **Several at once** (FR-24.3 over ADR-075): a hold, a right-click or the
 * app bar's icon selects rows like every other list, and the bar restores or
 * deletes the selection through the same per-row acts. A batch never opens a
 * prompt per collision: the rows whose name is free come back in one go, the
 * colliding ones stay selected, and a selection of one *is* the single-row
 * restore, prompt included — so the way to a new name is the one it was.
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
} from '@ionic/vue'
import { archiveOutline, arrowUndoOutline, trashOutline } from 'ionicons/icons'
import { computed, ref, watch } from 'vue'

import BulkBar from '@/components/global/BulkBar.vue'
import EmptyState from '@/components/global/EmptyState.vue'
import SelectBox from '@/components/global/SelectBox.vue'
import ItemMark from '@/components/items/ItemMark.vue'
import { t, formatDate } from '@/i18n'
import type { MessageKey } from '@/i18n'
import { presentToast } from '@/lib/toast'
import { useMasterStore } from '@/stores/masterStore'
import { DELETION_REMOVE } from '@/domain/masterDeletion'
import { RESTORE_NAME_TAKEN, type RestoreVerdict } from '@/domain/masterRestore'
import type { MasterItem, Template } from '@/types/domain'
import { confirmDestructive, promptText } from '@/lib/confirm'
import {
  DELETION_SUBJECT_ITEM,
  DELETION_SUBJECT_TEMPLATE,
  deletionOutlookKey,
} from '@/lib/deletionLabels'
import { useOrchestrator } from '@/composables/useOrchestrator'
import { setHeaderActions, type HeaderAction } from '@/composables/useHeaderActions'
import { setHeaderSelection } from '@/composables/useHeaderSelection'
import { SELECTION_ICON, useRowSelection } from '@/composables/useRowSelection'

const masterStore = useMasterStore()
const orchestrator = useOrchestrator()

/** The two things FR-24.3 governs, and the two segments this screen has. */
const SEGMENT_ITEMS = 'items'
const SEGMENT_TEMPLATES = 'templates'
type Segment = typeof SEGMENT_ITEMS | typeof SEGMENT_TEMPLATES

const segment = ref<Segment>(SEGMENT_ITEMS)

/** How long the toast a restore raises stays up, in ms — one sentence's worth. */

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
  /**
   * FR-24.15: the item this row was merged into, by name, or null. A row that
   * got here by a merge says so, because its restore is otherwise an offer to
   * re-create the duplicate the user has just removed.
   */
  mergedInto: string | null
  /** The sentence the permanent-delete confirm carries. */
  removeKey: MessageKey
  /** The sentence a collided restore explains itself with. */
  takenKey: MessageKey
  verdict: (name?: string) => RestoreVerdict<MasterItem> | RestoreVerdict<Template> | null
  restore: (name?: string) => boolean
  purge: () => void
}

const itemRows = computed<RetiredRow[]>(() =>
  masterStore.retiredItemList.map((item) => {
    const outlook = orchestrator.masterItemDeletionOutlook(item.id)
    return {
      id: item.id,
      name: item.name,
      retiredAt: item.retired_at ?? null,
      mark: item.icon ?? null,
      photoItem: item,
      references: outlook.references,
      removable: outlook.kind === DELETION_REMOVE,
      mergedInto: item.merged_into_id
        ? (masterStore.getItem(item.merged_into_id)?.name ?? null)
        : null,
      // Read only where `removable` is true, and there the key is the remove
      // one — a retiring row's button is not rendered.
      removeKey: deletionOutlookKey(DELETION_SUBJECT_ITEM, outlook),
      takenKey: 'retired.nameTakenItem',
      verdict: (name?: string) => orchestrator.masterItemRestoreVerdict(item.id, name),
      restore: (name?: string) => orchestrator.restoreMasterItem(item.id, name),
      purge: () => orchestrator.deleteMasterItem(item.id),
    }
  }),
)

const templateRows = computed<RetiredRow[]>(() =>
  masterStore.retiredTemplateList.map((template) => {
    const outlook = orchestrator.templateDeletionOutlook(template.id)
    return {
      id: template.id,
      name: template.name,
      retiredAt: template.retired_at ?? null,
      mark: template.icon ?? null,
      photoItem: null,
      references: outlook.references,
      removable: outlook.kind === DELETION_REMOVE,
      // A Vorlage cannot be merged (FR-24.15 is about items), so this is
      // always null here rather than optional on the row.
      mergedInto: null,
      removeKey: deletionOutlookKey(DELETION_SUBJECT_TEMPLATE, outlook),
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
 * ADR-033: the archive is a view of the master partition, so „nothing is
 * hidden" is a claim about rows this device may not have yet. Stating it on a
 * cold start is the one sentence on this screen a user would act on — they
 * came here to find something they retired.
 */
const rowsKnown = computed(() => orchestrator.masterDataLoaded())

/**
 * ADR-033 again, for the labels rather than the body: „Artikel (0)" is the
 * same verdict as the sentence below it, and a number is the half a reader
 * trusts. The count is worth keeping once it is real — an empty tab is worth
 * naming — so it waits for `rowsKnown` instead of being dropped.
 */
const itemsSegmentLabel = computed(() =>
  rowsKnown.value
    ? t('retired.segmentItemsCount', { n: itemRows.value.length })
    : t('retired.segmentItems'),
)
const templatesSegmentLabel = computed(() =>
  rowsKnown.value
    ? t('retired.segmentTemplatesCount', { n: templateRows.value.length })
    : t('retired.segmentTemplates'),
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
    await presentToast({ message: t('retired.restored', { name: row.name }) })
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
  await promptText({
    header: t('retired.nameTakenTitle'),
    message: takenMessage(row, row.name),
    value: row.name,
    placeholder: t('retired.namePlaceholder'),
    confirmLabel: t('retired.restore'),
    testid: 'm23-name-taken',
    onConfirm: async (name) => {
      if (!name) return false
      if (!row.restore(name)) {
        await presentToast({ message: takenMessage(row, name) })
        return false
      }
      await presentToast({ message: t('retired.restored', { name }) })
      return true
    },
  })
}

/**
 * FR-24.3's second branch, reached again. Once whatever kept the row alive
 * is itself gone the row is unreferenced, and without this a retire would
 * be permanent by omission. Offered only where the delete would actually be
 * physical, so the button never does nothing.
 */
async function onPurge(row: RetiredRow) {
  const confirmed = await confirmDestructive({
    header: t('retired.purgeConfirm', { name: row.name }),
    message: t(row.removeKey),
    confirmLabel: t('retired.purge'),
    testid: 'm23-purge-confirm',
  })
  if (!confirmed) return
  row.purge()
  void presentToast({ message: t('retired.purged', { name: row.name }) })
}

// --- Several at once (FR-24.3 over ADR-075) ---------------------------------

const selection = useRowSelection()
const { selecting, selected } = selection

/** The selected rows still on screen — a restore elsewhere may have taken one. */
const selectedRows = computed(() => rows.value.filter((row) => selected.value.has(row.id)))

// A selection belongs to the segment it was made in; the other is another list.
watch(segment, () => selection.end())

// G-20: the selection's bar is the app bar's while it lasts.
setHeaderSelection(() =>
  selecting.value
    ? {
        count: selectedRows.value.length,
        total: rows.value.length,
        testid: 'm23',
        onExit: selection.end,
        onAll: () => selection.toggleAll(rows.value.map((row) => row.id)),
      }
    : null,
)

setHeaderActions(() => {
  const select: HeaderAction = {
    id: 'm23-select',
    icon: SELECTION_ICON,
    label: t('selection.start'),
    active: selecting.value,
    onClick: () => (selecting.value ? selection.end() : selection.start()),
  }
  return rows.value.length > 0 || selecting.value ? [select] : []
})

/** A tap on a row does nothing outside the mode; inside it, it picks. */
function onRowClick(row: RetiredRow) {
  selection.click(row.id, true)
}

/**
 * What a batch leaves selected: the rows it could not act on, so the user
 * sees which and can take them one at a time. Nothing left ends the mode.
 */
function keepSelected(ids: readonly string[]) {
  if (ids.length === 0) {
    selection.end()
    return
  }
  selected.value = new Set(ids)
}

/**
 * Restore the selection. A selection of one is the single-row restore, so a
 * collision meets the same prompt it always did; a larger one restores every
 * row whose name is free and keeps the rest selected — N prompts in a row
 * would be a queue of dialogs, each about a name the reader has to recall.
 * Sequential on purpose: two retired rows of one name collide with each
 * other, and the second sees the first already restored.
 */
async function restoreSelected() {
  const chosen = selectedRows.value
  if (chosen.length === 0) return
  if (chosen.length === 1) {
    selection.end()
    await onRestore(chosen[0]!)
    return
  }
  const taken = chosen.filter((row) => !row.restore()).map((row) => row.id)
  const restored = chosen.length - taken.length
  keepSelected(taken)
  const parts = [
    ...(restored > 0 ? [t('retired.bulkRestored', { n: restored })] : []),
    ...(taken.length > 0 ? [t('retired.bulkNameTaken', { n: taken.length })] : []),
  ]
  await presentToast({ message: parts.join(' ') })
}

/**
 * Delete the selection for good — only the rows the single delete would
 * offer it on. A row something still uses has no delete of its own (the
 * button is not rendered), so the batch leaves it selected and says so in
 * the one confirmation, rather than retiring what is already retired.
 */
async function purgeSelected() {
  const chosen = selectedRows.value
  const removable = chosen.filter((row) => row.removable)
  const kept = chosen.filter((row) => !row.removable).map((row) => row.id)
  if (removable.length === 0) {
    await presentToast({ message: t('retired.bulkPurgeNone', { n: chosen.length }) })
    return
  }
  const message = [
    t('retired.bulkPurgeMessage', { n: removable.length }),
    ...(kept.length > 0 ? [t('retired.bulkPurgeKept', { n: kept.length })] : []),
  ].join(' ')
  const confirmed = await confirmDestructive({
    header: t('retired.bulkPurgeTitle', { n: removable.length }),
    message,
    confirmLabel: t('retired.purge'),
    testid: 'm23-bulk-purge-confirm',
  })
  if (!confirmed) return
  for (const row of removable) row.purge()
  keepSelected(kept)
  void presentToast({ message: t('retired.bulkPurged', { n: removable.length }) })
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
          <IonLabel>{{ itemsSegmentLabel }}</IonLabel>
        </IonSegmentButton>
        <IonSegmentButton :value="SEGMENT_TEMPLATES" data-testid="m23-segment-templates">
          <IonLabel>{{ templatesSegmentLabel }}</IonLabel>
        </IonSegmentButton>
      </IonSegment>

      <EmptyState
        v-if="rows.length === 0 && !rowsKnown"
        :title="t('retired.listUnknown')"
        testid="m23-list-loading"
      />

      <EmptyState
        v-else-if="rows.length === 0"
        :icon="archiveOutline"
        :title="t(emptyKey)"
        testid="m23-empty"
      />

      <IonList v-else class="jp-card list-card" :class="{ selecting }" lines="full">
        <!-- ADR-075: a hold or a right-click on a row selects it; while
             selecting, a tap picks and the row's own buttons step aside for
             the bar's. Outside the mode a tap on the row does nothing, as
             before — its acts are its buttons. -->
        <IonItem
          v-for="row in rows"
          :key="row.id"
          :button="selecting"
          :detail="false"
          :data-selected="selecting && selected.has(row.id) ? 'true' : undefined"
          data-testid="m23-row"
          @click="onRowClick(row)"
          @pointerdown="(e: PointerEvent) => selection.press(row.id, e)"
          @pointermove="selection.move"
          @pointerup="selection.release"
          @pointercancel="selection.release"
          @contextmenu.prevent="selection.contextMenu(row.id)"
        >
          <SelectBox
            v-if="selecting"
            slot="start"
            :on="selected.has(row.id)"
            data-testid="m23-row-check"
          />
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
            <!-- FR-24.15: where this row went, so „Wiederherstellen" is not a
                 silent offer to make the duplicate again. -->
            <p v-if="row.mergedInto" class="merged" data-testid="m23-row-merged">
              {{ t('items.mergedInto', { name: row.mergedInto }) }}
            </p>
          </IonLabel>

          <!-- A press on a button is the button's, not the start of a hold. -->
          <div v-if="!selecting" slot="end" class="row-actions" @pointerdown.stop>
            <!-- The bin before the restore, so every row's restore ends at the
                 same edge whether or not the row has a bin. -->
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
            <IonButton
              fill="outline"
              size="small"
              data-testid="m23-restore"
              @click="onRestore(row)"
            >
              <IonIcon slot="start" :icon="arrowUndoOutline" />
              {{ t('retired.restore') }}
            </IonButton>
          </div>
        </IonItem>
      </IonList>

      <BulkBar v-if="selecting && selectedRows.length > 0" data-testid="m23-bulkbar">
        <button type="button" data-testid="m23-bulk-restore" @click="restoreSelected">
          <IonIcon :icon="arrowUndoOutline" />
          {{ t('retired.restore') }}
        </button>
        <button type="button" class="danger" data-testid="m23-bulk-purge" @click="purgeSelected">
          <IonIcon :icon="trashOutline" />
          {{ t('retired.bulkPurge') }}
        </button>
      </BulkBar>
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

/* The bar floats over the foot of the list; the last row stays reachable. */
.list-card.selecting {
  margin-bottom: 88px;
}

.row-mark {
  margin-inline-end: 12px;
}

.merged {
  color: var(--ct-subtext0);
}

.usage {
  font-size: var(--jp-text-xs);
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}
</style>
