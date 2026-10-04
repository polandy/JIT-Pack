<script setup lang="ts">
/**
 * M31 — a trip's meal plan (§3.33): what the family eats on each day, who
 * cooks it, and what is still to buy for it.
 *
 * The days one under another from today — the past ones folded into a line
 * above — each with its breakfast, lunch and dinner, the snack only while it
 * holds a meal; a shopping bar on top while an ingredient is open; the ＋ for
 * the first empty slot. Every meal opens the one sheet the composition root
 * mounts (`MealSheet.vue`).
 */
import { IonContent, IonFab, IonFabButton, IonIcon, IonPage } from '@ionic/vue'
import { addOutline, cartOutline, restaurantOutline } from 'ionicons/icons'
import { computed, inject, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import EmptyState from '@/components/global/EmptyState.vue'
import ProgressRing from '@/components/global/ProgressRing.vue'
import UserAvatar from '@/components/global/UserAvatar.vue'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import { useOrchestrator } from '@/composables/useOrchestrator'
import { useTripIdentity } from '@/composables/useTripIdentity'
import { useTripScreen } from '@/composables/useTripScreen'
import { t } from '@/i18n'
import { FAB_ANCHOR } from '@/lib/fabAnchors'
import { MEAL_CONTEXT } from '@/lib/mealContext'
import { shortDueDay } from '@/lib/taskDueText'
import { tripSubPath } from '@/router/paths'
import type { Meal, MealSlot } from '@/types/domain'
import { MEAL_KIND_OUT, MEAL_SLOT_SNACK } from '@/types/domain'
import {
  STANDING_SLOTS,
  boughtShare,
  excursionFor,
  firstFreeSlot,
  mealsOn,
  planDays,
  shoppingFigures,
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

/** The days already behind, folded into one line above the rest while the trip is under way. */
const pastDays = computed(() => days.value.filter((day) => day < today.value))
const comingDays = computed(() => days.value.filter((day) => day >= today.value))
const pastOpen = ref(false)
const pastMeals = computed(() => meals.value.filter((meal) => meal.on_date < today.value).length)
const shownDays = computed(() =>
  pastOpen.value ? days.value : comingDays.value.length > 0 ? comingDays.value : days.value,
)

const figures = computed(() =>
  shoppingFigures(meals.value, ingredients.value, today.value, trip.value?.start_date ?? null),
)

/** A day's slots as M31 draws them: breakfast, lunch and dinner always, the snack while it holds a meal. */
function slotsOf(day: string): { slot: MealSlot; meals: Meal[] }[] {
  const ofDay = mealsOn(meals.value, day)
  const slots = [...STANDING_SLOTS]
  if (ofDay.some((meal) => meal.slot === MEAL_SLOT_SNACK)) slots.splice(2, 0, MEAL_SLOT_SNACK)
  return slots.map((slot) => ({ slot, meals: ofDay.filter((meal) => meal.slot === slot) }))
}

function hasSnack(day: string): boolean {
  return meals.value.some((meal) => meal.on_date === day && meal.slot === MEAL_SLOT_SNACK)
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
            v-if="pastDays.length > 0 && comingDays.length > 0"
            type="button"
            class="past"
            :aria-expanded="pastOpen ? 'true' : 'false'"
            data-testid="m31-past"
            @click="pastOpen = !pastOpen"
          >
            {{
              pastOpen
                ? `⌃ ${t('meals.pastClose')}`
                : `› ${t('meals.past', {
                    n: pastDays.length,
                    meals: t('meals.mealCount', { n: pastMeals }),
                  })}`
            }}
          </button>

          <section
            v-for="day in shownDays"
            :key="day"
            class="day"
            :class="{ gone: day < today && comingDays.length > 0 }"
            :data-testid="`m31-day-${day}`"
          >
            <h2 class="day-head">
              <span class="date">{{ shortDueDay(day) }}</span>
              <span v-if="day === today" class="today">{{ t('meals.today') }}</span>
              <span v-if="dayEvent(day)" class="event">{{ dayEvent(day) }}</span>
              <span class="n jp-num">{{ t('meals.dayN', { n: days.indexOf(day) + 1 }) }}</span>
            </h2>
            <div class="jp-card slots">
              <template v-for="row in slotsOf(day)" :key="row.slot">
                <button
                  v-for="meal in row.meals"
                  :key="meal.id"
                  type="button"
                  class="slot"
                  :data-slot="row.slot"
                  :data-testid="`m31-meal-${meal.id}`"
                  @click="sheet.openMeal(tripId, meal.id)"
                >
                  <span class="label jp-eyebrow">{{ t(`meals.slotShort.${row.slot}`) }}</span>
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
                <button
                  v-if="row.meals.length === 0"
                  type="button"
                  class="slot empty"
                  :aria-label="
                    t('meals.addAria', { slot: t(`meals.slot.${row.slot}`), day: shortDueDay(day) })
                  "
                  :data-testid="`m31-add-${day}-${row.slot}`"
                  @click="sheet.openNew(tripId, day, row.slot)"
                >
                  <span class="label jp-eyebrow">{{ t(`meals.slotShort.${row.slot}`) }}</span>
                  <span class="add">{{
                    t('meals.add', { slot: t(`meals.slot.${row.slot}`) })
                  }}</span>
                </button>
              </template>
              <button
                v-if="!hasSnack(day)"
                type="button"
                class="snack-add"
                :data-testid="`m31-add-${day}-${MEAL_SLOT_SNACK}`"
                @click="sheet.openNew(tripId, day, MEAL_SLOT_SNACK)"
              >
                {{ t('meals.add', { slot: t(`meals.slot.${MEAL_SLOT_SNACK}`) }) }}
              </button>
            </div>
          </section>
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

.n {
  margin-left: auto;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-regular);
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

.slot.empty {
  padding-block: 6px;
}

.slot .add {
  justify-self: start;
  padding: 3px 10px;
  border: 1px dashed var(--ct-surface1);
  border-radius: var(--jp-r-sm);
  color: var(--ct-overlay1);
  font-size: var(--jp-text-sm);
}

.slot.empty:hover .add {
  border-color: var(--jp-action);
  color: var(--jp-action);
}

.snack-add {
  display: block;
  width: 100%;
  padding: 5px 12px 7px;
  border: 0;
  background: transparent;
  color: var(--ct-overlay1);
  font: inherit;
  font-size: var(--jp-text-sm);
  text-align: end;
  cursor: pointer;
}

.snack-add:hover {
  color: var(--jp-action);
}

.slot:focus-visible,
.snack-add:focus-visible,
.shop-bar:focus-visible,
.past:focus-visible {
  outline: 2px solid var(--jp-action);
  outline-offset: -2px;
}
</style>
