<script setup lang="ts">
/**
 * M14 — Post-Trip Review Assistant (FR-9.2, group-aware per FR-27.11).
 *
 * A list, not a card stack: the harvest of a trip is a handful of
 * one-line judgements, and a stack shows one at a time while hiding how
 * much is left — the same dishonesty FR-25.11a forbids on the packing
 * list. Every row names its target *group* in a picker that offers
 * groups only, applied and skipped rows stay in place, marked, and a
 * footer counts what was written.
 *
 * Apply writes straight to the target group as an ordinary master
 * mutation — groups are shared instance-wide (FR-1.6 MVP), so there is
 * no fork step. Proposals are recomputed from current state, so the
 * assistant is naturally resumable — an applied row simply stops
 * appearing on the next visit.
 */
import { IonPage, IonContent, IonButton, IonIcon, IonSelect, IonSelectOption } from '@ionic/vue'
import { checkmarkCircleOutline, chevronForwardOutline, closeOutline } from 'ionicons/icons'
import { computed, inject, ref, watchEffect } from 'vue'

import { t } from '@/i18n'
import { presentToast } from '@/lib/toast'
import {
  buildReviewProposals,
  dismissalKey,
  retargetGroups,
  type ReviewProposal,
} from '@/domain/review'
import { tripsReachedBy } from '@/domain/templates'
import GroupPeekSheet from '@/components/templates/GroupPeekSheet.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import { dismissProposal, isDismissed } from '@/local/reviewDismissals'
import { useMasterStore } from '@/stores/masterStore'
import { useTripStore } from '@/stores/tripStore'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import { setHeaderTitle } from '@/composables/useHeaderTitle'

const props = defineProps<{ tripId: string }>()

const store = useTripStore()

/** FR-27.12: which target group the peek sheet is showing, if any. */
const peekTemplateId = ref<string | null>(null)

const master = useMasterStore()

/** The target's name, for the peek trigger's label (FR-27.12). */
function groupName(templateId: string): string {
  return master.getTemplate(templateId)?.name ?? ''
}
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!

const trip = computed(() => store.getTrip(props.tripId))

/**
 * Flag occurrences across the archived trips of the series synced to
 * this device (same honesty caveat as M12), including this trip.
 */
function historyCount(itemName: string, flag: 'unused' | 'missing'): number {
  const seriesId = trip.value?.series_id
  if (!seriesId) return 1
  const name = itemName.toLowerCase()
  const hits = store.tripList.filter(
    (other) =>
      other.id !== props.tripId &&
      other.series_id === seriesId &&
      other.status === 'archived' &&
      store
        .getItems(other.id)
        .some(
          (i) =>
            i.name.toLowerCase() === name && (flag === 'unused' ? i.flag_unused : i.flag_missing),
        ),
  ).length
  return 1 + hits
}

/**
 * One rendered row. Decided rows are kept verbatim rather than being
 * recomputed away (FR-27.11: applied and skipped stay visible, marked),
 * so the pass can be reviewed before leaving.
 */
interface Row {
  p: ReviewProposal
  /** The picker's current target — starts on the FR-27.11 default. */
  target: string
  state: 'applied' | 'skipped' | null
}

/** Row identity across recomputes — the flag, not the (movable) target. */
const rowKey = (p: ReviewProposal) => `${p.kind}:${p.itemRef}`

const rows = ref<Row[]>([])
/** "Never ask again" removals this session, so a recompute cannot revive
 * a row whose dismissal was stored under a retargeted pair. */
const removed = ref<Set<string>>(new Set())
/** Bumped after "Never ask again" so proposals recompute. */
const dismissedVersion = ref(0)

watchEffect(() => {
  void dismissedVersion.value
  const live = buildReviewProposals({
    items: store.getItems(props.tripId),
    templates: master.templateList,
    templateItems: (id) => master.getTemplateItems(id),
    masterItems: master.itemList,
    isDismissed,
    flaggedTripCount: historyCount,
  })
  const liveKeys = new Set(live.map(rowKey))
  // Decided rows stay in place; an undecided row whose proposal vanished
  // (applied on another device, flag cleared) leaves with it.
  const kept = rows.value.filter((r) => r.state !== null || liveKeys.has(rowKey(r.p)))
  const known = new Set(kept.map((r) => rowKey(r.p)))
  rows.value = [
    ...kept,
    ...live
      .filter((p) => !known.has(rowKey(p)) && !removed.value.has(rowKey(p)))
      .map((p) => ({ p, target: p.groupId, state: null })),
  ]
})

const openCount = computed(() => rows.value.filter((r) => r.state === null).length)
const appliedCount = computed(() => rows.value.filter((r) => r.state === 'applied').length)

function whyText(p: ReviewProposal): string {
  return p.kind === 'unused'
    ? t('review.whyUnused', { n: p.flagCount })
    : t('review.whyMissing', { n: p.flagCount })
}

/** FR-27.11: the picker offers groups only; unused rows can move only
 * between groups that actually carry the item. */
function pickerGroups(row: Row) {
  return retargetGroups(row.p, master.templateList, (id) => master.getTemplateItems(id))
}

/** FR-27.4 blast radius of the row's *selected* group, live. */
function blastText(row: Row): string | null {
  const reached = tripsReachedBy(
    row.target,
    {
      trips: store.tripList,
      items: store.tripList.flatMap((other) => store.getItems(other.id)),
      includes: master.includeList,
    },
    orchestrator.today(),
  )
  if (reached.length === 0) return null
  const group = master.templateList.find((g) => g.id === row.target)
  return t('review.blast', { n: reached.length, group: group?.name ?? '' })
}

async function toast(message: string) {
  await presentToast({ message, duration: 3000 })
}

function apply(row: Row) {
  orchestrator.applyReviewProposal(row.p, row.target)
  row.state = 'applied'
  const group = master.templateList.find((g) => g.id === row.target)?.name ?? ''
  void toast(
    row.p.kind === 'unused'
      ? t('review.snackUnused', { item: row.p.itemName, group })
      : t('review.snackMissing', { item: row.p.itemName, group }),
  )
}

function skip(row: Row) {
  row.state = 'skipped'
}

function neverAskAgain(row: Row) {
  dismissProposal(dismissalKey(row.p.itemRef, row.target))
  removed.value = new Set([...removed.value, rowKey(row.p)])
  rows.value = rows.value.filter((r) => r !== row)
  dismissedVersion.value++
  void toast(t('review.snackNever'))
}

// ADR-011: the one header bar renders this page's title.
setHeaderTitle(() => `${t('review.title')} · ${trip.value?.name ?? ''}`)
</script>

<template>
  <IonPage>
    <IonContent class="ion-padding">
      <p class="intro">{{ t('review.intro') }}</p>

      <h2 class="section-title jp-eyebrow" data-testid="m14-open-count">
        {{ t('review.open', { n: openCount }) }}
      </h2>

      <template v-if="rows.length > 0">
        <article
          v-for="row in rows"
          :key="rowKey(row.p)"
          class="jp-card row"
          :class="{ decided: row.state !== null }"
          data-testid="m14-row"
        >
          <div class="head">
            <span class="chip kind" :class="row.p.kind">
              {{ row.p.kind === 'unused' ? t('review.kindUnused') : t('review.kindMissing') }}
            </span>
            <div class="grow">
              <div class="name">{{ row.p.itemName }}</div>
              <div class="why">{{ whyText(row.p) }}</div>
            </div>
            <span v-if="row.state" class="chip state" :class="row.state" data-testid="m14-state">
              {{ row.state === 'applied' ? t('review.stateApplied') : t('review.stateSkipped') }}
            </span>
          </div>

          <label class="target">
            <span>{{
              row.p.kind === 'unused' ? t('review.targetFrom') : t('review.targetTo')
            }}</span>
            <IonSelect
              v-model="row.target"
              interface="popover"
              :disabled="row.state !== null"
              data-testid="m14-target"
            >
              <IonSelectOption v-for="g in pickerGroups(row)" :key="g.id" :value="g.id">
                {{ g.name }}
              </IonSelectOption>
            </IonSelect>
            <!-- FR-27.12: what is already in the group I am about to write to?
                 No summary line here — the row carries the blast radius and the
                 proposal itself, and a fourth line would bury both. -->
            <button
              v-if="row.target"
              class="peek"
              :aria-label="t('templates.peekOpen', { name: groupName(row.target) })"
              :data-testid="`m14-peek-${row.p.itemName}`"
              @click="peekTemplateId = row.target"
            >
              <IonIcon :icon="chevronForwardOutline" />
            </button>
          </label>

          <p v-if="blastText(row)" class="blast" data-testid="m14-blast">{{ blastText(row) }}</p>

          <div v-if="row.state === null" class="actions">
            <IonButton size="small" data-testid="m14-apply" @click="apply(row)">
              {{ t('review.apply') }}
            </IonButton>
            <IonButton size="small" fill="outline" data-testid="m14-skip" @click="skip(row)">
              {{ t('review.skip') }}
            </IonButton>
            <IonButton
              size="small"
              fill="clear"
              color="medium"
              class="never"
              data-testid="m14-never"
              :aria-label="t('review.never')"
              :title="t('review.never')"
              @click="neverAskAgain(row)"
            >
              <IonIcon slot="icon-only" :icon="closeOutline" />
            </IonButton>
          </div>
        </article>
      </template>

      <div v-else class="empty" data-testid="m14-empty">
        <IonIcon :icon="checkmarkCircleOutline" class="empty-icon" />
        <p>{{ t('review.empty') }}</p>
      </div>

      <template v-if="appliedCount > 0">
        <h2 class="section-title jp-eyebrow">{{ t('review.appliedHead', { n: appliedCount }) }}</h2>
        <p class="jp-card summary" data-testid="m14-summary">
          {{ t('review.appliedSummary', { n: appliedCount }) }}
        </p>
      </template>
      <!-- FR-27.12: look into the group before writing a proposal into it -->
      <SheetModal :is-open="peekTemplateId !== null" @dismiss="peekTemplateId = null">
        <GroupPeekSheet
          v-if="peekTemplateId"
          :template-id="peekTemplateId"
          @close="peekTemplateId = null"
        />
      </SheetModal>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.peek {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--ct-overlay0);
  font-size: var(--jp-icon-sm);
  cursor: pointer;
}

.intro {
  margin: 4px 2px 14px;
  font-size: var(--jp-text-sm);
  color: var(--ct-subtext0);
}

.section-title {
  margin: 14px 2px 8px;
}

.row {
  padding: 12px 14px;
  margin-bottom: 10px;
}

.row.decided {
  opacity: 0.55;
}

.head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.grow {
  flex: 1;
  min-width: 0;
}

.name {
  font-size: var(--jp-text-md);
  font-weight: var(--jp-weight-semibold);
  color: var(--ct-text);
}

.why {
  font-size: var(--jp-text-sm);
  color: var(--ct-subtext0);
}

.chip {
  flex-shrink: 0;
  padding: 3px 9px;
  border: 1px solid transparent;
  border-radius: var(--jp-r-pill);
  background: var(--ct-surface0);
  font-size: var(--jp-text-xs);
  color: var(--ct-subtext1);
}

.chip.unused {
  border-color: color-mix(in srgb, var(--ct-mauve) 50%, transparent);
  color: var(--ct-mauve);
}

/* Caution, not error: the item was forgotten, nothing is broken (G-11). */
.chip.missing {
  border-color: color-mix(in srgb, var(--ct-yellow) 50%, transparent);
  color: var(--ct-yellow);
}

.chip.applied {
  border-color: color-mix(in srgb, var(--jp-done) 50%, transparent);
  color: var(--jp-done);
}

.target {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: var(--jp-text-sm);
  color: var(--ct-subtext0);
}

.target > span {
  white-space: nowrap;
}

.target ion-select {
  min-height: 0;
  --padding-top: 2px;
  --padding-bottom: 2px;
}

.blast {
  margin: 6px 0 0;
  font-size: var(--jp-text-xs);
  color: var(--ct-subtext0);
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.actions ion-button:first-child {
  flex: 1;
}

.actions ion-button:nth-child(2) {
  flex: 1;
}

.empty {
  text-align: center;
  margin-top: 32px;
  color: var(--ct-subtext0);
}

.empty-icon {
  font-size: var(--jp-icon-xl);
  color: var(--jp-done);
}

.summary {
  padding: 10px 14px;
  font-size: var(--jp-text-sm);
  color: var(--ct-subtext0);
}
</style>
