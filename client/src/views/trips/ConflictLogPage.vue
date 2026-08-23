<script setup lang="ts">
/**
 * G-2 — Conflict Log (NFR-4.2a)
 *
 * The audit of every LWW merge that lost a field — what value lost, what
 * won, and when — and the control that takes the loss back. One page, two
 * logs, because there are two sync partitions: with a `tripId` it reads
 * that trip's, without one the master partition's (inventory, groups,
 * series and a trip's own fields, which merge there). The second is
 * reachable from every screen; the first only from inside its trip.
 *
 * A revert is not an undo of the past: the server rewrites the losing
 * value as an ordinary mutation with a fresh HLC (ADR-023), so it can be
 * refused by the same merge rules as any other write. Every refusal is
 * rendered on the row it belongs to rather than as a snackbar — the row
 * is where the reader is looking, and it stays readable.
 */
import {
  IonPage,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
  IonIcon,
  IonButton,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/vue'
import { gitMergeOutline, arrowUndoOutline } from 'ionicons/icons'
import { inject, onMounted, ref } from 'vue'

import { t, formatDate } from '@/i18n'
import type { MessageKey } from '@/i18n'
import { describeConflictValue } from '@/domain/conflictValues'
import { TABLE } from '@/types/tables'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import { APIRequestError } from '@/api/client'
import { ERROR_CODE, type ErrorCode } from '@/api/types'
import type { ConflictEntry, useSyncOrchestrator } from '@/composables/useSyncOrchestrator'

const props = defineProps<{ tripId?: string }>()

const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!
const master = useMasterStore()
const trips = useTripStore()

const conflicts = ref<ConflictEntry[]>([])
const failed = ref(false)

async function load() {
  try {
    conflicts.value = props.tripId
      ? await orchestrator.fetchConflicts(props.tripId)
      : await orchestrator.fetchMasterConflicts()
    failed.value = false
  } catch {
    failed.value = true
  }
}

onMounted(load)

/** Per-entry failure sentence, keyed by conflict id. */
const revertErrors = ref<Record<string, MessageKey>>({})
/** The entry whose revert is in flight, so the control cannot be tapped twice. */
const reverting = ref<string | null>(null)

/**
 * Each refusal the server distinguishes gets its own sentence: which one
 * applies is the only thing the reader needs to decide what to do next.
 */
// Keyed by the generated vocabulary, not by re-typed literals: a code renamed
// on the server fails to compile here instead of falling through to the
// generic message (NFR-4.14).
const REVERT_ERROR_MESSAGES: Partial<Record<ErrorCode, MessageKey>> = {
  [ERROR_CODE.already_reverted]: 'conflicts.revertFailed.alreadyReverted',
  [ERROR_CODE.row_deleted]: 'conflicts.revertFailed.rowDeleted',
  [ERROR_CODE.revert_refused]: 'conflicts.revertFailed.refused',
  [ERROR_CODE.forbidden]: 'conflicts.revertFailed.forbidden',
}

async function revert(entry: ConflictEntry) {
  if (reverting.value !== null) return
  reverting.value = entry.id
  delete revertErrors.value[entry.id]
  try {
    await orchestrator.revertConflict(entry.id, props.tripId)
    // Re-read rather than patch the row: the server owns whether the
    // entry is spent, and the reload also picks up anything that changed
    // while this page was open.
    await load()
  } catch (err) {
    const code = err instanceof APIRequestError ? err.apiError?.code : undefined
    revertErrors.value[entry.id] =
      (code && REVERT_ERROR_MESSAGES[code]) || 'conflicts.revertFailed.generic'
    // An already-spent entry is stale on screen, not broken: re-reading
    // replaces the button with the reverted note it should have shown.
    if (code === ERROR_CODE.already_reverted) await load()
  } finally {
    reverting.value = null
  }
}

async function onRefresh(event: CustomEvent) {
  await load()
  ;(event.target as HTMLIonRefresherElement).complete()
}

/**
 * What kind of thing a row is about, for the case where this device does not
 * know its name — a row deleted since, or one this device has never pulled.
 * A conflict can be logged against any syncable table, so a table with no
 * entry here falls back to its own name rather than to a wrong noun.
 */
const ENTITY_LABELS: Partial<Record<string, MessageKey>> = {
  [TABLE.trips]: 'conflicts.entity.trips',
  [TABLE.tripItems]: 'conflicts.entity.trip_items',
  [TABLE.items]: 'conflicts.entity.items',
  [TABLE.templates]: 'conflicts.entity.templates',
  [TABLE.tags]: 'conflicts.entity.tags',
  [TABLE.travelers]: 'conflicts.entity.travelers',
  [TABLE.containers]: 'conflicts.entity.containers',
  [TABLE.comments]: 'conflicts.entity.comments',
  [TABLE.tripSeries]: 'conflicts.entity.trip_series',
}

/**
 * The column names a reader would recognise. Keyed by field alone, not by
 * table and field: a column of the same name means the same thing everywhere
 * in the schema. An unlisted field keeps its own name — a raw `image_hash`
 * says less than "Photo" but never says something untrue.
 */
const FIELD_LABELS: Partial<Record<string, MessageKey>> = {
  name: 'conflicts.field.name',
  year: 'conflicts.field.year',
  start_date: 'conflicts.field.start_date',
  end_date: 'conflicts.field.end_date',
  status: 'conflicts.field.status',
  state: 'conflicts.field.state',
  mode: 'conflicts.field.mode',
  quantity: 'conflicts.field.quantity',
  packed_count: 'conflicts.field.packed_count',
  category_name: 'conflicts.field.category_name',
  weight_grams: 'conflicts.field.weight_grams',
  value_cents: 'conflicts.field.value_cents',
  icon: 'conflicts.field.icon',
  sort_order: 'conflicts.field.sort_order',
  late_packer: 'conflicts.field.late_packer',
  flag_unused: 'conflicts.field.flag_unused',
  flag_missing: 'conflicts.field.flag_missing',
  body: 'conflicts.field.body',
  is_task: 'conflicts.field.is_task',
  task_state: 'conflicts.field.task_state',
  assigned_traveler_id: 'conflicts.field.assigned_traveler_id',
  carrier_traveler_id: 'conflicts.field.carrier_traveler_id',
  container_id: 'conflicts.field.container_id',
  paired_container_id: 'conflicts.field.paired_container_id',
  source_template_id: 'conflicts.field.source_template_id',
  series_id: 'conflicts.field.series_id',
}

/**
 * The name of the row the conflict is about, read from the stores this device
 * already holds — the trip partition's four tables only while a trip is open,
 * which is the only context in which they are logged.
 */
function entityName(table: string, id: string): string | undefined {
  switch (table) {
    case TABLE.trips:
      return trips.getTrip(id)?.name
    case TABLE.items:
      return master.getItem(id)?.name
    case TABLE.templates:
      return master.getTemplate(id)?.name
    case TABLE.tags:
      return master.tagList.find((tag) => tag.id === id)?.name
    case TABLE.tripSeries:
      return master.getSeries(id)?.name
    case TABLE.tripItems:
      return props.tripId ? trips.getItems(props.tripId).find((i) => i.id === id)?.name : undefined
    case TABLE.travelers:
      return props.tripId
        ? trips.getTravelers(props.tripId).find((tr) => tr.id === id)?.name
        : undefined
    case TABLE.containers:
      return props.tripId
        ? trips.getContainers(props.tripId).find((c) => c.id === id)?.name
        : undefined
    default:
      return undefined
  }
}

/** The row's subject: what it is called, or failing that what kind of thing it is. */
function subjectLabel(entry: ConflictEntry): string {
  const named = entityName(entry.entity_table, entry.entity_id)
  if (named) return named
  const kind = ENTITY_LABELS[entry.entity_table]
  return kind ? t(kind) : entry.entity_table
}

function fieldLabel(entry: ConflictEntry): string {
  const key = FIELD_LABELS[entry.field]
  return key ? t(key) : entry.field
}

/**
 * Columns whose value is a foreign key, and the table it points into. Their
 * stored value is a uuid, and a log row reading `b34e91b… → b8439760…` says
 * nothing at all — the two names behind them are what the reader chose
 * between. Resolved against the same stores as the row's own subject, so an
 * id this device cannot name falls back to the id itself.
 */
const REFERENCE_FIELDS: Record<string, string> = {
  assigned_traveler_id: TABLE.travelers,
  carrier_traveler_id: TABLE.travelers,
  container_id: TABLE.containers,
  paired_container_id: TABLE.containers,
  source_item_id: TABLE.items,
  source_template_id: TABLE.templates,
  series_id: TABLE.tripSeries,
}

/**
 * The stored column is JSON (`describeConflictValue`); a boolean becomes the
 * word for it, because `true` is a wire value and not an answer, and a
 * foreign key becomes the name it points at.
 */
function formatValue(entry: ConflictEntry, raw: string): string {
  const value = describeConflictValue(raw)
  switch (value.kind) {
    case 'empty':
      return t('conflicts.emptyValue')
    case 'boolean':
      return t(value.value ? 'common.yes' : 'common.no')
    default: {
      const table = REFERENCE_FIELDS[entry.field]
      return (table && entityName(table, value.text)) || value.text
    }
  }
}

function formatTime(iso: string): string {
  return formatDate(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' })
}
</script>

<template>
  <IonPage>
    <IonContent>
      <IonRefresher slot="fixed" @ionRefresh="onRefresh">
        <IonRefresherContent />
      </IonRefresher>

      <IonList v-if="conflicts.length > 0">
        <IonItem lines="full">
          <IonNote data-testid="conflict-revert-hint">{{ t('conflicts.revertHint') }}</IonNote>
        </IonItem>
        <IonItem v-for="c in conflicts" :key="c.id" lines="inset" data-testid="conflict-row">
          <IonLabel>
            <h3 data-testid="conflict-field">
              <span data-testid="conflict-subject">{{ subjectLabel(c) }}</span> ·
              {{ fieldLabel(c) }}
            </h3>
            <p>
              <span class="losing" data-testid="conflict-losing">{{
                formatValue(c, c.losing_value)
              }}</span>
              →
              <span class="winning" data-testid="conflict-winning">{{
                formatValue(c, c.winning_value)
              }}</span>
            </p>
            <IonNote data-testid="conflict-time">{{ formatTime(c.resolved_at) }}</IonNote>
            <p v-if="revertErrors[c.id]" class="revert-error" data-testid="conflict-revert-error">
              {{ t(revertErrors[c.id]!) }}
            </p>
          </IonLabel>

          <IonNote v-if="c.reverted" slot="end" data-testid="conflict-reverted">
            {{ t('conflicts.reverted') }}
          </IonNote>
          <IonButton
            v-else
            slot="end"
            fill="clear"
            :disabled="reverting !== null"
            data-testid="conflict-revert"
            @click="revert(c)"
          >
            <IonIcon slot="start" :icon="arrowUndoOutline" />
            {{ t('conflicts.revert') }}
          </IonButton>
        </IonItem>
      </IonList>

      <!-- Empty state (G-7) -->
      <div v-else class="empty-state" data-testid="conflict-empty">
        <IonIcon :icon="gitMergeOutline" class="empty-icon" />
        <p v-if="failed">{{ t('conflicts.unavailable') }}</p>
        <p v-else>{{ t(props.tripId ? 'conflicts.empty' : 'conflicts.emptyMaster') }}</p>
      </div>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.losing {
  text-decoration: line-through;
  color: var(--ion-color-medium);
}

.winning {
  font-weight: var(--jp-weight-semibold);
}

.revert-error {
  color: var(--ion-color-danger);
}

/*
 * The house empty state (G-7), which this had copied without its padding and
 * text-align. Nothing noticed while the only sentence here fit one line and
 * shrink-to-fit looked centred; the master log's names three things, wraps,
 * and ran edge to edge (E2E-G2-09).
 */
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
