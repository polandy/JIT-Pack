<script setup lang="ts">
/**
 * The meal sheet's body (M31): one meal of the plan — its dish, cooked or
 * eaten out, its slot and day, time and note, who cooks, whether it goes on
 * the day's excursion, and its ingredients — or a new one on a day and slot.
 *
 * Everything but a tick is written by the button, in one go (FR-33.1/33.2);
 * ticking a saved ingredient is a purchase, written at once as on M6
 * (FR-33.3). Mounted per request by `MealSheet.vue`, so the trip it reads is
 * fixed for its life.
 */
import { IonButton, IonIcon, IonInput, IonLabel, IonSegment, IonSegmentButton } from '@ionic/vue'
import { addOutline, bulbOutline, closeOutline, trashOutline } from 'ionicons/icons'
import { computed, inject, nextTick, onMounted, reactive, ref, watch } from 'vue'

import ChoiceChip from '@/components/global/ChoiceChip.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import TimeField from '@/components/global/TimeField.vue'
import UserAvatar from '@/components/global/UserAvatar.vue'
import { useOrchestrator } from '@/composables/useOrchestrator'
import { useTripIdentity } from '@/composables/useTripIdentity'
import { t } from '@/i18n'
import { confirmDestructive } from '@/lib/confirm'
import { MEAL_CONTEXT } from '@/lib/mealContext'
import { shortDueDay } from '@/lib/taskDueText'
import { presentToast, TOAST_DURATION_MS } from '@/lib/toast'
import type { MealKind, MealSlot } from '@/types/domain'
import {
  ITEM_MODE_BUY_BEFORE,
  ITEM_MODE_BUY_LOCAL,
  MEAL_KIND_COOK,
  MEAL_KIND_OUT,
  MEAL_SLOTS,
} from '@/types/domain'
import { createMealActions, type DraftIngredient } from './actions'
import {
  SLOT_PLACE,
  canTakeAlong,
  earlierDishes,
  excursionFor,
  matchingDishes,
  parseIngredient,
  planDays,
  type EarlierDish,
} from './domain/mealPlan'
import {
  freshByName,
  ingredientSuggestions,
  learnedFreshness,
  type IngredientSuggestion,
} from './domain/ingredients'
import type { MealSheetRequest } from './sheet'
import { ingredientsOfMeal } from './sources'
import { FRESH_NOTE_TOAST_MS, freshNote } from './moveNote'
import { useMealStore } from './store'

const props = defineProps<{
  request: MealSheetRequest
  /** Whether the sheet stands laid out on screen — before it, nothing can be scrolled into view. */
  presented: boolean
}>()
const emit = defineEmits<{ close: [] }>()

const orchestrator = useOrchestrator()
const mealStore = useMealStore()
const actions = createMealActions(orchestrator.moduleHost, mealStore)
const context = inject(MEAL_CONTEXT, null)
const tripId = props.request.tripId
const { assignees, nameOf, load: loadIdentity } = useTripIdentity(tripId, orchestrator)
onMounted(() => void loadIdentity())

/**
 * The day chips scrolled to the chosen one, which on a long trip stands
 * off-screen — once the sheet is laid out, whenever that was.
 */
const dayChips = ref<HTMLElement | null>(null)
watch(
  () => props.presented,
  (presented) => {
    if (!presented) return
    void nextTick(() =>
      dayChips.value
        ?.querySelector('[aria-pressed="true"]')
        ?.scrollIntoView({ block: 'nearest', inline: 'center' }),
    )
  },
  { immediate: true },
)

const meal = props.request.mealId ? (mealStore.getMeal(props.request.mealId) ?? null) : null
const trip = computed(() => context?.trips().find((candidate) => candidate.id === tripId) ?? null)
const days = computed(() => planDays(trip.value?.start_date ?? null, trip.value?.end_date ?? null))
const today = orchestrator.today()

/** One ingredient in the sheet: the draft, and who bought it where it is saved and bought. */
interface SheetIngredient extends DraftIngredient {
  key: string
  boughtBy: string | null
}

let nextKey = 0
const draft = reactive({
  title: meal?.title ?? '',
  kind: (meal?.kind ?? MEAL_KIND_COOK) as MealKind,
  slot: (meal?.slot ?? (props.request.mealId === null ? props.request.slot : 'dinner')) as MealSlot,
  day: meal?.on_date ?? (props.request.mealId === null ? props.request.day : today),
  time: meal?.at_time ?? '',
  note: meal?.note ?? '',
  place: meal?.place ?? '',
  cookUserId: meal?.cook_user_id ?? null,
  takeAlong: meal?.excursion_id !== null && meal?.excursion_id !== undefined,
  ingredients: (meal ? ingredientsOfMeal(mealStore, meal.id) : []).map(
    (ingredient): SheetIngredient => ({
      key: ingredient.id,
      id: ingredient.id,
      name: ingredient.name,
      amount: ingredient.amount,
      list: ingredient.list,
      bought: ingredient.bought,
      boughtBy: ingredient.bought_by_user_id,
      fresh: ingredient.fresh,
    }),
  ),
})
const newIngredient = ref('')
/** FR-33.4: the trip an earlier dish was taken from, marked beside *Zutaten*. */
const takenFrom = ref<string | null>(null)

const isNew = meal === null
const cooked = computed(() => draft.kind === MEAL_KIND_COOK)
const heading = computed(() =>
  isNew
    ? t('meals.sheetNew', { slot: t(`meals.slot.${draft.slot}`) })
    : t(`meals.slot.${draft.slot}`),
)
/** FR-33.15: the day a saved meal is being moved away from, while another is chosen. */
const movedFrom = computed(() => (meal && meal.on_date !== draft.day ? meal.on_date : null))

const subline = computed(() => {
  const words = {
    day: shortDueDay(draft.day),
    n: days.value.indexOf(draft.day) + 1,
    total: days.value.length,
  }
  return movedFrom.value
    ? t('meals.sheetSubMoved', { ...words, from: shortDueDay(movedFrom.value) })
    : t('meals.sheetSub', words)
})

// --- FR-33.4: dishes of earlier trips ---

const dishes = computed(() =>
  isNew && context
    ? earlierDishes({
        meals: mealStore.allMeals(),
        ingredients: mealStore.allIngredients(),
        trips: context.trips(),
        tripId,
      })
    : [],
)
const offered = computed(() =>
  cooked.value && takenFrom.value === null ? matchingDishes(dishes.value, draft.title) : [],
)

function takeDish(dish: EarlierDish) {
  draft.title = dish.title
  draft.ingredients = dish.ingredients.map((ingredient) => ({
    key: `new-${nextKey++}`,
    id: null,
    name: ingredient.name,
    amount: ingredient.amount,
    list: ITEM_MODE_BUY_LOCAL,
    bought: false,
    boughtBy: null,
    fresh: null,
  }))
  takenFrom.value = dish.tripName
}

/** M31's empty plan hands a dish over by its title; it is taken as its chip would take it. */
const preset = props.request.mealId === null ? props.request.dish : undefined
const presetDish = preset ? dishes.value.find((candidate) => candidate.title === preset) : undefined
if (presetDish) takeDish(presetDish)

/** M31: the days that already hold a meal wear a dot on their chip, so a free one is found. */
const plannedDays = computed(
  () =>
    new Set(
      mealStore
        .getMeals(tripId)
        .filter((candidate) => candidate.id !== meal?.id)
        .map((candidate) => candidate.on_date),
    ),
)

// --- FR-33.6: the picnic ---

const excursions = computed(() => context?.excursions(tripId) ?? [])
const excursion = computed(() => excursionFor(draft.day, excursions.value))
const offersExcursion = computed(() =>
  canTakeAlong({ kind: draft.kind, slot: draft.slot, on_date: draft.day }, excursions.value),
)

// --- FR-33.8: who cooks ---

const offersCook = computed(() => cooked.value && assignees.value.length > 1)

// --- ingredients ---

/** FR-33.3: before the trip's first day an ingredient may be bought at home. */
const beforeTrip = computed(() => !!trip.value?.start_date && today < trip.value.start_date)
const boughtCount = computed(() => draft.ingredients.filter((i) => i.bought).length)
/** An ingredient on *Vor Ort* is due on its meal's day (FR-33.3). */
const dueText = computed(() => shortDueDay(draft.day))

function addIngredient() {
  const parsed = parseIngredient(newIngredient.value)
  if (!parsed) return
  pushIngredient(parsed.name, parsed.amount)
}

function pushIngredient(name: string, amount: string | null) {
  draft.ingredients.push({
    key: `new-${nextKey++}`,
    id: null,
    name,
    amount,
    list: ITEM_MODE_BUY_LOCAL,
    bought: false,
    boughtBy: null,
    fresh: null,
  })
  newIngredient.value = ''
}

// --- FR-33.12/33.13: ingredients remembered across trips, fresh or durable ---

/** The last freshness set for each name on the device. */
const learned = computed(() => learnedFreshness(mealStore.allMeals(), mealStore.allIngredients()))

const suggestions = computed(() =>
  cooked.value
    ? ingredientSuggestions({
        meals: mealStore.allMeals(),
        ingredients: mealStore.allIngredients(),
        trips: context?.trips() ?? [],
        typed: newIngredient.value,
        taken: draft.ingredients.map((ingredient) => ingredient.name),
      })
    : [],
)

/** A remembered ingredient, with its last amount — an amount typed in front wins. */
function takeSuggestion(suggestion: IngredientSuggestion) {
  pushIngredient(suggestion.name, typedAmount.value ?? suggestion.amount)
}

/** The amount a suggestion would bring: one typed in front, else the one used last. */
const typedAmount = computed(() => parseIngredient(newIngredient.value)?.amount ?? null)

/** How often a remembered ingredient was used, and on which trip last. */
function suggestionSource(suggestion: IngredientSuggestion): string {
  return suggestion.tripName
    ? t('meals.suggestionSourceTrip', { n: suggestion.uses, trip: suggestion.tripName })
    : t('meals.suggestionSource', { n: suggestion.uses })
}

function freshOf(ingredient: SheetIngredient): boolean {
  return freshByName(ingredient.name, learned.value, ingredient.fresh)
}

function toggleFresh(ingredient: SheetIngredient) {
  ingredient.fresh = !freshOf(ingredient)
}

/** A saved ingredient's tick is a purchase, written at once; a new one's is the draft's. */
function tick(ingredient: SheetIngredient) {
  ingredient.bought = !ingredient.bought
  const saved = ingredient.id
    ? mealStore.ingredientsOf(meal?.id ?? '').find((i) => i.id === ingredient.id)
    : undefined
  if (saved) actions.setBought([saved], ingredient.bought)
}

function toggleList(ingredient: SheetIngredient) {
  ingredient.list =
    ingredient.list === ITEM_MODE_BUY_BEFORE ? ITEM_MODE_BUY_LOCAL : ITEM_MODE_BUY_BEFORE
}

function removeIngredient(ingredient: SheetIngredient) {
  draft.ingredients = draft.ingredients.filter((candidate) => candidate !== ingredient)
}

// --- writing ---

const canSave = computed(
  () => draft.title.trim() !== '' || (draft.kind === MEAL_KIND_OUT && draft.place.trim() !== ''),
)

function save() {
  if (!canSave.value) return
  const from = meal?.on_date ?? null
  const id = actions.saveMeal(
    tripId,
    meal,
    {
      day: draft.day,
      slot: draft.slot,
      title: draft.title,
      kind: draft.kind,
      time: draft.time.trim() === '' ? null : draft.time.trim(),
      note: draft.note,
      place: draft.place,
      cookUserId: draft.cookUserId,
      excursionId: draft.takeAlong && offersExcursion.value ? (excursion.value?.id ?? null) : null,
    },
    draft.ingredients,
  )
  if (id === null) return
  const saved = mealStore.getMeal(id)
  const open = cooked.value ? draft.ingredients.filter((i) => !i.bought).length : 0
  const words = { title: saved?.title ?? draft.title, day: shortDueDay(draft.day), n: open }
  const fresh =
    from === null ? null : freshNote(from, draft.day, mealStore.ingredientsOf(id), learned.value)
  const said = open > 0 ? t('meals.savedWith', words) : t('meals.saved', words)
  void presentToast({
    message: fresh ? `${said} · ${fresh}` : said,
    duration: fresh ? FRESH_NOTE_TOAST_MS : TOAST_DURATION_MS,
  })
  emit('close')
}

async function remove() {
  if (!meal) return
  const open = draft.ingredients.filter((ingredient) => ingredient.id && !ingredient.bought).length
  const confirmed = await confirmDestructive({
    header: t('meals.removeTitle', { title: meal.title }),
    message: [open > 0 ? t('meals.removeOpen', { n: open }) : null, t('meals.removeEveryone')]
      .filter((part) => !!part)
      .join(' '),
    confirmLabel: t('meals.removeConfirm'),
    testid: 'meal-remove-confirm',
  })
  if (!confirmed) return
  actions.removeMeal(meal)
  void presentToast({ message: t('meals.removed', { title: meal.title }) })
  emit('close')
}

/** M31: a shortlisted idea fills *Wo*, and an empty dish with it. */
function takePlace(title: string) {
  draft.place = title
  if (draft.title.trim() === '') draft.title = title
}
</script>

<template>
  <section class="sheet" data-testid="meal-sheet">
    <SheetHead
      :title="heading"
      :meta="subline"
      title-testid="meal-sheet-title"
      close-testid="meal-sheet-close"
      @close="emit('close')"
    />

    <IonInput
      v-model="draft.title"
      class="title-field"
      label-placement="stacked"
      :label="t('meals.dish')"
      :placeholder="t('meals.dishPlaceholder')"
      :autofocus="isNew"
      data-testid="meal-title"
      @keydown.enter.prevent="save"
    />

    <div v-if="offered.length > 0" class="earlier" data-testid="meal-earlier">
      <span class="jp-eyebrow">{{
        draft.title.trim() ? t('meals.earlierMatching') : t('meals.earlier')
      }}</span>
      <div class="chips">
        <button
          v-for="(dish, n) in offered"
          :key="dish.title"
          type="button"
          class="dish"
          :data-testid="`meal-earlier-${n}`"
          @click="takeDish(dish)"
        >
          <b>{{ dish.title }}</b>
          <small>{{
            t('meals.earlierSource', { n: dish.ingredients.length, trip: dish.tripName })
          }}</small>
        </button>
      </div>
    </div>

    <IonSegment
      :value="draft.kind"
      class="kind"
      data-testid="meal-kind"
      @ionChange="draft.kind = ($event.detail.value as MealKind) ?? MEAL_KIND_COOK"
    >
      <IonSegmentButton :value="MEAL_KIND_COOK" data-testid="meal-kind-cook">
        <IonLabel>{{ t('meals.kindCook') }}</IonLabel>
      </IonSegmentButton>
      <IonSegmentButton :value="MEAL_KIND_OUT" data-testid="meal-kind-out">
        <IonLabel>{{ t('meals.kindOut') }}</IonLabel>
      </IonSegmentButton>
    </IonSegment>

    <span class="jp-eyebrow label">{{ t('meals.slotLabel') }}</span>
    <div class="chips">
      <ChoiceChip
        v-for="slot in MEAL_SLOTS"
        :key="slot"
        :pressed="draft.slot === slot"
        :data-testid="`meal-slot-${slot}`"
        @click="draft.slot = slot"
      >
        {{ t(`meals.slot.${slot}`) }}
      </ChoiceChip>
    </div>

    <span class="jp-eyebrow label"
      >{{ t('meals.dayLabel') }}
      <span v-if="plannedDays.size > 0" class="planned-hint"
        >· {{ t('meals.dayPlanned') }}</span
      ></span
    >
    <div ref="dayChips" class="chips">
      <ChoiceChip
        v-for="day in days"
        :key="day"
        :pressed="draft.day === day"
        :data-testid="`meal-day-${day}`"
        :data-planned="plannedDays.has(day) ? 'true' : undefined"
        :data-moved-from="movedFrom === day ? 'true' : undefined"
        :class="{ planned: plannedDays.has(day), 'moved-from': movedFrom === day }"
        @click="draft.day = day"
      >
        {{ shortDueDay(day) }}
      </ChoiceChip>
    </div>

    <div class="pair">
      <TimeField
        v-model="draft.time"
        label-placement="stacked"
        :placeholder="SLOT_PLACE[draft.slot]"
        data-testid="meal-time"
      >
        <template #label>{{ t('meals.time') }}</template>
      </TimeField>
      <IonInput
        v-model="draft.note"
        :label="t('meals.note')"
        label-placement="stacked"
        :placeholder="t('meals.optional')"
        data-testid="meal-note"
      />
    </div>

    <template v-if="offersCook">
      <span class="jp-eyebrow label">{{ t('meals.cook') }}</span>
      <div class="chips">
        <ChoiceChip
          v-for="person in assignees"
          :key="person.user_id"
          :pressed="draft.cookUserId === person.user_id"
          :data-testid="`meal-cook-${person.user_id}`"
          @click="draft.cookUserId = person.user_id"
        >
          <UserAvatar :name="nameOf(person.user_id) ?? ''" :seed="person.user_id" :size="18" />
          {{ nameOf(person.user_id) }}
        </ChoiceChip>
        <ChoiceChip
          :pressed="draft.cookUserId === null"
          data-testid="meal-cook-none"
          @click="draft.cookUserId = null"
        >
          {{ t('meals.nobody') }}
        </ChoiceChip>
      </div>
    </template>

    <button
      v-if="offersExcursion && excursion"
      type="button"
      role="switch"
      class="excursion"
      :aria-checked="draft.takeAlong ? 'true' : 'false'"
      data-testid="meal-excursion"
      @click="draft.takeAlong = !draft.takeAlong"
    >
      <span class="text">
        <b>{{ t('meals.excursion', { name: excursion.name }) }}</b>
        <small>{{ t('meals.excursionHint') }}</small>
      </span>
      <span class="switch" aria-hidden="true" />
    </button>

    <template v-if="cooked">
      <div class="label ingredients-head">
        <span class="jp-eyebrow">{{ t('meals.ingredients') }}</span>
        <span v-if="takenFrom" class="from" data-testid="meal-earlier-from">{{
          t('meals.fromTrip', { trip: takenFrom })
        }}</span>
        <span v-if="draft.ingredients.length > 0" class="count jp-num">{{
          t('meals.boughtCount', { bought: boughtCount, total: draft.ingredients.length })
        }}</span>
      </div>
      <ul class="ingredients" data-testid="meal-ingredients">
        <li
          v-for="ingredient in draft.ingredients"
          :key="ingredient.key"
          class="ingredient"
          :class="{ bought: ingredient.bought }"
          :data-testid="`meal-ingredient-${ingredient.name}`"
        >
          <button
            type="button"
            class="tick"
            :aria-pressed="ingredient.bought ? 'true' : 'false'"
            :aria-label="t('meals.tickIngredient', { name: ingredient.name })"
            :data-testid="`meal-ingredient-tick-${ingredient.name}`"
            @click="tick(ingredient)"
          >
            <span aria-hidden="true">{{ ingredient.bought ? '✓' : '' }}</span>
          </button>
          <span class="name">
            <span class="word">{{ ingredient.name }}</span>
            <small v-if="ingredient.bought && nameOf(ingredient.boughtBy)">{{
              t('meals.boughtBy', { name: nameOf(ingredient.boughtBy) ?? '' })
            }}</small>
            <!-- The chips under the name: the name and its amount keep the row's width. -->
            <span class="chips-line">
              <!-- FR-33.13: fresh is bought for its day, durable once for the trip. -->
              <button
                type="button"
                class="fresh"
                :class="{ on: freshOf(ingredient) }"
                :aria-pressed="freshOf(ingredient) ? 'true' : 'false'"
                :data-testid="`meal-ingredient-fresh-${ingredient.name}`"
                @click="toggleFresh(ingredient)"
              >
                {{ freshOf(ingredient) ? t('meals.fresh') : t('meals.durable') }}
              </button>
              <button
                type="button"
                class="list"
                :class="{ before: ingredient.list === ITEM_MODE_BUY_BEFORE }"
                :disabled="!beforeTrip || ingredient.bought"
                :data-testid="`meal-ingredient-list-${ingredient.name}`"
                @click="toggleList(ingredient)"
              >
                {{ t(`meals.list.${ingredient.list}`) }}
              </button>
            </span>
          </span>
          <span v-if="ingredient.amount" class="amount jp-num">{{ ingredient.amount }}</span>
          <button
            type="button"
            class="remove"
            :aria-label="t('meals.removeIngredient', { name: ingredient.name })"
            :data-testid="`meal-ingredient-remove-${ingredient.name}`"
            @click="removeIngredient(ingredient)"
          >
            <IonIcon :icon="closeOutline" aria-hidden="true" />
          </button>
        </li>
        <li class="add">
          <IonInput
            v-model="newIngredient"
            :aria-label="t('meals.addIngredient')"
            :placeholder="t('meals.ingredientPlaceholder')"
            data-testid="meal-ingredient-add"
            @keydown.enter.prevent="addIngredient"
          />
          <!-- FR-33.2: the amount the field reads off what is typed — a unit
               it does not know stays out of it, before the ＋ is tapped. -->
          <span
            v-if="typedAmount"
            class="amount preview jp-num"
            data-testid="meal-ingredient-preview"
            >{{ typedAmount }}</span
          >
          <button
            type="button"
            class="plus"
            :aria-label="t('meals.addIngredient')"
            data-testid="meal-ingredient-add-button"
            @click="addIngredient"
          >
            <IonIcon :icon="addOutline" aria-hidden="true" />
          </button>
        </li>
      </ul>
      <!-- FR-33.12: what earlier meals used, from the first letter typed. -->
      <ul
        v-if="suggestions.length > 0"
        class="suggestions"
        data-testid="meal-ingredient-suggestions"
      >
        <li v-for="suggestion in suggestions" :key="suggestion.name">
          <button
            type="button"
            class="suggestion"
            :data-testid="`meal-ingredient-suggestion-${suggestion.name}`"
            @click="takeSuggestion(suggestion)"
          >
            <span class="what">
              <b>{{ suggestion.name }}</b>
              <span v-if="suggestion.fresh" role="img" :aria-label="t('meals.fresh')"> 🌿</span>
              <small>{{ suggestionSource(suggestion) }}</small>
            </span>
            <span v-if="typedAmount ?? suggestion.amount" class="amount jp-num">{{
              typedAmount ?? suggestion.amount
            }}</span>
          </button>
        </li>
      </ul>
      <p class="hint">
        {{ t('meals.listHint', { day: dueText }) }}
        <template v-if="beforeTrip">{{ t('meals.listHintBefore') }}</template>
      </p>
    </template>
    <template v-else>
      <IonInput
        v-model="draft.place"
        :label="t('meals.place')"
        label-placement="stacked"
        :placeholder="t('meals.placePlaceholder')"
        data-testid="meal-place"
      />
      <template v-if="(context?.shortlist(tripId) ?? []).length > 0">
        <span class="jp-eyebrow label">{{ t('meals.shortlist') }}</span>
        <div class="chips">
          <ChoiceChip
            v-for="idea in context?.shortlist(tripId) ?? []"
            :key="idea.id"
            :pressed="draft.place === idea.title"
            :data-testid="`meal-place-idea-${idea.id}`"
            @click="takePlace(idea.title)"
          >
            <IonIcon :icon="bulbOutline" aria-hidden="true" />
            {{ idea.title }}
          </ChoiceChip>
        </div>
      </template>
    </template>

    <div class="actions">
      <IonButton
        expand="block"
        shape="round"
        :disabled="!canSave"
        data-testid="meal-save"
        @click="save"
      >
        {{ isNew ? t('meals.addMeal') : t('meals.save') }}
      </IonButton>
      <IonButton
        v-if="!isNew"
        fill="clear"
        color="danger"
        size="small"
        data-testid="meal-remove"
        @click="remove"
      >
        <IonIcon slot="start" :icon="trashOutline" aria-hidden="true" />
        {{ t('meals.remove') }}
      </IonButton>
    </div>
  </section>
</template>

<style scoped>
.sheet {
  display: flex;
  flex-direction: column;
  padding: 4px 16px 18px;
}

.sheet ion-input {
  --background: var(--jp-surface-sunken);
  --padding-start: 12px;
  --padding-end: 12px;
  margin-top: 10px;
  border-radius: var(--jp-r-md);
}

.title-field {
  font-weight: var(--jp-weight-semibold);
}

.label {
  display: block;
  margin: 14px 0 6px;
  color: var(--ct-subtext0);
}

.chips {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
}

.chips > * {
  flex: none;
}

.planned-hint {
  text-transform: none;
}

.chips .planned {
  position: relative;
}

.chips .moved-from {
  border-style: dashed;
}

.chips .planned::after {
  position: absolute;
  top: 3px;
  right: 6px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--jp-action);
  content: '';
}

.chips ion-icon {
  font-size: var(--jp-icon-xs);
}

.earlier {
  margin-top: 10px;
}

.earlier .jp-eyebrow {
  display: block;
  margin-bottom: 6px;
  color: var(--ct-subtext0);
}

.dish {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 6px 12px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-md);
  background: transparent;
  color: var(--ct-text);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.dish small {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.kind {
  margin-top: 14px;
}

.pair {
  display: grid;
  grid-template-columns: 120px 1fr;
  column-gap: 8px;
}

.excursion {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
  padding: 10px 12px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-md);
  background: transparent;
  color: var(--ct-text);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.excursion[aria-checked='true'] {
  border-color: var(--jp-done);
}

.excursion .text {
  display: flex;
  flex: 1;
  flex-direction: column;
}

.excursion small {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.switch {
  position: relative;
  flex: none;
  width: 40px;
  height: 24px;
  border-radius: var(--jp-r-pill);
  background: var(--ct-surface1);
}

.switch::after {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--ct-base);
  content: '';
  transition: left 0.15s;
}

.excursion[aria-checked='true'] .switch {
  background: var(--jp-done);
}

.excursion[aria-checked='true'] .switch::after {
  left: 19px;
}

.ingredients-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.ingredients-head .from {
  color: var(--jp-done);
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-semibold);
}

.ingredients-head .count {
  margin-left: auto;
  font-size: var(--jp-text-xs);
}

.ingredients {
  margin: 0;
  padding: 0;
  border: 1px solid var(--ct-surface0);
  border-radius: var(--jp-r-md);
  list-style: none;
  overflow: hidden;
}

.ingredient {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--ct-surface0);
}

.tick {
  display: grid;
  flex: none;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 2px solid var(--ct-surface1);
  border-radius: 50%;
  background: transparent;
  color: var(--ct-base);
  font: inherit;
  font-size: var(--jp-text-xs);
  cursor: pointer;
}

.tick[aria-pressed='true'] {
  border-color: var(--jp-done);
  background: var(--jp-done);
}

.name {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.bought .word {
  color: var(--ct-subtext0);
  text-decoration: line-through;
}

.chips-line {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.name small {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.amount {
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
  white-space: nowrap;
}

.list,
.fresh {
  padding: 1px 8px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-pill);
  background: transparent;
  color: var(--ct-subtext1);
  font: inherit;
  font-size: var(--jp-text-xs);
  white-space: nowrap;
  cursor: pointer;
}

.fresh.on {
  border-color: var(--jp-done);
  color: var(--jp-done);
}

.list.before {
  border-color: var(--ct-glacier);
  color: var(--ct-glacier);
}

.list:disabled {
  cursor: default;
}

/* FR-33.12: the remembered ingredients, a card of rows under the field. */
.suggestions {
  margin: 4px 0 0;
  padding: 0;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-md);
  list-style: none;
  overflow: hidden;
}

.suggestions li + li {
  border-top: 1px solid var(--ct-surface0);
}

.suggestion {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 8px 12px;
  border: 0;
  background: transparent;
  color: var(--ct-text);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.suggestion .what small {
  display: block;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.remove,
.plus {
  display: grid;
  flex: none;
  place-items: center;
  border: 0;
  background: transparent;
  color: var(--ct-overlay1);
  font: inherit;
  cursor: pointer;
}

.add {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px 6px 0;
}

.add ion-input {
  margin-top: 6px;
}

/* The amount read off the field, as a chip the ＋ will turn into the row's amount. */
.preview {
  flex: none;
  margin-top: 6px;
  padding: 1px 8px;
  border: 1px solid var(--jp-action);
  border-radius: var(--jp-r-pill);
  color: var(--jp-action);
}

.plus {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--ct-surface0);
  color: var(--ct-text);
}

.hint {
  margin: 6px 2px 0;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 16px;
}

.actions ion-button[expand='block'] {
  width: 100%;
}
</style>
