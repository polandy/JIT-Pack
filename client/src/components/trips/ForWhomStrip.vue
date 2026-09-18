<script setup lang="ts">
/**
 * FR-25.28 — who an item is for, answered where the item is: one shared row,
 * or a row per traveler. It replaces FR-25.21's membership sheet on M4's row
 * and in M5. The decision is `domain/membership.ts`'s (ADR-036); this only
 * collects it and words what a destructive one would cost.
 *
 * **Every tap commits** (G-5, FR-25.15). Where the plan owes a question it is
 * asked *in the strip*, in place of the summary line: an alert would take the
 * screen away from a control whose point is that the list stays put.
 */
import { IonIcon } from '@ionic/vue'
import { lockClosedOutline } from 'ionicons/icons'
import { computed, ref } from 'vue'

import ForWhomToggles from '@/components/global/ForWhomToggles.vue'
import { useOrchestrator } from '@/composables/useOrchestrator'
import {
  everyoneMembers,
  membersOfRows,
  membershipQuestion,
  membershipRows,
  membershipWith,
  membershipWithout,
  planMembership,
  rowsCarryingContent,
  type MembershipPlan,
  type MembershipQuestion,
  type MembershipTarget,
} from '@/domain/membership'
import { t, type MessageKey } from '@/i18n'
import { useTripStore } from '@/stores/tripStore'
import type { TripParticipant } from '@/types/domain'

const props = withDefaults(
  defineProps<{
    tripId: string
    /** Any row of the item; the strip acts on every instance, not on this one. */
    itemId: string
    /** G-3 wants the name, and only a caller knows the trip's people. */
    participants: TripParticipant[]
    /** A caller's own reason to be read-only, beside the claim the strip finds itself. */
    locked?: boolean
    /** M5: a stepper under every lit avatar. */
    steppers?: boolean
    testKey: string
  }>(),
  { locked: false, steppers: false },
)

const emit = defineEmits<{
  /**
   * The rows a write took away. M5 is opened on *one* instance, and a change
   * made from inside it can delete exactly that one — the host has to hear it,
   * or it is left reporting the row it was just asked to remove as not found.
   */
  rowsRemoved: [rowIds: string[]]
}>()

const tripStore = useTripStore()
const orchestrator = useOrchestrator()

const travelers = computed(() => tripStore.getTravelers(props.tripId))
const allItems = computed(() => tripStore.getItems(props.tripId))
const item = computed(() => allItems.value.find((i) => i.id === props.itemId))

/** Every instance of this item — what the strip rewrites. */
const rows = computed(() => (item.value ? membershipRows(allItems.value, item.value) : []))

const rowsWithContent = computed(() =>
  rowsCarryingContent(rows.value, {
    hasComments: (rowId) => tripStore.getItemComments(props.tripId, rowId).length > 0,
    hasTodo: (rowId) =>
      tripStore.getTodos(props.tripId).some((todo) => todo.trip_item_id === rowId),
  }),
)

const members = computed(() => membersOfRows(rows.value, travelers.value))
const amounts = computed(() => new Map(members.value.map((m) => [m.traveler_id, m.quantity])))

const totalQuantity = computed(() => rows.value.reduce((n, r) => n + r.quantity, 0))

/**
 * G-3 is about the **item**: a conversion rewrites every instance, so a
 * foreign claim on any of them freezes the strip — and only the strip knows
 * which rows the cluster holds.
 */
const claimHolderId = computed(() => {
  for (const row of rows.value) {
    const holder = orchestrator.lockHolder(props.tripId, row)
    if (holder !== null) return holder
  }
  return null
})
const isLocked = computed(() => props.locked || claimHolderId.value !== null)

const lockNotice = computed(() => {
  const who = props.participants.find((p) => p.user_id === claimHolderId.value)?.display_name
  return who ? t('membership.lockedBy', { who }) : t('membership.lockedByUnknown')
})

/** A change whose plan owes a question, held until it is answered. */
const pending = ref<{
  target: MembershipTarget
  plan: MembershipPlan
  question: MembershipQuestion
} | null>(null)

/**
 * Every change goes through here, so no control can forget to ask: the plan
 * says whether a question is owed, never the toggle that produced it.
 */
function apply(target: MembershipTarget) {
  if (isLocked.value || pending.value !== null || !item.value) return
  const plan = planMembership({
    tripId: props.tripId,
    rows: rows.value,
    travelers: travelers.value,
    rowsWithContent: rowsWithContent.value,
    target,
  })
  if (plan.empty) return
  const question = membershipQuestion(target, plan)
  if (question !== null) {
    pending.value = { target, plan, question }
    return
  }
  write(target, plan)
}

function write(target: MembershipTarget, plan: MembershipPlan) {
  orchestrator.setMembership(props.tripId, rows.value, target, rowsWithContent.value)
  if (plan.delete.length > 0) emit('rowsRemoved', plan.delete)
}

function answer(yes: boolean) {
  const p = pending.value
  pending.value = null
  if (yes && p) write(p.target, p.plan)
}

function toggle(travelerId: string) {
  apply(
    amounts.value.has(travelerId)
      ? membershipWithout(members.value, travelerId)
      : membershipWith(members.value, travelerId),
  )
}

function step(travelerId: string, by: number) {
  apply({
    kind: 'perPerson',
    members: members.value.map((m) =>
      m.traveler_id === travelerId ? { ...m, quantity: m.quantity + by } : m,
    ),
  })
}

const questionText = computed(() => {
  const p = pending.value
  if (!p) return ''
  if (p.question === 'unskip') {
    return t('membership.confirmUnskip', {
      item: item.value?.name ?? '',
      name: p.plan.unskipped?.travelerName ?? '',
    })
  }
  if (p.question === 'collapse') {
    return t('membership.confirmCollapse', {
      rows: p.plan.delete.length + p.plan.update.length,
      quantity: p.plan.totals?.quantity ?? 0,
      packed: p.plan.totals?.packed ?? 0,
      name: p.plan.survivor?.travelerName ?? '',
    })
  }
  const loss = p.plan.destructive[0]
  return t('membership.confirmRemove', {
    name: loss?.travelerName ?? '',
    packed: loss?.packedCount ?? 0,
    quantity: loss?.quantity ?? 0,
  })
})

/** The button names what it does, never *OK* (FR-25.28). */
const QUESTION_VERB: Record<MembershipQuestion, MessageKey> = {
  unskip: 'packing.unskipAction',
  collapse: 'forWhom.verbCollapse',
  remove: 'common.remove',
}
</script>

<template>
  <div v-if="item" class="strip" :data-testid="`for-whom-strip-${testKey}`">
    <p v-if="isLocked" class="lock" :data-testid="`for-whom-lock-${testKey}`" role="status">
      <IonIcon :icon="lockClosedOutline" />
      <span>{{ lockNotice }}</span>
    </p>

    <ForWhomToggles
      :travelers="travelers"
      :amounts="amounts"
      :steppers="steppers"
      :disabled="isLocked || pending !== null"
      :test-key="testKey"
      @shared="apply({ kind: 'shared' })"
      @all="apply({ kind: 'perPerson', members: everyoneMembers(travelers, members) })"
      @toggle="toggle"
      @step="step"
    />

    <div v-if="pending" class="ask" role="alert" :data-testid="`for-whom-ask-${testKey}`">
      <span class="ask-text">{{ questionText }}</span>
      <button type="button" :data-testid="`for-whom-no-${testKey}`" @click="answer(false)">
        {{ t('common.cancel') }}
      </button>
      <button
        type="button"
        class="go"
        :data-testid="`for-whom-yes-${testKey}`"
        @click="answer(true)"
      >
        {{ t(QUESTION_VERB[pending.question]) }}
      </button>
    </div>
    <p v-else class="summary jp-num" :data-testid="`for-whom-summary-${testKey}`">
      {{
        members.length > 0
          ? t('membership.summary', {
              n: members.length,
              people: members.length,
              quantity: totalQuantity,
            })
          : t('membership.summaryShared', { n: totalQuantity, quantity: totalQuantity })
      }}
    </p>
  </div>
</template>

<style scoped>
/*
 * Sunken, so it reads as a drawer the row opened rather than as another row.
 *
 * Raised above its neighbours, because it appears at once while the rows under
 * it slide down to make room (FR-25.2's `pack-out-move`) — and a later sibling
 * paints over an earlier one. For those 0.3 s the rows below were drawn across
 * the strip, which looked like a strip too transparent to hide them (owner,
 * 2026-09-18). Above them, they slide out from underneath instead.
 */
.strip {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  background: var(--jp-surface-sunken);
  border-block: 1px solid var(--jp-surface-border);
}

.lock,
.summary {
  margin: 0;
  padding-inline: 4px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.lock {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ask {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  padding: 8px 10px;
  border-radius: var(--jp-r-sm);
  background: color-mix(in srgb, var(--ct-ember) 12%, var(--jp-surface-card));
  font-size: var(--jp-text-sm);
}

.ask-text {
  flex: 1 1 180px;
}

.ask button {
  padding: 6px;
  border: none;
  background: none;
  color: var(--jp-action);
  font-weight: var(--jp-weight-semibold);
  cursor: pointer;
}

.ask button.go {
  color: var(--ct-ember);
}
</style>
