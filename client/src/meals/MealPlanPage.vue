<script setup lang="ts">
/**
 * M31 — a trip's meal plan (§3.33): what the family eats on each day, who
 * cooks it, and what is still to buy for it.
 *
 * Meals are planned now and then, not for every day: only the days that hold a meal stand as cards, from today on,
 * the meals already eaten folded into a line above; a run of free days between
 * them is one dashed line that opens into its days. A shopping bar on top while
 * an ingredient is open, a start with earlier dishes on an empty plan, the ＋
 * for the first empty slot. Every meal opens the one sheet the composition root
 * mounts (`MealSheet.vue`).
 *
 * A meal still ahead is moved to another day by its grip (FR-33.15), M6's and
 * M25's gesture (`useDragToGroup`): while it is in the air every free day
 * opens into a row of its own, so each day of the trip is a place to drop,
 * and the plan glides open and shut around it (`glide.ts`).
 */
import { IonButton, IonContent, IonFab, IonFabButton, IonIcon, IonPage } from '@ionic/vue'
import { addOutline, cartOutline, restaurantOutline } from 'ionicons/icons'
import { computed, inject, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import ChoiceChip from '@/components/global/ChoiceChip.vue'
import DragGrip from '@/components/global/DragGrip.vue'
import EmptyState from '@/components/global/EmptyState.vue'
import ProgressRing from '@/components/global/ProgressRing.vue'
import UserAvatar from '@/components/global/UserAvatar.vue'
import { useDragToGroup } from '@/composables/shared/useDragToGroup'
import { setHeaderTitle } from '@/composables/shared/useHeaderTitle'
import { useOrchestrator } from '@/composables/shared/useOrchestrator'
import { useTripIdentity } from '@/composables/shared/useTripIdentity'
import { useTripScreen } from '@/composables/shared/useTripScreen'
import { formatDate, t } from '@/i18n'
import { FAB_ANCHOR } from '@/lib/fabAnchors'
import { MEAL_CONTEXT } from '@/kernel/mealContext'
import { presentToast, TOAST_DURATION_MS } from '@/composables/shared/toast'
import { localDay, shortDueDay } from '@/lib/taskDueText'
import { tripSubPath } from '@/router/paths'
import type { Meal, MealSlot } from '@/types/domain'
import { MEAL_KIND_OUT, MEAL_SLOT_DINNER, MEAL_SLOTS } from '@/types/domain'
import { createMealActions } from './actions'
import {
  agenda,
  boughtShare,
  canMove,
  earlierDishes,
  excursionFor,
  firstFreeSlot,
  matchingDishes,
  mealsOn,
  movedMeal,
  pastMeals,
  planDays,
  shoppingFigures,
  slotToPlan,
  startingDay,
  takesMeal,
} from './domain/mealPlan'
import { learnedFreshness } from './domain/ingredients'
import { glide, GLIDE_ATTRIBUTE, snapshot } from './glide'
import { FRESH_NOTE_TOAST_MS, freshNote } from './moveNote'
import { useMealSheet } from './sheet'
import { mealFacts } from './sources'
import { useMealStore } from './store'

const props = defineProps<{ tripId: string }>()

const orchestrator = useOrchestrator()
const mealStore = useMealStore()
const sheet = useMealSheet()
const actions = createMealActions(orchestrator.moduleHost, mealStore)
const context = inject(MEAL_CONTEXT, null)
const router = useRouter()

const { trip, loaded, ensure } = useTripScreen(props.tripId, orchestrator)
const { nameOf, load: loadIdentity } = useTripIdentity(props.tripId, orchestrator.identity)

const contentEl = ref<InstanceType<typeof IonContent> | null>(null)
/** The page's scroller, read once: a move keeps the meal under the finger through it. */
let scroller: HTMLElement | null = null

onMounted(async () => {
  scroller = (await contentEl.value?.$el.getScrollElement?.()) ?? null
  await ensure()
  await loadIdentity()
})

setHeaderTitle(
  () => t('meals.title'),
  () => trip.value?.name,
)

const days = computed(() => planDays(trip.value?.start_date ?? null, trip.value?.end_date ?? null))
const today = computed(() => orchestrator.today())
const meals = computed(() => mealStore.getMeals(props.tripId))
const ingredients = computed(() => mealStore.getIngredients(props.tripId))

/** The meals of the days behind, folded into one line above the rest (M31). */
const eaten = computed(() => pastMeals(meals.value, today.value))
const pastOpen = ref(false)
/** The meal in the air (FR-33.15): while there is one, the days behind fold and every free day opens. */
const lifted = ref<Meal | null>(null)
/** Only the planned days stand as days; a run of free ones is one line (M31). */
const items = computed(() =>
  agenda(days.value, meals.value, today.value, pastOpen.value && lifted.value === null),
)
/** The free runs opened in place, by their first day. */
const openGaps = ref<Set<string>>(new Set())

const figures = computed(() =>
  shoppingFigures(meals.value, ingredients.value, today.value, trip.value?.start_date ?? null),
)

/** FR-33.4: an empty plan offers the dishes of earlier trips, each planned tonight with a tap. */
const offered = computed(() =>
  meals.value.length > 0 || !context
    ? []
    : matchingDishes(
        earlierDishes({
          meals: mealStore.allMeals(),
          ingredients: mealStore.allIngredients(),
          trips: context.trips(),
          tripId: props.tripId,
        }),
        '',
      ),
)

/** A run of free days in words: one day, or its first and last. */
function gapText(run: readonly string[]): string {
  const first = run[0]!
  const last = run[run.length - 1]!
  return run.length === 1
    ? t('meals.gapOne', { day: shortDueDay(first) })
    : t('meals.gapMany', { from: shortWeekday(first), to: shortDueDay(last) })
}

function shortWeekday(day: string): string {
  return formatDate(localDay(day), { weekday: 'short' })
}

function openGap(run: readonly string[]) {
  openGaps.value = new Set([...openGaps.value, run[0]!])
}

/** A run of free days stands as a row per day: opened by a tap, or while a meal is in the air. */
function gapOpen(run: readonly string[]): boolean {
  return lifted.value !== null || openGaps.value.has(run[0]!)
}

/** The short name of a slot, as the rows and the chip's fields say it. */
const slotShort = (slot: MealSlot) => t(`meals.slotShort.${slot}`)

/**
 * FR-33.15: the drag. Only a day ahead takes a meal; the slot is chosen in
 * the chip's fields by how far right the finger is (G-21). Where neither the
 * day nor the slot would change there is no place to go, so the chip says it
 * stays and nothing frames.
 */
const drag = useDragToGroup<Meal>({
  carry: {
    title: (meal) => meal.title,
    tag: (meal) => slotShort(meal.slot),
    target: (meal, place, label, choice) => {
      const slot = (choice as MealSlot | null) ?? meal.slot
      if (place.target === meal.on_date && slot === meal.slot) return null
      return slot === meal.slot ? label : `${label} · ${slotShort(slot)}`
    },
    stays: (meal) => t('meals.moveStays', { day: shortDueDay(meal.on_date) }),
    choices: (meal) => ({
      keep: t('meals.moveKeepsSlot', { slot: slotShort(meal.slot) }),
      options: MEAL_SLOTS.map((slot) => ({
        key: slot,
        label: slotShort(slot),
        current: slot === meal.slot,
      })),
    }),
  },
  accepts: (_meal, place) => takesMeal(place.target, today.value),
  onDrop: (meal, place) => move(meal, place.target, (place.choice as MealSlot | null) ?? meal.slot),
})
watch(
  () => contentEl.value?.$el ?? null,
  (el) => drag.bindHost(el),
  { immediate: true },
)

/** The block a meal's row is keyed by, for the glide and for staying under the finger. */
const mealKey = (meal: Pick<Meal, 'id'>) => `meal:${meal.id}`

/**
 * The grip lifts at once. The free days open around the meal, the list
 * shifted so the row under the finger stays there (ADR-060), and every block
 * glides to its new place.
 */
function onLift(ev: PointerEvent, meal: Meal) {
  const row = (ev.currentTarget as HTMLElement).closest<HTMLElement>(`[${GLIDE_ATTRIBUTE}]`)
  const root = contentEl.value?.$el as HTMLElement | undefined
  if (!row || !root) return
  const before = snapshot(root)
  drag.down(ev, meal, row, true)
  lifted.value = meal
  void settleAround(meal, before, before.get(mealKey(meal)) ?? null)
}

/** Let go: the free days close, and the meal slides from where the chip was into its day. */
function onUp(ev: PointerEvent) {
  const meal = lifted.value
  const root = contentEl.value?.$el as HTMLElement | undefined
  if (!meal || !root) return drag.up(ev)
  const before = snapshot(root)
  const chip = document.querySelector('[data-drag-ghost]')?.getBoundingClientRect().top ?? null
  if (chip !== null) before.set(mealKey(meal), chip)
  drag.up(ev)
  lifted.value = null
  void settleAround(meal, before, chip)
}

function onCancel() {
  const meal = lifted.value
  const root = contentEl.value?.$el as HTMLElement | undefined
  drag.cancel()
  if (!meal || !root) return
  const before = snapshot(root)
  lifted.value = null
  void settleAround(meal, before, before.get(mealKey(meal)) ?? null)
}

/**
 * Once the plan has re-laid itself: scrolled so the meal's row stands at
 * `anchor` — where the finger or the chip was — then every block glides from
 * where `before` saw it.
 */
async function settleAround(meal: Meal, before: Map<string, number>, anchor: number | null) {
  await nextTick()
  const root = contentEl.value?.$el as HTMLElement | undefined
  if (!root) return
  const row = root.querySelector<HTMLElement>(`[${GLIDE_ATTRIBUTE}="${mealKey(meal)}"]`)
  if (row && scroller && anchor !== null) {
    scroller.scrollTop += row.getBoundingClientRect().top - anchor
  }
  glide(root, before)
}

/** FR-33.13: each name's last freshness, asked once a move needs it. */
function learned() {
  return learnedFreshness(mealStore.allMeals(), mealStore.allIngredients())
}

/**
 * FR-33.15: the move written, and said in a toast — with the time it dropped
 * and the bought fresh ingredients it may outlast — whose undo puts it back.
 */
function move(meal: Meal, day: string, slot: MealSlot) {
  if (day === meal.on_date && slot === meal.slot) return
  const excursions = context?.excursions(props.tripId) ?? []
  const to = movedMeal(meal, day, excursions, slot)
  const undo = actions.moveMeal(meal, to)
  const nameOf = (id: string | null) => excursions.find((e) => e.id === id)?.name ?? null
  const leftFor = to.excursion_id !== meal.excursion_id ? nameOf(meal.excursion_id) : null
  const along = to.excursion_id !== meal.excursion_id ? nameOf(to.excursion_id) : null
  const words = { title: meal.title, day: shortDueDay(day), slot: slotShort(slot) }
  const moved = t(slot === meal.slot ? 'meals.moved' : 'meals.movedSlot', words)
  const fresh = freshNote(meal.on_date, day, ingredientsOf(meal), learned())
  const notes = [
    meal.at_time && to.at_time === null ? t('meals.movedTimeGone', { time: meal.at_time }) : null,
    along
      ? t('meals.movedAlong', { name: along })
      : leftFor
        ? t('meals.movedOff', { name: leftFor })
        : null,
    fresh,
  ].filter((note) => note !== null)
  void presentToast({
    message: [moved, ...notes].join(' · '),
    duration: fresh ? FRESH_NOTE_TOAST_MS : TOAST_DURATION_MS,
    positionAnchor: FAB_ANCHOR.m31,
    cssClass: 'pack-toast',
    buttons: [{ text: t('packing.undo'), handler: () => undo() }],
  })
}

/** What a day's head says beside its date: arrival, departure, or the excursion of the day. */
function dayEvent(day: string): string | null {
  if (day === trip.value?.start_date) return t('meals.arrival')
  if (day === trip.value?.end_date) return t('meals.departure')
  const excursion = excursionFor(day, context?.excursions(props.tripId) ?? [])
  return excursion ? `🪧 ${excursion.name}` : null
}

function ingredientsOf(meal: Meal) {
  return ingredients.value.filter((ingredient) => ingredient.meal_id === meal.id)
}

function share(meal: Meal): number | null {
  if (meal.kind === MEAL_KIND_OUT) return null
  const { bought, total } = boughtShare(ingredientsOf(meal))
  return total > 0 ? (bought / total) * 100 : null
}

function cookOf(meal: Meal): string | null {
  return meal.kind === MEAL_KIND_OUT ? null : nameOf(meal.cook_user_id)
}

function excursionName(meal: Meal): string | null {
  if (!meal.excursion_id) return null
  return context?.excursions(props.tripId).find((e) => e.id === meal.excursion_id)?.name ?? null
}

function openNew() {
  const free = firstFreeSlot(meals.value, days.value, today.value)
  sheet.openNew(props.tripId, free.day, free.slot)
}

/** A day's own ＋ and a free day's: a new meal there, dinner first. */
function planOn(day: string) {
  sheet.openNew(props.tripId, day, slotToPlan(meals.value, day))
}
</script>

<template>
  <IonPage>
    <IonContent
      ref="contentEl"
      class="meal-content"
      data-testid="m31-page"
      @pointermove="drag.move"
      @pointerup="onUp"
      @pointercancel="onCancel"
    >
      <template v-if="loaded">
        <EmptyState
          v-if="days.length === 0"
          :icon="restaurantOutline"
          :title="t('meals.noDates')"
          testid="m31-no-dates"
        />
        <template v-else>
          <button
            v-if="figures.open > 0"
            type="button"
            class="shop-bar"
            data-testid="m31-shop"
            @click="router.push(tripSubPath(tripId, 'shopping'))"
          >
            <IonIcon :icon="cartOutline" aria-hidden="true" />
            <span class="words">
              <b>{{ t('meals.shopTitle', { n: figures.open }) }}</b>
              <small>{{
                figures.today > 0
                  ? t('meals.shopToday', { n: figures.today })
                  : t('meals.shopNoneToday')
              }}</small>
            </span>
            <span class="go">{{ t('meals.shopGo') }} ›</span>
          </button>

          <button
            v-if="eaten.length > 0"
            type="button"
            class="past"
            :aria-expanded="pastOpen ? 'true' : 'false'"
            data-testid="m31-past"
            @click="pastOpen = !pastOpen"
          >
            {{
              pastOpen ? `⌃ ${t('meals.pastClose')}` : `› ${t('meals.eaten', { n: eaten.length })}`
            }}
          </button>

          <section v-if="meals.length === 0" class="start" data-testid="m31-empty">
            <IonIcon :icon="restaurantOutline" class="start-icon" aria-hidden="true" />
            <h2 class="start-title">{{ t('meals.emptyTitle') }}</h2>
            <p class="start-text">{{ t('meals.emptyText') }}</p>
            <IonButton
              shape="round"
              data-testid="m31-empty-plan"
              @click="sheet.openNew(tripId, startingDay(days, today), MEAL_SLOT_DINNER)"
            >
              <IonIcon slot="start" :icon="addOutline" aria-hidden="true" />
              {{ t('meals.emptyPlan') }}
            </IonButton>
            <div v-if="offered.length > 0" class="start-dishes">
              <span class="jp-eyebrow">{{ t('meals.emptyEarlier') }}</span>
              <div class="dishes">
                <ChoiceChip
                  v-for="(dish, n) in offered"
                  :key="dish.title"
                  :pressed="false"
                  :data-testid="`m31-empty-dish-${n}`"
                  @click="
                    sheet.openNew(tripId, startingDay(days, today), MEAL_SLOT_DINNER, dish.title)
                  "
                >
                  {{ dish.title }}
                </ChoiceChip>
              </div>
            </div>
          </section>

          <template v-else>
            <template
              v-for="item in items"
              :key="item.kind === 'day' ? item.day : `gap:${item.days[0]}`"
            >
              <section
                v-if="item.kind === 'day'"
                class="day"
                :class="{ gone: item.day < today }"
                :data-testid="`m31-day-${item.day}`"
                :data-drop-target="item.day"
                :data-drop-label="shortDueDay(item.day)"
                :data-glide="`day:${item.day}`"
              >
                <h2 class="day-head">
                  <span class="date">{{ shortDueDay(item.day) }}</span>
                  <span v-if="item.day === today" class="today">{{ t('meals.today') }}</span>
                  <span v-if="dayEvent(item.day)" class="event">{{ dayEvent(item.day) }}</span>
                  <button
                    type="button"
                    class="day-add"
                    :aria-label="t('meals.addOn', { day: shortDueDay(item.day) })"
                    :data-testid="`m31-add-${item.day}`"
                    @click="planOn(item.day)"
                  >
                    ＋
                  </button>
                  <span class="drop-here">{{ t('list.dropHere') }}</span>
                </h2>
                <div class="jp-card slots">
                  <button
                    v-for="meal in mealsOn(meals, item.day)"
                    :key="meal.id"
                    type="button"
                    class="slot"
                    :data-slot="meal.slot"
                    :data-testid="`m31-meal-${meal.id}`"
                    :data-glide="mealKey(meal)"
                    @click="sheet.openMeal(tripId, meal.id)"
                  >
                    <DragGrip
                      v-if="canMove(meal, today)"
                      :label="t('meals.drag', { title: meal.title })"
                      :data-testid="`m31-grip-${meal.id}`"
                      @pointerdown.stop="onLift($event, meal)"
                      @click.stop
                    />
                    <DragGrip v-else off />
                    <span class="label jp-eyebrow">{{ t(`meals.slotShort.${meal.slot}`) }}</span>
                    <span class="body">
                      <span class="title">
                        <template v-if="meal.kind === MEAL_KIND_OUT">🍴 </template>{{ meal.title }}
                        <span v-if="meal.at_time" class="time jp-num">· {{ meal.at_time }}</span>
                      </span>
                      <span class="facts">
                        <template v-if="cookOf(meal)">
                          <UserAvatar :name="cookOf(meal)!" :seed="meal.cook_user_id!" :size="18" />
                          {{ t('meals.cooks', { name: cookOf(meal)! }) }} ·
                        </template>
                        {{ mealFacts(meal, ingredientsOf(meal)) }}
                        <template v-if="excursionName(meal)">
                          · {{ t('meals.takenAlong', { name: excursionName(meal)! }) }}
                        </template>
                      </span>
                    </span>
                    <ProgressRing
                      v-if="share(meal) !== null"
                      :percent="share(meal)!"
                      :size="24"
                      :data-testid="`m31-ring-${meal.id}`"
                    />
                  </button>
                </div>
              </section>
              <div
                v-else-if="gapOpen(item.days)"
                class="free-days"
                :data-testid="`m31-free-${item.days[0]}`"
              >
                <button
                  v-for="day in item.days"
                  :key="day"
                  type="button"
                  class="free-day"
                  :data-testid="`m31-plan-${day}`"
                  :data-drop-target="lifted ? day : undefined"
                  :data-drop-label="shortDueDay(day)"
                  :data-glide="`day:${day}`"
                  @click="planOn(day)"
                >
                  <b>{{ shortDueDay(day) }}</b>
                  <span v-if="day === today">{{ t('meals.today') }}</span>
                  <span v-if="dayEvent(day) && lifted" class="event">{{ dayEvent(day) }}</span>
                  <span v-if="lifted" class="drop-here">{{ t('list.dropHere') }}</span>
                  <span v-else class="plan">＋ {{ t('meals.plan') }}</span>
                </button>
              </div>
              <button
                v-else
                type="button"
                class="gap"
                :data-days="item.days.join(' ')"
                :data-testid="`m31-gap-${item.days[0]}`"
                :data-glide="`day:${item.days[0]}`"
                @click="openGap(item.days)"
              >
                <span>{{ gapText(item.days) }} · ＋</span>
              </button>
            </template>
          </template>
        </template>
      </template>

      <IonFab
        v-if="days.length > 0 && !lifted"
        :id="FAB_ANCHOR.m31"
        slot="fixed"
        vertical="bottom"
        horizontal="end"
      >
        <IonFabButton :aria-label="t('meals.fab')" data-testid="m31-fab" @click="openNew">
          <IonIcon :icon="addOutline" />
        </IonFabButton>
      </IonFab>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.meal-content {
  --padding-top: 6px;
  /* Room for the FAB over the last card. */
  --padding-bottom: 96px;
}

.shop-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  width: calc(100% - 24px);
  margin: 0 12px 12px;
  padding: 10px 12px;
  border: 1px solid var(--ct-surface0);
  border-radius: var(--jp-r-md);
  background: color-mix(in srgb, var(--ct-straw) 10%, var(--jp-surface-card));
  color: var(--ct-text);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.shop-bar ion-icon {
  flex: none;
  font-size: var(--jp-icon-md);
}

.shop-bar .words {
  display: flex;
  flex: 1;
  flex-direction: column;
}

.shop-bar small {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.shop-bar .go {
  color: var(--jp-action);
  font-size: var(--jp-text-sm);
  font-weight: var(--jp-weight-semibold);
  white-space: nowrap;
}

.past {
  display: block;
  margin: 0 16px 10px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--ct-subtext0);
  font: inherit;
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.day {
  margin: 0 12px 14px;
}

.day.gone {
  opacity: 0.62;
}

.day-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0 4px 6px;
  font-size: var(--jp-text-sm);
  font-weight: var(--jp-weight-semibold);
}

.today {
  padding: 0 7px;
  border-radius: var(--jp-r-pill);
  background: var(--jp-action);
  color: var(--ct-base);
  font-size: var(--jp-text-xs);
}

.event {
  min-width: 0;
  overflow: hidden;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-regular);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slots {
  overflow: hidden;
}

.slot {
  display: grid;
  /* The label column holds the widest one-word slot name, *Morgen* (57 px as
     an eyebrow); *Znüni/Zvieri* breaks at its slash, never inside a word (G-13). */
  grid-template-columns: auto 60px 1fr auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 12px;
  border: 0;
  border-bottom: 1px solid var(--ct-surface0);
  background: transparent;
  color: var(--ct-text);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.slot .label {
  color: var(--ct-subtext0);
  overflow-wrap: normal;
}

.slot .body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.slot .title {
  font-weight: var(--jp-weight-semibold);
  overflow-wrap: anywhere;
}

.slot .time,
.slot .facts {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
  font-weight: var(--jp-weight-regular);
}

.slot .facts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.day-add {
  margin-left: auto;
  padding: 0 4px;
  border: 0;
  background: none;
  color: var(--jp-action);
  font: inherit;
  font-size: var(--jp-text-md);
  font-weight: var(--jp-weight-semibold);
  cursor: pointer;
}

/* A run of free days: one quiet dashed line between the planned ones. */
.gap {
  display: flex;
  align-items: center;
  gap: 8px;
  width: calc(100% - 24px);
  margin: 0 12px 12px;
  padding: 4px;
  border: 0;
  background: none;
  color: var(--ct-overlay1);
  font: inherit;
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.gap::before,
.gap::after {
  flex: 1;
  border-top: 1px dashed var(--ct-surface1);
  content: '';
}

.gap:hover {
  color: var(--jp-action);
}

.free-days {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0 12px 12px;
}

.free-day {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 12px;
  border: 1px dashed var(--ct-surface1);
  border-radius: var(--jp-r-md);
  background: transparent;
  color: var(--ct-subtext0);
  font: inherit;
  font-size: var(--jp-text-sm);
  text-align: start;
  cursor: pointer;
}

.free-day b {
  min-width: 92px;
  color: var(--ct-subtext1);
}

.free-day .plan {
  margin-left: auto;
  color: var(--jp-action);
  font-weight: var(--jp-weight-semibold);
}

/* FR-33.15: a day under a meal in the air — the frame and tint of a group on
   M6 (ListGroup.vue), and its words in place of the ＋. The day it already
   stands on takes nothing and so shows nothing; a day behind dims. */
.day[data-drop-over],
.free-day[data-drop-over] {
  border-radius: var(--jp-r-md);
  background: color-mix(in srgb, var(--jp-action) 8%, transparent);
  box-shadow: 0 0 0 1px var(--jp-action);
}

.day[data-drop-refused] {
  opacity: 0.5;
}

.free-day[data-drop-over] {
  border-style: solid;
  border-color: var(--jp-action);
}

.drop-here {
  margin-left: auto;
  color: var(--jp-action);
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-semibold);
  opacity: 0;
}

.day .drop-here {
  display: none;
}

.day[data-drop-over] .drop-here {
  display: inline;
  opacity: 1;
}

.day[data-drop-over] .day-add {
  display: none;
}

.free-day[data-drop-over] .drop-here {
  opacity: 1;
}

/* An empty plan: a start rather than a wall of empty slots. */
.start {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px 20px 12px;
  text-align: center;
}

.start-icon {
  color: var(--ct-subtext0);
  font-size: var(--jp-icon-2xl);
}

.start-title {
  margin: 8px 0 4px;
  font-size: var(--jp-text-lg);
  font-weight: var(--jp-weight-semibold);
}

.start-text {
  max-width: 300px;
  margin: 0 0 14px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.start-dishes {
  align-self: stretch;
  margin-top: 18px;
  text-align: start;
}

.start-dishes .jp-eyebrow {
  display: block;
  margin-bottom: 6px;
  color: var(--ct-subtext0);
}

.dishes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.slot:focus-visible,
.gap:focus-visible,
.free-day:focus-visible,
.day-add:focus-visible,
.shop-bar:focus-visible,
.past:focus-visible {
  outline: 2px solid var(--jp-action);
  outline-offset: -2px;
}
</style>
