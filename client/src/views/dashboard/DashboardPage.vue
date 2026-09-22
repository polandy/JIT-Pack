<script setup lang="ts">
/**
 * M1 — Dashboard "My Tasks"
 *
 * Single entry point: "what do I have to do right now?" across all active trips.
 * Per-trip cards with open items, empty state with CTA. The greeting is the
 * screen's name and therefore its page head, drawn by the frame (G-9,
 * FR-21.27).
 */
import {
  IonPage,
  IonContent,
  IonItem,
  IonLabel,
  IonCheckbox,
  IonButton,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/vue'
import { trainOutline, addOutline } from 'ionicons/icons'
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue'
import { TRIP_CARDS } from '@/lib/tripCards'
import { isPackingClosed } from '@/lib/tripPhase'
import { useRouter } from 'vue-router'

import { isFullyPacked, isPartlyPacked } from '@/domain/packState'
import {
  delegatedToMe,
  isOpenRow,
  latePackersDepartingToday,
  plannedTripsByDeparture,
} from '@/domain/dashboardSections'
import {
  myAckFor,
  newTripNotes,
  type DashboardNoteRow,
  type DashboardNoteTrip,
} from '@/domain/tripNotes'
import EmptyState from '@/components/global/EmptyState.vue'
import SectionHead from '@/components/global/SectionHead.vue'
import { t } from '@/i18n'
import { loadSeenDelegations, markDelegationsSeen } from '@/local/delegationSeen'
import { formatTripPeriod } from '@/lib/format'
import { greetingKey } from '@/lib/greeting'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import { CLIENT_ACTOR_PLACEHOLDER } from '@/sync/mutations'
import { useTripStore } from '@/stores/tripStore'
import type { Trip } from '@/types/domain'
import { byDepartureSoonestFirst, isActive } from '@/domain/trips'
import { useIdentity } from '@/composables/useTripIdentity'
import { useTripTasks } from '@/composables/useTripTasks'
import { PATH, tripItemPath, tripPath } from '@/router/paths'
import { useOrchestrator } from '@/composables/useOrchestrator'
import ProgressFigure from '@/components/global/ProgressFigure.vue'
import TripHero from '@/components/trips/TripHero.vue'
import TripPhase from '@/components/trips/TripPhase.vue'
import DashboardTasksBlock from './DashboardTasksBlock.vue'
import { taskPhaseInFront, tripDay } from '@/domain/tripDay'
import { dayText, phaseWord } from '@/lib/tripDayText'
import TripTodoFigure from '@/components/trips/TripTodoFigure.vue'
import TripTodosOverview from '@/components/trips/TripTodosOverview.vue'
import { tripTodoProgress, tripTodoStatus } from '@/domain/tripTodos'

const tripStore = useTripStore()
const { tasksOf } = useTripTasks()
const orchestrator = useOrchestrator()
const { myUserId, load } = useIdentity(orchestrator)
const router = useRouter()

onMounted(() => {
  // Who I am, for the delegation section. Local Mode answers nothing and
  // Single-User has no accounts, so nothing here is the expected answer in
  // two of three modes and leaves the section absent rather than broken.
  void load()
})

/**
 * FR-7.10: the phase word and the day counter, for the hero and for the cards
 * under it. `today` is read where it is asked, so a dashboard left open across
 * midnight reads the new day on its next render rather than a cached one.
 */
function phaseOf(trip: Trip) {
  return { label: phaseWord(isPackingClosed(trip)), done: isPackingClosed(trip) }
}
function counterOf(trip: Trip) {
  return dayText(tripDay(trip, new Date()))
}

const activeTrips = computed(() =>
  byDepartureSoonestFirst(tripStore.tripList.filter((t) => isActive(t))),
)

/*
 * The rows this screen aggregates have to *be here*. A trip partition arrives
 * when its trip is opened, so on a fresh Server-Mode boot M1 was counting an
 * empty store: every active trip rendered with „0 open", no preview rows and
 * no prep, until the user had visited each trip in this page session. Local
 * Mode never showed it, because everything there is rehydrated from IndexedDB
 * on boot, and the pull-to-refresh already pulled exactly this — the screen
 * simply never asked on arrival. Found 2026-08-31, building the two sections
 * below, which read the same rows.
 *
 * A watcher rather than a call in `onMounted`: the trip list itself arrives
 * with the master partition, which on a cold boot has not landed yet, so a
 * one-shot call at mount would ask for nothing. `ensureTripData` is idempotent
 * and deduplicates in flight, so re-running it as the list grows costs one
 * request per trip and no more.
 */
watch(
  () => activeTrips.value.map((trip) => trip.id).join(','),
  () => {
    for (const trip of activeTrips.value) {
      void orchestrator.ensureTripData(trip.id)
      // …and *follow* them: FR-4.4 wants the delegation section to update
      // without a refresh, and only M4 had ever subscribed to a trip channel,
      // so a device sitting on the dashboard heard nothing about the trips it
      // was displaying. Subscribing is idempotent per channel.
      orchestrator.subscribeTrip(trip.id)
    }
  },
  { immediate: true },
)

/**
 * The lookahead: what is planned but not started (FR-6.1, UI-Spec M1; why
 * membership needs no filter is in `plannedTripsByDeparture`).
 *
 * Deliberately **not** loaded and **not** subscribed the way the active trips
 * above are: nothing on the row is read out of the trip partition, so a
 * request per planned trip would buy a count this section does not show — and
 * a count that has not arrived is the „0 open" defect above.
 */
const plannedTrips = computed(() => plannedTripsByDeparture(tripStore.tripList))

const isEmpty = computed(() => activeTrips.value.length === 0 && plannedTrips.value.length === 0)

/**
 * ADR-033: M1 counts off the same master partition M2 does, so it owes the
 * same guard. A dashboard that has not pulled yet is not a dashboard with no
 * trips, and G-7's „plan your first trip" is the wrong answer to it.
 */
const tripsKnown = computed(() => orchestrator.masterDataLoaded())

/**
 * FR-30.7: the cards feature modules show under a trip — the shopping list
 * first — provided by the composition root, so M1 renders them without
 * importing a module (FR-30.3). Each decides for itself whether it has
 * anything to show.
 */
const tripCards = inject(TRIP_CARDS, [])

/*
 * The one trip the screen is about, and the ones after it (FR-21.13).
 * `activeTrips` is ordered soonest departure first, so the hero is the trip
 * that is next rather than whichever one IndexedDB handed over first.
 */
const heroTrip = computed(() => activeTrips.value[0] ?? null)
const followingTrips = computed(() => activeTrips.value.slice(1))

/**
 * FR-7.6's *Aufgaben* card reports the open tasks of every active trip. The
 * hero of a trip whose packing is finished lists them itself and works them
 * (FR-7.10), and the same tasks twice on one screen would be two answers that
 * disagree the moment one is ticked.
 */
const overviewTrips = computed(() =>
  activeTrips.value.filter((trip) => trip !== heroTrip.value || !isPackingClosed(trip)),
)

/** Who is on the trip, for the hero's second line. */
function travelerLine(trip: Trip): string | null {
  const names = tripStore.getTravelers(trip.id).map((traveler) => traveler.name)
  return names.length > 0 ? names.join(', ') : null
}

const greeting = computed(() => t(greetingKey(new Date().getHours())))

// G-9/ADR-050: M1's name is its greeting, and the frame draws it like every
// other screen's — M1 was the one tab root still writing its own heading into
// the content, which put it 26 px lower and a size smaller than M2's beside it.
setHeaderTitle(
  () => greeting.value,
  () => t('dashboard.subtitle'),
)

function tripKpis(trip: Trip) {
  return tripStore.kpis(trip.id)
}

function progressFraction(trip: Trip): number {
  const k = tripKpis(trip)
  if (k.totalItems === 0) return 0
  return k.packedItems / k.totalItems
}

/*
 * `isOpenRow` rather than the predicate written out: the same reading now has
 * three readers on this screen (the preview, the count and the two sections),
 * and a rule spelled out per caller is what §4a is about.
 */
function previewItems(tripId: string) {
  return tripStore.getItems(tripId).filter(isOpenRow).slice(0, 3)
}

function openItemCount(tripId: string): number {
  return tripStore.getItems(tripId).filter(isOpenRow).length
}

/**
 * FR-7.4/7.6: a trip card's second check, beside its packing progress and
 * never inside it. It counts every task of the trip, like the card above and
 * the hero's figure. Null when the trip has none, so the line is absent
 * rather than claiming „all done" about nothing.
 */
function taskLine(trip: Trip): string | null {
  const progress = tripTodoProgress(tasksOf(trip.id))
  const status = tripTodoStatus(progress)
  if (status === 'none') return null
  if (status === 'allDone') return t('dashboard.taskLineDone')
  return t('dashboard.taskLineOpen', { n: progress.open })
}

// --- The two cross-trip sections (FR-6.1/6.3, FR-5.1) ---

/**
 * Every active trip reduced to what the two rules read. One shape for both,
 * because they ask the same question of the same rows.
 */
const sectionTrips = computed(() =>
  activeTrips.value.map((trip) => ({
    tripId: trip.id,
    tripName: trip.name,
    startDate: trip.start_date,
    rows: tripStore.getItems(trip.id),
  })),
)

/**
 * FR-6.1/6.3: what somebody handed me, with what arrived since this device
 * last showed me the section marked. Server Mode only — the other two have no
 * account for a row to be assigned to, so the section is **absent** rather
 * than empty (G-8), and the list above it stays the full aggregation.
 */
const seenDelegations = ref<ReadonlySet<string>>(loadSeenDelegations())

const delegated = computed(() =>
  delegatedToMe(sectionTrips.value, myUserId.value, seenDelegations.value),
)
const newDelegations = computed(() => delegated.value.filter((row) => row.isNew).length)

/**
 * FR-7.9 decision 1/2: the latest notes by others, not yet ticked by me,
 * across active trips — with the card's own tick, the deliberate exception
 * to "M1 takes no actions" (the concept's decision 2 and its consequence
 * paragraph). Server Mode only, the same as `delegated` above: the other two
 * modes have nobody else to write a note (G-8).
 */
const noteTrips = computed<DashboardNoteTrip[]>(() =>
  activeTrips.value.map((trip) => ({
    tripId: trip.id,
    tripName: trip.name,
    notes: tripStore.getTripComments(trip.id),
    acks: tripStore.getNoteAcks(trip.id),
  })),
)
const newNotes = computed(() => newTripNotes(noteTrips.value, myUserId.value))

/** The tick itself — insert on a note's first tick, flip an existing row otherwise. */
function tickNote(row: DashboardNoteRow): void {
  if (!myUserId.value) return
  const acks = noteTrips.value.find((trip) => trip.tripId === row.tripId)?.acks ?? []
  orchestrator.toggleNoteTick(
    row.tripId,
    row.note.id,
    CLIENT_ACTOR_PLACEHOLDER,
    myAckFor(row.note.id, acks, myUserId.value),
  )
}

/**
 * FR-5.1: the things somebody put off until the last morning, on the morning
 * that is. `todayISO` is read once per mount rather than per render — a
 * computed calling `new Date()` re-answers on every unrelated store change,
 * and a dashboard left open overnight is a rarer case than a list that
 * flickers. It refreshes on the next visit, which is when the section matters.
 */
const todayISO = new Date().toISOString().slice(0, 10)
const latePackers = computed(() => latePackersDepartingToday(sectionTrips.value, todayISO))

/**
 * Leaving the screen is what marks the highlights read — doing it on arrival
 * would clear them in the same paint that showed them.
 *
 * Two exits, because Vue only knows about one: `onUnmounted` covers an in-app
 * navigation, and `pagehide` covers the browser leaving the document, which
 * tears the page down without running a single Vue hook. With only the first,
 * a delegation stayed *new* for ever on a device whose user left by a real
 * link or closed the tab.
 */
function markSeen(): void {
  if (myUserId.value) markDelegationsSeen(delegated.value.map((row) => row.itemId))
}

onMounted(() => window.addEventListener('pagehide', markSeen))
onUnmounted(() => {
  window.removeEventListener('pagehide', markSeen)
  markSeen()
})

/** A planned trip's row leads to the trip, the way its card does. */
function openTrip(tripId: string): void {
  void router.push(tripPath(tripId))
}

/** FR-7.3: the prep card's item name is the way into its row (UI-Spec M1). */
function openItem(tripId: string, itemId: string): void {
  void router.push(tripItemPath(tripId, itemId))
}

async function handleRefresh(event: CustomEvent) {
  const refresher = event.target as HTMLIonRefresherElement
  const tripIds = activeTrips.value.map((t) => t.id)
  await orchestrator.drainAll(tripIds)
  refresher.complete()
}
</script>

<template>
  <IonPage>
    <!-- The screen itself, for a test that has to say which screen is up:
         since ADR-050 M1's name is the frame's, not this page's. -->
    <IonContent class="ion-padding" data-testid="dashboard">
      <IonRefresher slot="fixed" @ionRefresh="handleRefresh">
        <IonRefresherContent />
      </IonRefresher>

      <!-- ADR-033: nothing pulled is not nothing planned. The same component
           without its illustration, which is what makes it a notice rather
           than the G-7 absence (G-7, M2's block says what that costs). -->
      <EmptyState
        v-if="isEmpty && !tripsKnown"
        :title="t('trips.listUnknown')"
        testid="dashboard-list-loading"
      />

      <!-- Empty state (G-7) -->
      <EmptyState
        v-else-if="isEmpty"
        :icon="trainOutline"
        :title="t('trips.emptyActive')"
        testid="dashboard-empty"
      >
        <IonButton :router-link="PATH.newTrip" expand="block" data-testid="dashboard-plan-trip">
          <IonIcon slot="start" :icon="addOutline" />
          {{ t('dashboard.planTrip') }}
        </IonButton>
      </EmptyState>

      <!--
        FR-6.1/6.3: what somebody handed me. Absent where there is no account
        to be assigned anything (G-8), which is Local and Single-User Mode in
        full — the aggregation below stays unfiltered either way, because a
        personal filter would empty the screen in exactly those two modes.
      -->
      <template v-if="delegated.length > 0">
        <SectionHead
          :title="t('dashboard.delegated', { n: delegated.length })"
          :count="newDelegations > 0 ? t('dashboard.delegatedNew', { n: newDelegations }) : null"
          data-testid="dashboard-delegated-head"
        />
        <div class="jp-card prep-card rows-card" data-testid="dashboard-delegated">
          <IonItem
            v-for="row in delegated"
            :key="row.itemId"
            lines="none"
            button
            class="dashboard-item"
            :class="{ 'is-new': row.isNew }"
            :data-testid="`dashboard-delegated-${row.itemName}`"
            :data-new="row.isNew ? 'true' : null"
            :aria-label="row.isNew ? t('dashboard.delegatedNewRow', { name: row.itemName }) : null"
            @click="openItem(row.tripId, row.itemId)"
          >
            <IonLabel>
              <h3>{{ row.itemName }}</h3>
              <p>{{ row.tripName }}</p>
            </IonLabel>
          </IonItem>
        </div>
      </template>

      <!--
        FR-7.9 decision 1/2: the latest notes by others, not yet ticked.
        Every row carries its own tick — M1's one deliberate exception, see
        the script comment beside `newNotes`. Tapping the words leads into
        the trip; the tick is a control of its own, the way the shopping
        card's row already is.
      -->
      <template v-if="newNotes.length > 0">
        <SectionHead :title="t('dashboard.newNotes')" data-testid="dashboard-notes-head" />
        <div class="jp-card prep-card rows-card" data-testid="dashboard-notes">
          <IonItem
            v-for="row in newNotes"
            :key="row.note.id"
            lines="none"
            class="dashboard-item is-new"
            :data-testid="`dashboard-note-${row.note.id}`"
          >
            <IonLabel>
              <button
                type="button"
                class="note-body"
                :data-testid="`dashboard-note-open-${row.note.id}`"
                @click="openTrip(row.tripId)"
              >
                <h3>{{ row.note.body }}</h3>
                <p>{{ row.tripName }}</p>
              </button>
            </IonLabel>
            <IonCheckbox
              slot="end"
              :checked="false"
              :aria-label="t('dashboard.newNotesTick')"
              :data-testid="`dashboard-note-tick-${row.note.id}`"
              @ionChange="tickNote(row)"
            />
          </IonItem>
        </div>
      </template>

      <!--
        FR-5.1: the rows somebody deliberately left until the last morning,
        on the morning it is. Absent on every other day — a permanent section
        counting down to a date is a different feature.
      -->
      <template v-if="latePackers.length > 0">
        <SectionHead
          :title="t('dashboard.latePackers', { n: latePackers.length })"
          data-testid="dashboard-late-head"
        />
        <div class="jp-card prep-card rows-card" data-testid="dashboard-late">
          <IonItem
            v-for="row in latePackers"
            :key="row.itemId"
            lines="none"
            button
            class="dashboard-item"
            :data-testid="`dashboard-late-${row.itemName}`"
            @click="openItem(row.tripId, row.itemId)"
          >
            <IonLabel>
              <h3>{{ row.itemName }}</h3>
              <p>{{ row.tripName }}</p>
            </IonLabel>
          </IonItem>
        </div>
      </template>

      <!-- FR-7.6: every open task of every active trip, its own and its
           rows' preparations, reported; they are written in the trip. -->
      <TripTodosOverview :trips="overviewTrips" />

      <!--
        The trip that is next, as a card rather than as a row (FR-21.13).
        The rest keep the list card: a screen has one thing you are on, and
        a second hero is a second answer to which one that is.
      -->
      <TripHero
        v-if="heroTrip"
        :name="heroTrip.name"
        :when="formatTripPeriod(heroTrip)"
        :meta="travelerLine(heroTrip)"
        :percent="progressFraction(heroTrip) * 100"
        :progress="
          t('trips.itemSummary', {
            packed: tripKpis(heroTrip).packedItems,
            total: tripKpis(heroTrip).totalItems,
          })
        "
        :detail="
          openItemCount(heroTrip.id) > 0
            ? t('dashboard.openCount', { n: openItemCount(heroTrip.id) })
            : null
        "
        :phase="phaseOf(heroTrip)"
        :counter="counterOf(heroTrip)"
        :workable="isPackingClosed(heroTrip)"
        :to="tripPath(heroTrip.id)"
        :testid="`dashboard-trip-${heroTrip.name}`"
      >
        <!-- FR-7.10: once the packing is finished the hero works the two
             things that are still owed, in place; only its head is a link. -->
        <template v-if="isPackingClosed(heroTrip)" #blocks>
          <DashboardTasksBlock
            :trip-id="heroTrip.id"
            :phase-in-front="taskPhaseInFront(tripDay(heroTrip, new Date()))"
            :testid="`dashboard-tasks-${heroTrip.name}`"
          />
          <component
            :is="card"
            v-for="(card, index) in tripCards"
            :key="`hero-${index}`"
            :trip-id="heroTrip.id"
            :trip-name="heroTrip.name"
            :planned="false"
            :packing-closed="true"
            embedded
          />
        </template>
        <template v-if="isPackingClosed(heroTrip)" #foot>
          <RouterLink
            :to="tripPath(heroTrip.id)"
            class="pack-link"
            data-testid="dashboard-open-packing"
          >
            <span>{{ t('dashboard.openPackingList') }}</span>
            <span aria-hidden="true">›</span>
          </RouterLink>
        </template>
        <!-- FR-7.4: the trip's todos as a second figure beside the share,
             read-only like the rest of the card; they are ticked in M4. -->
        <template v-if="!isPackingClosed(heroTrip) && taskLine(heroTrip)" #beside="{ ringSize }">
          <TripTodoFigure
            :trip-id="heroTrip.id"
            :ring-size="ringSize"
            :testid="`dashboard-tasks-${heroTrip.name}`"
          />
        </template>
        <template v-if="!isPackingClosed(heroTrip)">
          <IonItem
            v-for="item in previewItems(heroTrip.id)"
            :key="item.id"
            lines="none"
            class="dashboard-item"
            :data-testid="`dashboard-preview-${item.name}`"
          >
            <IonCheckbox
              slot="start"
              :checked="isFullyPacked(item)"
              :indeterminate="isPartlyPacked(item)"
              disabled
            />
            <IonLabel>
              <span>{{ item.name }}</span>
              <span v-if="item.quantity > 1" class="qty-badge">
                {{ item.packed_count }}/{{ item.quantity }}
              </span>
            </IonLabel>
          </IonItem>

          <p
            v-if="openItemCount(heroTrip.id) > 3"
            class="more-items"
            :data-testid="`dashboard-more-${heroTrip.name}`"
          >
            {{ t('dashboard.moreItems', { n: openItemCount(heroTrip.id) - 3 }) }}
          </p>
        </template>
      </TripHero>
      <!-- FR-30.7: the modules' cards for this trip, as siblings of its card
           — the trip card is a link, and a card that can be worked is not. -->
      <template v-if="heroTrip && !isPackingClosed(heroTrip)">
        <component
          :is="card"
          v-for="(card, index) in tripCards"
          :key="`hero-${index}`"
          :trip-id="heroTrip.id"
          :trip-name="heroTrip.name"
          :planned="false"
          :packing-closed="isPackingClosed(heroTrip)"
        />
      </template>

      <!-- Trip cards -->
      <template v-for="trip in followingTrips" :key="trip.id">
        <RouterLink
          class="jp-card trip-card"
          :to="tripPath(trip.id)"
          :data-testid="`dashboard-trip-${trip.name}`"
        >
          <div class="trip-card-head">
            <div class="trip-card-title">
              <h3 class="trip-card-name">{{ trip.name }}</h3>
              <p v-if="counterOf(trip)" class="trip-counter" data-testid="trip-counter">
                {{ counterOf(trip)?.headline }}
              </p>
            </div>
            <p class="trip-dates">
              {{ formatTripPeriod(trip) }}
              <TripPhase v-bind="phaseOf(trip)" :testid="`dashboard-phase-${trip.name}`" />
            </p>
          </div>

          <div class="trip-card-body">
            <!-- FR-7.10: a finished packing draws no figure here — the phase after
                 the dates says it, and the ring would be answering a settled
                 question. -->
            <!-- The same figure the hero carries, one ring size down: a trip's
               progress is one composition in this app, and M2's list rows
               read it the same way. -->
            <ProgressFigure
              v-if="!isPackingClosed(trip)"
              :percent="progressFraction(trip) * 100"
              :headline="
                t('trips.itemSummary', {
                  packed: tripKpis(trip).packedItems,
                  total: tripKpis(trip).totalItems,
                })
              "
              :detail="
                openItemCount(trip.id) > 0
                  ? t('dashboard.openCount', { n: openItemCount(trip.id) })
                  : null
              "
              :ring-size="44"
              :headline-testid="`dashboard-summary-${trip.name}`"
            />
            <p
              v-if="taskLine(trip)"
              class="task-line"
              :data-testid="`dashboard-tasks-${trip.name}`"
            >
              {{ taskLine(trip) }}
            </p>

            <IonItem
              v-for="item in previewItems(trip.id)"
              :key="item.id"
              lines="none"
              class="dashboard-item"
              :data-testid="`dashboard-preview-${item.name}`"
            >
              <IonCheckbox
                slot="start"
                :checked="isFullyPacked(item)"
                :indeterminate="isPartlyPacked(item)"
                disabled
              />
              <IonLabel>
                <span>{{ item.name }}</span>
                <span v-if="item.quantity > 1" class="qty-badge">
                  {{ item.packed_count }}/{{ item.quantity }}
                </span>
              </IonLabel>
            </IonItem>

            <p
              v-if="openItemCount(trip.id) > 3"
              class="more-items"
              :data-testid="`dashboard-more-${trip.name}`"
            >
              {{ t('dashboard.moreItems', { n: openItemCount(trip.id) - 3 }) }}
            </p>
          </div>
        </RouterLink>
        <component
          :is="card"
          v-for="(card, index) in tripCards"
          :key="`${trip.id}-${index}`"
          :trip-id="trip.id"
          :trip-name="trip.name"
          :planned="false"
          :packing-closed="isPackingClosed(trip)"
        />
      </template>
      <!--
        FR-6.1: the trips that have not started yet. Below the active cards,
        because M1 answers "what do I have to do right now?" first and this is
        what comes after it.
      -->
      <template v-if="plannedTrips.length > 0">
        <SectionHead
          :title="t('dashboard.planned')"
          :count="plannedTrips.length"
          data-testid="dashboard-planned-head"
        />
        <div class="jp-card rows-card" data-testid="dashboard-planned">
          <template v-for="trip in plannedTrips" :key="trip.id">
            <IonItem
              lines="none"
              button
              class="dashboard-item"
              :data-testid="`dashboard-planned-${trip.name}`"
              @click="openTrip(trip.id)"
            >
              <IonLabel>
                <h3>{{ trip.name }}</h3>
                <p>{{ formatTripPeriod(trip) }}</p>
              </IonLabel>
            </IonItem>
          </template>
        </div>
        <!-- FR-30.7: a planned trip is where buying before departure happens;
             its card shows only while something is left to buy (the card
             decides), so the list of what comes next stays a list. -->
        <template v-for="trip in plannedTrips" :key="`cards-${trip.id}`">
          <component
            :is="card"
            v-for="(card, index) in tripCards"
            :key="`${trip.id}-${index}`"
            :trip-id="trip.id"
            :trip-name="trip.name"
            :planned="true"
            :packing-closed="isPackingClosed(trip)"
          />
        </template>
      </template>
    </IonContent>
  </IonPage>
</template>

<style scoped>
/*
 * G-14: the app's card, positioned by the screen and painted by nobody.
 * These blocks were Ionic's `ion-card` until 2026-09-09 (FR-21.28) — a
 * second radius, a second elevation and a 10 px inset of its own, which put
 * them a visible step in from the hero card above them.
 */
.trip-card,
.prep-card {
  display: block;
  margin-bottom: 12px;
}

/* The hero above the first of these sets no margin of its own, so the gap
   between the two cards is this one's to make. */
.trip-card {
  margin-top: 12px;
  color: inherit;
  text-decoration: none;
}

.trip-card-head {
  padding: 14px 16px 0;
}

/* A card whose whole content is rows: the rows bring their own inset, so the
   card only owes them the space above the first and under the last. */
.rows-card {
  padding-block: 6px;
}

.trip-card-body {
  padding: 12px 16px 14px;
}

.trip-card-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.trip-counter {
  margin: 0;
  color: var(--jp-action);
  font-size: var(--jp-text-sm);
  font-weight: var(--jp-weight-semibold);
}

/* FR-7.10: the way back to the packing list once the hero stopped showing it. */
.pack-link {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  min-height: 48px;
  padding: 0 14px;
  border: 1px solid var(--ct-surface0);
  border-radius: var(--jp-r-sm);
  color: var(--jp-action);
  font-size: var(--jp-text-md);
  font-weight: var(--jp-weight-semibold);
  text-decoration: none;
}

.pack-link:focus-visible {
  outline: 2px solid var(--jp-action);
  outline-offset: 2px;
}

.trip-card-name {
  font-size: var(--jp-text-lg);
  font-weight: var(--jp-weight-semibold);
  margin: 0;
}

.trip-dates {
  font-size: var(--jp-text-sm);
  color: var(--ion-color-medium);
  margin: 4px 0 0;
}

.dashboard-item {
  --min-height: 36px;
}

/* FR-7.10: only the words lead into the trip — the tick beside them is its
   own control, so the row itself carries no `button`. */
.note-body {
  display: block;
  width: 100%;
  padding: 8px 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.note-body h3,
.note-body p {
  margin: 0;
}

/* FR-7.4: a statement under the packing figure, not a part of it. */
.task-line {
  margin: 10px 0 4px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.qty-badge {
  font-size: var(--jp-text-sm);
  color: var(--ion-color-medium);
  margin-left: 8px;
}

.more-items {
  font-size: var(--jp-text-sm);
  color: var(--ion-color-primary);
  padding-left: 40px;
  margin-top: 4px;
}

/* Preparation is a brand affordance in the concept, not a caution. */
.prep-card {
  border-left: 3px solid var(--jp-brand);
}

/* FR-6.1: what arrived since this device last showed the section. The action
   role (G-11), because it is the one thing here that is *news*. */
.dashboard-item.is-new {
  border-inline-start: 3px solid var(--jp-action);
}
</style>
