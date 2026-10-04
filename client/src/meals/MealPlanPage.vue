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
 */
import { IonButton, IonContent, IonFab, IonFabButton, IonIcon, IonPage } from '@ionic/vue'
import { addOutline, cartOutline, restaurantOutline } from 'ionicons/icons'
import { computed, inject, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import ChoiceChip from '@/components/global/ChoiceChip.vue'
import EmptyState from '@/components/global/EmptyState.vue'
import ProgressRing from '@/components/global/ProgressRing.vue'
import UserAvatar from '@/components/global/UserAvatar.vue'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import { useOrchestrator } from '@/composables/useOrchestrator'
import { useTripIdentity } from '@/composables/useTripIdentity'
import { useTripScreen } from '@/composables/useTripScreen'
import { formatDate, t } from '@/i18n'
import { FAB_ANCHOR } from '@/lib/fabAnchors'
import { MEAL_CONTEXT } from '@/lib/mealContext'
import { localDay, shortDueDay } from '@/lib/taskDueText'
import { tripSubPath } from '@/router/paths'
import type { Meal } from '@/types/domain'
import { MEAL_KIND_OUT, MEAL_SLOT_DINNER } from '@/types/domain'
import {
  agenda,
  boughtShare,
  earlierDishes,
  excursionFor,
  firstFreeSlot,
  matchingDishes,
  mealsOn,
  pastMeals,
  planDays,
  shoppingFigures,
  slotToPlan,
  startingDay,
} from './domain/mealPlan'
import { useMealSheet } from './sheet'
import { mealFacts } from './sources'
import { useMealStore } from './store'

const props = defineProps<{ tripId: string }>()

const orchestrator = useOrchestrator()
const mealStore = useMealStore()
const sheet = useMealSheet()
const context = inject(MEAL_CONTEXT, null)
const router = useRouter()

const { trip, loaded, ensure } = useTripScreen(props.tripId, orchestrator)
const { nameOf, load: loadIdentity } = useTripIdentity(props.tripId, orchestrator)

onMounted(async () => {
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
/** Only the planned days stand as days; a run of free ones is one line (M31). */
const items = computed(() => agenda(days.value, meals.value, today.value, pastOpen.value))
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
    <IonContent class="meal-content" data-testid="m31-page">
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
                </h2>
                <div class="jp-card slots">
                  <button
                    v-for="meal in mealsOn(meals, item.day)"
                    :key="meal.id"
                    type="button"
                    class="slot"
                    :data-slot="meal.slot"
                    :data-testid="`m31-meal-${meal.id}`"
                    @click="sheet.openMeal(tripId, meal.id)"
                  >
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
                v-else-if="openGaps.has(item.days[0]!)"
                class="free-days"
                :data-testid="`m31-free-${item.days[0]}`"
              >
                <button
                  v-for="day in item.days"
                  :key="day"
                  type="button"
                  class="free-day"
                  :data-testid="`m31-plan-${day}`"
                  @click="planOn(day)"
                >
                  <b>{{ shortDueDay(day) }}</b>
                  <span v-if="day === today">{{ t('meals.today') }}</span>
                  <span class="plan">＋ {{ t('meals.plan') }}</span>
                </button>
              </div>
              <button
                v-else
                type="button"
                class="gap"
                :data-days="item.days.join(' ')"
                :data-testid="`m31-gap-${item.days[0]}`"
                @click="openGap(item.days)"
              >
                <span>{{ gapText(item.days) }} · ＋</span>
              </button>
            </template>
          </template>
        </template>
      </template>

      <IonFab
        v-if="days.length > 0"
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
  grid-template-columns: 62px 1fr auto;
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
