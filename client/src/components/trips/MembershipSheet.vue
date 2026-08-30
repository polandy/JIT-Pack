<script setup lang="ts">
/**
 * FR-25.21 — *„Wer braucht das?"*: one shared row, or a row per traveler with
 * its own amount. The decision is `domain/membership.ts`'s (ADR-036); this
 * screen only collects it and words what a destructive one would cost.
 *
 * Two house rules shape it, and the second contradicted the mockup:
 *
 * - **A stepper per traveler cannot live in a popover**, which is why this is a
 *   sheet at all rather than the `IonSelect` it replaces.
 * - **Every control commits immediately** (G-5, FR-25.15) — the mockup drew an
 *   *Übernehmen* button, and the sheet grammar has none. The footer keeps the
 *   running summary, because that is the half a person actually reads.
 *
 * Membership is the checkbox. A checked traveler's stepper floors at 1, since
 * 0 already means FR-5.5 *skipped* and one control must not carry two decisions.
 */
import { IonAlert, IonCheckbox, IonIcon } from '@ionic/vue'
import { addOutline, closeOutline, lockClosedOutline, removeOutline } from 'ionicons/icons'
import { computed, inject, ref } from 'vue'

import UserAvatar from '@/components/global/UserAvatar.vue'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import {
  membershipRows,
  planMembership,
  type MembershipPlan,
  type MembershipTarget,
} from '@/domain/membership'
import { t } from '@/i18n'
import { useTripStore } from '@/stores/tripStore'
import type { TripParticipant } from '@/types/domain'

const props = defineProps<{
  tripId: string
  itemId: string
  /** G-3: a foreign claim on any instance freezes the whole editor. */
  locked: boolean
  /** G-3 wants the name, and only a caller knows the trip's people. */
  participants: TripParticipant[]
  /**
   * FR-25.8: open on the roster instead of on *Gemeinsam*. The quick-add's
   * mode is already the answer to which tab this is, and asking for it twice
   * would make the mode a label rather than a choice.
   */
  startPerPerson?: boolean
}>()

const emit = defineEmits<{ close: [] }>()

const store = useTripStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

const travelers = computed(() => store.getTravelers(props.tripId))
const allItems = computed(() => store.getItems(props.tripId))
const item = computed(() => allItems.value.find((i) => i.id === props.itemId))

/** Every instance of this item — what the editor acts on, not the one row it was opened from. */
const rows = computed(() => (item.value ? membershipRows(allItems.value, item.value) : []))

/**
 * Which rows a delete would cost something beyond the row: a comment thread or
 * a preparation todo (FR-7.1/7.3). The planner has no I/O, so it is told.
 */
const rowsWithContent = computed(() => {
  const ids = new Set<string>()
  for (const row of rows.value) {
    if (store.getItemComments(props.tripId, row.id).length > 0) ids.add(row.id)
    else if (store.getTodos(props.tripId).some((todo) => todo.trip_item_id === row.id))
      ids.add(row.id)
  }
  return [...ids]
})

const perPerson = computed(() => rows.value.some((r) => r.assigned_traveler_id !== null))

/**
 * G-3 is about the **item**, not the row this was opened from: a conversion
 * rewrites every instance, so a foreign claim on any of them freezes the
 * editor — FR-25.21's own sentence, and the half only this component can
 * answer, because only it knows which rows the cluster holds. The prop stays
 * beside it: a caller has its own reasons to be read-only.
 */
const claimHolderId = computed(() => {
  for (const row of rows.value) {
    const holder = orchestrator.lockHolder(props.tripId, row)
    if (holder !== null) return holder
  }
  return null
})
const isLocked = computed(() => props.locked || claimHolderId.value !== null)

/**
 * Why it is frozen, said here rather than left to M5's G-3 banner: the claim
 * may be on a sibling row, so that banner is absent, and this editor is a
 * modal *above* M5 either way.
 */
const lockNotice = computed(() => {
  const who = props.participants.find((p) => p.user_id === claimHolderId.value)?.display_name
  return who ? t('membership.lockedBy', { who }) : t('membership.lockedByUnknown')
})

/**
 * Switching the tab shows the roster; it writes nothing. The first draft made
 * *Pro Person* an action, and the only thing it could do with nobody picked yet
 * was assign the item to whoever happens to be first in the roster — a silent
 * decision on somebody's packing list. Checking a person is the write.
 */
const perPersonView = ref(props.startPerPerson === true)
const showRoster = computed(() => perPerson.value || perPersonView.value)

/** The amount a traveler carries today, or null when they are not a member. */
function amountOf(travelerId: string): number | null {
  const row = rows.value.find((r) => r.assigned_traveler_id === travelerId)
  return row ? row.quantity : null
}

const members = computed(() =>
  travelers.value
    .map((tr) => ({ traveler: tr, quantity: amountOf(tr.id) }))
    .filter(
      (m): m is { traveler: (typeof travelers.value)[number]; quantity: number } =>
        m.quantity !== null,
    ),
)

const totalQuantity = computed(() =>
  perPerson.value ? members.value.reduce((n, m) => n + m.quantity, 0) : (item.value?.quantity ?? 0),
)

/** A pending destructive change, held until the confirm answers. */
const pending = ref<{ target: MembershipTarget; plan: MembershipPlan } | null>(null)

function targetFor(next: { traveler_id: string; quantity: number }[]): MembershipTarget {
  return { kind: 'perPerson', members: next }
}

function currentMembers(): { traveler_id: string; quantity: number }[] {
  return members.value.map((m) => ({ traveler_id: m.traveler.id, quantity: m.quantity }))
}

/**
 * Every change goes through here, so the confirm can never be skipped by a
 * control that forgot to ask: the plan says whether anything is destroyed, and
 * only then is a question raised.
 */
function apply(target: MembershipTarget) {
  if (isLocked.value || !item.value) return
  const plan = planMembership({
    tripId: props.tripId,
    rows: rows.value,
    travelers: travelers.value,
    rowsWithContent: rowsWithContent.value,
    target,
  })
  if (plan.empty) return
  // A collapse always asks, even when it destroys no progress: it takes the
  // personal row off *everyone's* list, and the resulting amount — the sum, not
  // the largest — is the thing worth reading before it is written (FR-25.21b).
  // A single traveler leaving asks only when their row carries something.
  const collapsing = target.kind === 'shared' && plan.delete.length > 0
  // FR-5.5: taking a *weggelassen* row along again undoes somebody's answer,
  // and it happens as a side effect of the first checkbox — so it is asked,
  // the same way the two conversions above are.
  if (collapsing || plan.destructive.length > 0 || plan.unskipped !== null) {
    pending.value = { target, plan }
    return
  }
  orchestrator.setMembership(props.tripId, rows.value, target, rowsWithContent.value)
}

function confirmPending() {
  const p = pending.value
  pending.value = null
  if (p) orchestrator.setMembership(props.tripId, rows.value, p.target, rowsWithContent.value)
}

function toggle(travelerId: string) {
  const current = currentMembers()
  const has = current.some((m) => m.traveler_id === travelerId)
  if (has) {
    apply(targetFor(current.filter((m) => m.traveler_id !== travelerId)))
    return
  }
  // A traveler joining an item that is still shared converts it: the existing
  // row is kept and re-pointed (ADR-036), so nothing on it is lost.
  apply(targetFor([...current, { traveler_id: travelerId, quantity: 1 }]))
}

function step(travelerId: string, by: number) {
  apply(
    targetFor(
      currentMembers().map((m) =>
        m.traveler_id === travelerId ? { ...m, quantity: m.quantity + by } : m,
      ),
    ),
  )
}

function toShared() {
  perPersonView.value = false
  if (!perPerson.value) return
  apply({ kind: 'shared' })
}

/** Which question is being asked — the plan decides, never the control. */
const confirmTitle = computed(() => {
  const p = pending.value
  if (!p) return ''
  if (p.plan.unskipped && p.target.kind === 'perPerson') return t('membership.confirmUnskipTitle')
  return p.target.kind === 'shared'
    ? t('membership.confirmCollapseTitle')
    : t('membership.confirmRemoveTitle')
})

/** The sentence the confirm asks, built from the plan rather than from the control. */
const confirmMessage = computed(() => {
  const p = pending.value
  if (!p) return ''
  if (p.plan.unskipped && p.target.kind === 'perPerson') {
    return t('membership.confirmUnskip', {
      item: item.value?.name ?? '',
      name: p.plan.unskipped.travelerName,
    })
  }
  if (p.target.kind === 'shared') {
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
</script>

<template>
  <div v-if="item" class="sheet" data-testid="membership-sheet">
    <header class="head">
      <h2 class="jp-sheet-title">{{ t('membership.title') }}</h2>
      <button
        class="close"
        :aria-label="t('common.close')"
        data-testid="membership-close"
        @click="emit('close')"
      >
        <IonIcon :icon="closeOutline" />
      </button>
    </header>

    <p v-if="isLocked" class="lock" data-testid="membership-lock" role="status">
      <IonIcon :icon="lockClosedOutline" />
      <span>{{ lockNotice }} {{ t('membership.lockedHint') }}</span>
    </p>

    <div class="seg" role="tablist">
      <button
        role="tab"
        :aria-selected="!showRoster"
        :class="{ on: !showRoster }"
        :disabled="isLocked"
        data-testid="membership-shared"
        @click="toShared"
      >
        {{ t('membership.shared') }}
      </button>
      <button
        role="tab"
        :aria-selected="showRoster"
        :class="{ on: showRoster }"
        :disabled="isLocked"
        data-testid="membership-per-person"
        @click="perPersonView = true"
      >
        {{ t('membership.perPerson') }}
      </button>
    </div>

    <p class="hint">
      {{ showRoster ? t('membership.hintPerPerson') : t('membership.hintShared') }}
    </p>

    <ul v-if="showRoster" class="list">
      <li
        v-for="tr in travelers"
        :key="tr.id"
        class="row"
        :class="{ off: amountOf(tr.id) === null }"
      >
        <IonCheckbox
          :checked="amountOf(tr.id) !== null"
          :disabled="isLocked"
          :aria-label="tr.name"
          :data-testid="`membership-check-${tr.name}`"
          @ion-change="toggle(tr.id)"
        />
        <UserAvatar :name="tr.name" :seed="tr.id" :size="24" />
        <span class="nm">{{ tr.name }}</span>
        <span v-if="amountOf(tr.id) !== null" class="stepper">
          <button
            :disabled="isLocked || (amountOf(tr.id) ?? 1) <= 1"
            :aria-label="t('membership.less', { name: tr.name })"
            :data-testid="`membership-minus-${tr.name}`"
            @click="step(tr.id, -1)"
          >
            <IonIcon :icon="removeOutline" />
          </button>
          <span class="v jp-num" :data-testid="`membership-qty-${tr.name}`">{{
            amountOf(tr.id)
          }}</span>
          <button
            :disabled="isLocked"
            :aria-label="t('membership.more', { name: tr.name })"
            :data-testid="`membership-plus-${tr.name}`"
            @click="step(tr.id, 1)"
          >
            <IonIcon :icon="addOutline" />
          </button>
        </span>
      </li>
    </ul>

    <footer class="foot" data-testid="membership-summary">
      {{
        perPerson
          ? t('membership.summary', { people: members.length, quantity: totalQuantity })
          : t('membership.summaryShared', { quantity: totalQuantity })
      }}
    </footer>

    <IonAlert
      :is-open="pending !== null"
      :header="confirmTitle"
      :message="confirmMessage"
      :buttons="[
        { text: t('common.cancel'), role: 'cancel' },
        { text: t('common.confirm'), role: 'confirm', handler: confirmPending },
      ]"
      @did-dismiss="pending = null"
    />
  </div>
</template>

<style scoped>
.sheet {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 0 8px;
}

.head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.lock {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.head h2 {
  flex: 1;
  margin: 0;
}

.close {
  background: none;
  border: 0;
  color: var(--ct-subtext0);
  font-size: var(--jp-icon-md);
  padding: 4px;
}

.seg {
  display: flex;
  gap: 3px;
  padding: 3px;
  background: var(--jp-surface-sunken);
  border-radius: var(--jp-r-md);
}

.seg button {
  flex: 1;
  padding: 7px 4px;
  border: 0;
  border-radius: var(--jp-r-sm);
  background: none;
  color: var(--ct-subtext0);
}

.seg button.on {
  background: var(--jp-action);
  color: var(--ct-on-accent);
}

/* G-3: the tab stays where it is and stops looking tappable. Removing it
   would take the answer to "which mode is this item in" with it. */
.seg button:disabled {
  opacity: 0.45;
  cursor: default;
}

.hint {
  margin: 0;
  color: var(--ct-subtext0);
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  background: var(--jp-surface-card);
  border-radius: var(--jp-r-md);
  overflow: hidden;
}

.row {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 10px 13px;
  border-bottom: 1px solid var(--ct-surface0);
}

.row:last-child {
  border-bottom: 0;
}

.row.off {
  opacity: 0.55;
}

.nm {
  flex: 1;
  min-width: 0;
}

.stepper {
  display: flex;
  align-items: center;
}

.stepper button {
  width: 32px;
  height: 32px;
  border: 1px solid var(--ct-surface1);
  background: var(--jp-surface-card);
  color: var(--jp-action);
  display: grid;
  place-items: center;
}

.stepper button:first-child {
  border-radius: var(--jp-r-sm) 0 0 var(--jp-r-sm);
}

.stepper button:last-child {
  border-radius: 0 var(--jp-r-sm) var(--jp-r-sm) 0;
}

.stepper button:disabled {
  color: var(--ct-overlay0);
}

.stepper .v {
  min-width: 40px;
  height: 32px;
  display: grid;
  place-items: center;
  border-top: 1px solid var(--ct-surface1);
  border-bottom: 1px solid var(--ct-surface1);
}

.foot {
  color: var(--ct-subtext0);
}
</style>
