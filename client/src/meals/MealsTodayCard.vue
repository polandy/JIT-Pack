<script setup lang="ts">
/**
 * *Heute essen* on the dashboard (FR-33.7): during the trip, today's meals in
 * their order — the slot, the dish, who cooks and what is still to buy — and
 * the way onto M31. A tap opens the meal's sheet over the dashboard.
 *
 * It reaches M1 through `kernel/tripCards.ts`, like the planner's *Heute* card,
 * which leaves the meals to this one; once the packing is finished it is a
 * block of the hero (FR-7.10). Absent before and after the trip, and on a day
 * without meals.
 */
import { computed } from 'vue'

import DashboardBlock from '@/components/global/DashboardBlock.vue'
import ProgressRing from '@/components/global/ProgressRing.vue'
import { useOrchestrator } from '@/composables/shared/useOrchestrator'
import { useTripIdentity } from '@/composables/shared/useTripIdentity'
import { t } from '@/i18n'
import type { TripCardProps } from '@/kernel/tripCards'
import { tripSubPath } from '@/router/paths'
import type { Meal } from '@/types/domain'
import { MEAL_KIND_OUT } from '@/types/domain'
import { boughtShare, mealsOn, planDays } from './domain/mealPlan'
import { useMealSheet } from './sheet'
import { useMealStore } from './store'

const props = defineProps<TripCardProps>()

/** The block's remembered fold (`composables/blockFold.ts`). */
const MEALS_FOLD_KEY = 'meals'

const orchestrator = useOrchestrator()
const mealStore = useMealStore()
const sheet = useMealSheet()
const { nameOf } = useTripIdentity(props.tripId, orchestrator.identity)

const today = computed(() => orchestrator.today())
const meals = computed(() =>
  planDays(props.startDate, props.endDate).includes(today.value)
    ? mealsOn(mealStore.getMeals(props.tripId), today.value)
    : [],
)
const visible = computed(() => meals.value.length > 0)
const mealsPath = computed(() => tripSubPath(props.tripId, 'meals'))

/** A row's second line: who cooks, and what is open — or where it is eaten. */
function facts(meal: Meal): string {
  if (meal.kind === MEAL_KIND_OUT) {
    return meal.place ? t('meals.outAt', { place: meal.place }) : t('meals.out')
  }
  const share = boughtShare(mealStore.ingredientsOf(meal.id))
  const open = share.total - share.bought
  const cook = nameOf(meal.cook_user_id)
  return [
    cook ? t('meals.cooks', { name: cook }) : null,
    open > 0 ? t('meals.todayOpen', { n: open }) : t('meals.todayAllThere'),
  ]
    .filter((part) => !!part)
    .join(' · ')
}

function percent(meal: Meal): number | null {
  if (meal.kind === MEAL_KIND_OUT) return null
  const share = boughtShare(mealStore.ingredientsOf(meal.id))
  return share.total > 0 ? (share.bought / share.total) * 100 : null
}
</script>

<template>
  <!-- FR-7.10: a block of the hero once the packing is finished. -->
  <DashboardBlock
    v-if="visible && embedded"
    :title="t('meals.todayBlock')"
    :count="meals.length"
    :fold-key="MEALS_FOLD_KEY"
    :more-route="mealsPath"
    :more-label="t('meals.todayMore')"
    :empty="null"
    :testid="`dashboard-meals-${tripName}`"
  >
    <li v-for="meal in meals" :key="meal.id" class="row">
      <button
        type="button"
        class="meal"
        :data-testid="`dashboard-meal-${meal.id}`"
        @click="sheet.openMeal(tripId, meal.id)"
      >
        <span class="slot jp-eyebrow">{{ t(`meals.slotShort.${meal.slot}`) }}</span>
        <span class="body">
          <span class="title">{{ meal.title }}</span>
          <span class="facts">{{ facts(meal) }}</span>
        </span>
        <ProgressRing v-if="percent(meal) !== null" :percent="percent(meal)!" :size="24" />
      </button>
    </li>
  </DashboardBlock>
  <section
    v-else-if="visible"
    class="jp-card meals-card"
    :data-testid="`dashboard-meals-${tripName}`"
  >
    <RouterLink :to="mealsPath" class="head" :data-testid="`dashboard-meals-${tripName}-head`">
      <h3 class="heading">{{ t('meals.todayBlock') }}</h3>
      <span class="more">{{ t('meals.todayMore') }} ›</span>
    </RouterLink>
    <ul class="rows">
      <li v-for="meal in meals" :key="meal.id" class="row">
        <button
          type="button"
          class="meal"
          :data-testid="`dashboard-meal-${meal.id}`"
          @click="sheet.openMeal(tripId, meal.id)"
        >
          <span class="slot jp-eyebrow">{{ t(`meals.slotShort.${meal.slot}`) }}</span>
          <span class="body">
            <span class="title">{{ meal.title }}</span>
            <span class="facts">{{ facts(meal) }}</span>
          </span>
          <ProgressRing v-if="percent(meal) !== null" :percent="percent(meal)!" :size="24" />
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.meals-card {
  display: grid;
  gap: 4px;
  margin-top: 12px;
  padding: 12px 8px 10px;
}

.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 0 8px;
  color: var(--ct-text);
  text-decoration: none;
}

.heading {
  margin: 0;
  font-size: var(--jp-text-lg);
  font-weight: var(--jp-weight-semibold);
}

.more {
  color: var(--jp-action);
  font-size: var(--jp-text-sm);
}

.rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  list-style: none;
}

.meal {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px;
  border: 0;
  border-top: 1px solid var(--ct-surface0);
  background: transparent;
  color: var(--ct-text);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.slot {
  /* M31's label column: the widest one-word slot name, *Morgen*, whole (G-13). */
  flex: 0 0 60px;
  color: var(--ct-subtext0);
  overflow-wrap: normal;
}

.body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.title {
  font-weight: var(--jp-weight-semibold);
}

.facts {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.head:focus-visible,
.meal:focus-visible {
  outline: 2px solid var(--jp-action);
  outline-offset: 2px;
}
</style>
