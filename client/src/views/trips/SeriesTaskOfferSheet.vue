<script setup lang="ts">
/**
 * FR-13.4: the offer sheet a series' tasks raise on a trip that did not get
 * them automatically — M22 right after a trip picks a series, and M16's
 * attach (ADR-106). One component, so the two name the same thing alike.
 *
 * The due day is read against *this* trip, computed fresh from
 * `offer.toCreate`'s leads rather than carried on the draft: the draft is the
 * same object the wizard's own materialisation uses, and that one has no
 * trip yet to read a day against.
 */
import { IonButton, IonIcon } from '@ionic/vue'
import { checkmarkCircle, ellipseOutline } from 'ionicons/icons'
import { computed, ref, watch } from 'vue'

import AssigneeSeat from '@/components/global/AssigneeSeat.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import { seriesOfferDue } from '@/lib/seriesTaskText'
import { t } from '@/i18n'
import type { NameablePerson } from '@/composables/shared/pickAssignee'
import type { SeriesTaskDraft, SeriesTaskMaterialization } from '@/domain/shared/seriesTask'

const props = defineProps<{
  isOpen: boolean
  offer: SeriesTaskMaterialization | null
  /** Null while the trip has no start date yet (FR-2.1a). */
  tripStartDate: string | null
  today: string
  /** Who the ticked rows' seat may show — empty hides it everywhere (G-8). M22
   *  passes trip members, M16's attach the instance's whole directory. */
  assignees: readonly NameablePerson[]
}>()

const emit = defineEmits<{ dismiss: []; apply: [drafts: SeriesTaskDraft[]] }>()

const ticked = ref<Set<string>>(new Set())

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return
    ticked.value = new Set((props.offer?.toCreate ?? []).map((d) => d.destination_task_id))
  },
  { immediate: true },
)

function toggle(id: string): void {
  const next = new Set(ticked.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  ticked.value = next
}

function seatOf(draft: SeriesTaskDraft) {
  if (props.assignees.length === 0 || !draft.assignee_user_id) return null
  const person = props.assignees.find((p) => p.user_id === draft.assignee_user_id)
  return person
    ? { variant: 'assignee' as const, id: person.user_id, name: person.display_name }
    : null
}

const tickedCount = computed(() => ticked.value.size)

function apply(): void {
  const drafts = (props.offer?.toCreate ?? []).filter((d) =>
    ticked.value.has(d.destination_task_id),
  )
  emit('apply', drafts)
}
</script>

<template>
  <SheetModal :is-open="isOpen" testid="series-offer-sheet" @dismiss="emit('dismiss')">
    <div class="sheet">
      <SheetHead
        :title="t('tasks.offerTitle')"
        title-testid="series-offer-title"
        @close="emit('dismiss')"
      />

      <ul v-if="offer" class="rows">
        <li
          v-for="draft in offer.toCreate"
          :key="draft.destination_task_id"
          class="row"
          :data-testid="`series-offer-task-${draft.body}`"
        >
          <button
            type="button"
            class="tick"
            :aria-pressed="ticked.has(draft.destination_task_id)"
            :aria-label="draft.body"
            @click="toggle(draft.destination_task_id)"
          >
            <IonIcon
              :icon="ticked.has(draft.destination_task_id) ? checkmarkCircle : ellipseOutline"
            />
            <span class="body">
              <span class="text">{{ draft.body }}</span>
              <span
                class="due"
                :class="{
                  overdue: seriesOfferDue(draft.start_lead_days, tripStartDate, today).overdue,
                }"
              >
                {{ seriesOfferDue(draft.start_lead_days, tripStartDate, today).text }}
              </span>
            </span>
          </button>
          <AssigneeSeat v-if="assignees.length > 0" :avatar="seatOf(draft)" @assign="() => {}" />
        </li>
        <li
          v-for="already in offer.alreadyOnTrip"
          :key="already.id"
          class="row already"
          :data-testid="`series-offer-already-${already.task}`"
        >
          <span class="text">{{ already.task }}</span>
          <span class="already-label">{{ t('tasks.offerAlready') }}</span>
        </li>
      </ul>

      <div class="actions">
        <IonButton fill="clear" data-testid="series-offer-skip" @click="emit('dismiss')">
          {{ t('tasks.offerSkip') }}
        </IonButton>
        <IonButton
          shape="round"
          :disabled="tickedCount === 0"
          data-testid="series-offer-apply"
          @click="apply"
        >
          {{ t('tasks.offerApply', { n: tickedCount }) }}
        </IonButton>
      </div>
    </div>
  </SheetModal>
</template>

<style scoped>
.rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 4px;
  border-bottom: 1px solid var(--jp-surface-border);
}

.tick {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 10px;
  min-width: 0;
  border: none;
  background: none;
  padding: 0;
  text-align: start;
  cursor: pointer;
  color: var(--ct-text);
}

.tick ion-icon {
  flex: none;
  font-size: var(--jp-icon-sm);
  color: var(--jp-action);
}

.tick[aria-pressed='false'] ion-icon {
  color: var(--ct-overlay0);
}

.body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.due {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.due.overdue {
  color: var(--ct-ember);
}

.already {
  color: var(--ct-subtext0);
}

.already .text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.already-label {
  flex: none;
  font-size: var(--jp-text-xs);
}

.actions {
  display: flex;
  justify-content: space-between;
  margin-top: 14px;
}
</style>
