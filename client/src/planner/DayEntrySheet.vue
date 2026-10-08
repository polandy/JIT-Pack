<script setup lang="ts">
/**
 * The day plan's sheet for an entry of its own (FR-29.15): one form — what,
 * time, note, whom it is for — and the connection the entry may carry (FR-29.18), added,
 * changed or taken off at any time; a new one has the shortlisted ideas
 * without a day above it, any of which is planned there instead. Nothing is
 * written before its button.
 *
 * The connection is found in a step of its own inside the same sheet: the
 * timetable search first (ADR-086), then a shared link or the hand fields.
 * A taken connection fills what the entry leaves empty — its title, its time
 * — and marks it as filled until it is typed into.
 *
 * On an excursion's way (M27) the sheet is the connection alone: it opens at
 * the step, and the slot names and times what is written. Such a way goes
 * with the excursion's people, so it asks no one whom it is for.
 */
import { IonButton, IonIcon, IonInput, IonSpinner } from '@ionic/vue'
import {
  bulbOutline,
  chevronBack,
  clipboardOutline,
  createOutline,
  trainOutline,
  trashOutline,
} from 'ionicons/icons'
import { computed, nextTick, onUnmounted, reactive, ref, watch } from 'vue'

import ChoiceChip from '@/components/global/ChoiceChip.vue'
import WhoChips from '@/components/global/WhoChips.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import TimeField from '@/components/global/TimeField.vue'
import { t } from '@/i18n'
import { canReadClipboard, readClipboardText } from '@/lib/clipboard'
import { useTimetableOffered } from '@/composables/shared/timetable'
import { shortDueDay } from '@/lib/taskDueText'
import { useTransitionSettled } from '@/composables/shared/transitionSettled'
import type { ConnectionLeg, DayEntry, Idea, Traveler } from '@/types/domain'
import type { ConnectionFields, DayEntryFields } from './actions'
import ConnectionCard from './ConnectionCard.vue'
import ConnectionSearch from './ConnectionSearch.vue'
import {
  connectionDay,
  connectionDestination,
  connectionTitle,
  handFieldsOf,
  handLeg,
  readConnectionLink,
  timeOf,
  type HandFields,
  type PageLinks,
} from './domain/connections'
import { isPlanTime } from './domain/dayPlan'
import { parseLink } from './domain/ideas'
import { changeSeed, type SearchSeed } from './domain/timetable'

const props = defineProps<{
  open: boolean
  /** The entry being changed, or null for a new one. */
  entry: DayEntry | null
  /** The chosen day, `YYYY-MM-DD`: a new entry's, and a connection's by hand. */
  day: string | null
  /** The chosen day in words, for the head of a new one. */
  dayText: string
  /** The shortlisted ideas without a day, offered above a new entry. */
  pool: readonly Idea[]
  /** The trip's travellers, whom an entry may be for (FR-29.15). */
  travelers?: readonly Traveler[]
  /** Whom the entry is for now — null for everybody (FR-29.15). */
  travelerIds?: readonly string[] | null
  /** A page's links, read by the server — null where there is none to ask (Local Mode, previews off). */
  pageLinks: PageLinks | null
  /** The excursion a new or changed connection belongs to (FR-29.18), or null for none. */
  excursionTitle?: string | null
  /** The connection alone, as an excursion's way asks for it: no title, no time. */
  connectionOnly?: boolean
  /** The head's words where the caller names what is written — *Hinfahrt*. */
  heading?: string | null
  /** The save button's words where the caller names them — *Als Hinfahrt speichern*. */
  saveText?: string | null
  /** Where a new connection's timetable search starts (FR-29.18); the morning of the day where none is given. */
  searchSeed?: SearchSeed | null
  /** The place whose nearest stop a new way there arrives at: the route's start. */
  searchNear?: { lat: number; lon: number } | null
}>()

const emit = defineEmits<{
  close: []
  save: [fields: DayEntryFields]
  remove: []
  plan: [idea: Idea]
}>()

const STEP_FORM = 'form'
const STEP_FIND = 'find'
const STEP_LINK = 'link'
const STEP_HAND = 'hand'
type Step = typeof STEP_FORM | typeof STEP_FIND | typeof STEP_LINK | typeof STEP_HAND

const step = ref<Step>(STEP_FORM)
/** The search has been shown since the sheet opened, and keeps what was typed into it. */
const findShown = ref(false)
watch(step, (value) => {
  if (value === STEP_FIND) findShown.value = true
})

/**
 * The sheet never shrinks while it is open. A touch on a button is followed
 * by the click the browser makes of it; were a shorter step to pull the sheet
 * down under the finger first, that click would land on the backdrop and
 * dismiss the sheet.
 */
const sheetBox = ref<HTMLElement | null>(null)
const keptHeight = ref(0)
watch(
  step,
  () => {
    keptHeight.value = Math.max(keptHeight.value, sheetBox.value?.offsetHeight ?? 0)
  },
  { flush: 'pre' },
)

/**
 * The connection opening into the form or closing out of it moves what
 * stands below it; the sheet says when it stands (`data-settled`). Whatever
 * was still moving goes with the step or the sheet that held it.
 */
const {
  settled: connectionSettled,
  hooks: connectionMotion,
  reset: connectionStands,
} = useTransitionSettled()
watch(step, connectionStands)

const title = ref('')
const note = ref('')
const time = ref('')
const connection = ref<ConnectionFields | null>(null)
/** FR-29.15: whom it is for — null for everybody. */
const who = ref<string[] | null>(null)
/**
 * FR-29.15: asked where there is more than one traveller to choose from, and
 * never for an excursion's way, which goes with the excursion's people.
 */
const asksWho = computed(
  () =>
    !props.connectionOnly &&
    !props.excursionTitle &&
    !props.entry?.excursion_id &&
    (props.travelers?.length ?? 0) > 1,
)
/** Which of the entry's fields the connection filled, and still holds. */
const filled = reactive({ title: false, time: false })

/** The day a connection searched or entered by hand stands on: the entry's own, or the chosen one. */
const handDay = computed(() => props.entry?.on_date ?? props.day)
const timetableOffered = useTimetableOffered()
const searchable = computed(() => timetableOffered.value && handDay.value !== null)
const DEFAULT_SEED: SearchSeed = { from: '', to: '', time: '08:00', earliest: null }

// --- the connection ---

function filledTitle(legs: readonly ConnectionLeg[]): string {
  return t('dayPlan.toStop', { stop: connectionDestination(legs) })
}

/**
 * A connection taken from any of the three ways, back on the entry's form.
 * The form is back first and the connection joins it after, so it is seen
 * to open into the entry rather than to have been there.
 */
async function take(legs: ConnectionLeg[], link: string | null) {
  step.value = STEP_FORM
  await nextTick()
  connection.value = { legs, link }
  if (!props.connectionOnly) {
    if (title.value.trim() === '' || filled.title) {
      title.value = filledTitle(legs)
      filled.title = true
    }
    if (time.value === '' || filled.time) {
      time.value = timeOf(legs[0]!.dep)
      filled.time = true
    }
  }
  await nextTick()
  actions.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

/** *Entfernen*: the entry stays, with what the connection filled emptied again. */
function removeConnection() {
  connection.value = null
  if (filled.title) title.value = ''
  if (filled.time) time.value = ''
  filled.title = false
  filled.time = false
}

/** The connection *Ändern* was tapped on, whose stops and departure the search starts from. */
const changing = ref<readonly ConnectionLeg[] | null>(null)
const seed = computed(() => {
  const slot = props.searchSeed ?? DEFAULT_SEED
  return changing.value ? changeSeed(changing.value, slot.earliest) : slot
})

/** *Zugverbindung hinzufügen* / *Ändern*: the step, the link and the hand fields holding what is there. */
function findConnection() {
  const current = connection.value
  forgetRead()
  link.value = current?.link ?? ''
  setHand(current ? handFieldsOf(current.legs) : { from: '', to: '', dep: '', arr: '', line: '' })
  changing.value = current?.legs ?? null
  step.value = STEP_FIND
}

function back() {
  if (step.value === STEP_LINK || step.value === STEP_HAND) step.value = STEP_FIND
  else if (props.connectionOnly && !connection.value) emit('close')
  else step.value = STEP_FORM
}

/** Where the connection moves its entry, when a link names another day. */
const movesTo = computed(() => {
  const legs = connection.value?.legs
  if (!legs || !handDay.value) return null
  const day = connectionDay(legs)
  return day !== handDay.value ? shortDueDay(day) : null
})

// --- by link ---

const READ_IDLE = 'idle'
const READ_READING = 'reading'
const READ_DONE = 'read'
const READ_FAILED = 'unreadable'
type ReadState = typeof READ_IDLE | typeof READ_READING | typeof READ_DONE | typeof READ_FAILED

const link = ref('')
const readState = ref<ReadState>(READ_IDLE)
const readLegs = ref<ConnectionLeg[] | null>(null)
/** The link the read state answers for; an edit of the field leaves it. */
let readFor = ''
let generation = 0
const clipboard = canReadClipboard()
const parsedLink = computed(() => parseLink(link.value))

function forgetRead() {
  generation++
  readFor = ''
  readState.value = READ_IDLE
  readLegs.value = null
}

async function readLink(text: string) {
  const parsed = parseLink(text)
  if (!parsed.ok || parsed.link === null) {
    forgetRead()
    return
  }
  if (readFor === text && readState.value !== READ_IDLE) return
  const mine = ++generation
  readFor = text
  readState.value = READ_READING
  const legs = await readConnectionLink(parsed.link, props.pageLinks)
  // A link changed while this one was read is answered by its own read.
  if (mine !== generation) return
  readLegs.value = legs
  readState.value = legs ? READ_DONE : READ_FAILED
}

/** A paste replaces the field, so a link is never glued onto another. */
function onPaste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData('text')?.trim()
  if (!text) return
  event.preventDefault()
  link.value = text
  void readLink(text)
}

async function pasteFromClipboard() {
  const text = (await readClipboardText())?.trim()
  if (!text) return
  link.value = text
  await readLink(text)
}

/** Typing leaves the last read behind; the read itself waits for the field's change. */
function onLinkInput() {
  if (link.value.trim() !== readFor) forgetRead()
}

function onLinkChange() {
  void readLink(link.value.trim())
}

function takeRead() {
  const parsed = parsedLink.value
  if (readState.value !== READ_DONE || !readLegs.value || !parsed.ok) return
  void take(readLegs.value, parsed.link)
}

onUnmounted(() => generation++)

// --- by hand ---

const hand = reactive<HandFields>({ from: '', to: '', dep: '', arr: '', line: '' })
const handLegNow = computed(() => (handDay.value ? handLeg(handDay.value, hand) : null))
/** A link kept beside the hand fields — one no reader knows. */
const keptLink = computed(() => (parsedLink.value.ok ? parsedLink.value.link : null))

function setHand(fields: HandFields) {
  Object.assign(hand, fields)
}

function takeHand() {
  if (!handLegNow.value) return
  void take([handLegNow.value], keptLink.value)
}

// --- the form ---

/**
 * The sheet's one row of buttons, brought into view when a connection is
 * taken — the form scrolled, a pick made with the button out of sight still
 * shows it.
 */
const actions = ref<HTMLElement | null>(null)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    const entry = props.entry
    keptHeight.value = 0
    connectionStands()
    findShown.value = false
    title.value = entry?.title ?? ''
    note.value = entry?.note ?? ''
    time.value = entry?.at_time ?? ''
    who.value = props.travelerIds ? [...props.travelerIds] : null
    const legs = entry?.legs ?? null
    connection.value = legs ? { legs, link: entry?.link ?? null } : null
    // What a connection filled reads as filled again, so a changed one fills it anew.
    filled.title =
      !!legs && (title.value === filledTitle(legs) || title.value === connectionTitle(legs))
    filled.time = !!legs && time.value === timeOf(legs[0]!.dep)
    changing.value = null
    forgetRead()
    link.value = ''
    setHand({ from: '', to: '', dep: '', arr: '', line: '' })
    step.value = props.connectionOnly && !legs ? STEP_FIND : STEP_FORM
    if (step.value === STEP_FIND) findShown.value = true
  },
  { immediate: true },
)

const canSave = computed(() =>
  props.connectionOnly
    ? connection.value !== null
    : title.value.trim() !== '' || connection.value !== null,
)
const saveLabel = computed(
  () => props.saveText ?? (props.entry ? t('common.save') : t('common.add')),
)

/** What is written, in words; under an excursion's name where the sheet belongs to one. */
const headText = computed(() => {
  if (props.heading) return props.heading
  if (!props.entry) {
    return props.connectionOnly
      ? t('dayPlan.addConnection')
      : t('dayPlan.newTitle', { day: props.dayText })
  }
  return t('dayPlan.editTitle')
})

const stepTitle = computed(() =>
  step.value === STEP_LINK
    ? t('dayPlan.viaLink')
    : step.value === STEP_HAND
      ? t('dayPlan.viaHand')
      : props.connectionOnly && props.heading
        ? props.heading
        : t('dayPlan.stepTitle'),
)
const stepSub = computed(() => {
  if (step.value === STEP_LINK) return t('dayPlan.linkStepHint')
  if (step.value === STEP_HAND) return t('dayPlan.handStepHint')
  const day = handDay.value ? shortDueDay(handDay.value) : ''
  return props.connectionOnly && props.excursionTitle
    ? t('dayPlan.stepForExcursion', { title: props.excursionTitle, day })
    : t('dayPlan.stepFor', { title: title.value.trim() || t('dayPlan.newEntry'), day })
})

function save() {
  if (!canSave.value) return
  emit('save', {
    title: props.connectionOnly ? '' : title.value,
    note: note.value,
    time: !props.connectionOnly && isPlanTime(time.value) ? time.value : null,
    connection: connection.value,
    ...(asksWho.value ? { travelerIds: who.value } : {}),
  })
}
</script>

<template>
  <SheetModal :is-open="open" testid="day-entry" @dismiss="emit('close')">
    <section
      v-if="open"
      ref="sheetBox"
      class="sheet"
      data-testid="day-entry-body"
      :data-settled="connectionSettled ? 'true' : 'false'"
      :style="keptHeight ? { minHeight: `${keptHeight}px` } : undefined"
    >
      <template v-if="step === STEP_FORM">
        <SheetHead
          :title="excursionTitle ? excursionTitle : headText"
          title-testid="day-entry-title"
          close-testid="day-entry-close"
          @close="emit('close')"
        >
          <template v-if="excursionTitle" #meta>
            <span data-testid="day-entry-heading">{{ headText }}</span>
          </template>
        </SheetHead>
        <p v-if="!entry && !connectionOnly" class="sub">{{ t('dayPlan.subtitle') }}</p>

        <div
          v-if="!entry && !connectionOnly && pool.length"
          class="pool"
          data-testid="day-entry-pool"
        >
          <span class="jp-eyebrow">{{ t('dayPlan.poolSuggest') }}</span>
          <div class="chips">
            <ChoiceChip
              v-for="idea in pool"
              :key="idea.id"
              class="idea"
              :pressed="false"
              :data-testid="`day-entry-plan-${idea.id}`"
              @click="emit('plan', idea)"
            >
              <IonIcon :icon="bulbOutline" aria-hidden="true" />
              {{ idea.title }}
            </ChoiceChip>
          </div>
        </div>

        <template v-if="!connectionOnly">
          <IonInput
            v-model="title"
            class="title-field"
            label-placement="stacked"
            :placeholder="t('dayPlan.titlePlaceholder')"
            data-testid="day-entry-name"
            @ionInput="filled.title = false"
            @keydown.enter.prevent="save"
          >
            <div slot="label">
              {{ t('dayPlan.whatLabel') }}
              <span v-if="filled.title" class="filled" data-testid="day-entry-filled">
                {{ t('dayPlan.fromConnection') }}
              </span>
            </div>
          </IonInput>
          <div class="pair">
            <TimeField
              v-model="time"
              class="time-field"
              label-placement="stacked"
              data-testid="day-entry-time"
              @ionInput="filled.time = false"
            >
              <template #label>
                {{ t('dayPlan.timeShort') }}
                <IonIcon
                  v-if="filled.time"
                  class="filled"
                  :icon="trainOutline"
                  role="img"
                  :aria-label="t('dayPlan.fromConnection')"
                  data-testid="day-entry-time-filled"
                />
              </template>
            </TimeField>
            <IonInput
              v-model="note"
              :label="t('dayPlan.noteShort')"
              label-placement="stacked"
              :placeholder="t('dayPlan.optional')"
              data-testid="day-entry-note"
            />
          </div>
          <div v-if="asksWho" class="who">
            <span class="jp-eyebrow">{{ t('dayPlan.whoLabel') }}</span>
            <WhoChips
              :travelers="travelers ?? []"
              :who="who"
              :all-label="t('dayPlan.everybody')"
              test-key="day-entry"
              @update="who = $event"
            />
          </div>
        </template>

        <Transition name="expand" mode="out-in" v-bind="connectionMotion">
          <ConnectionCard
            v-if="connection"
            class="connection"
            :legs="connection.legs"
            :link="connection.link"
            :title="title.trim() || connectionTitle(connection.legs)"
            @change="findConnection"
            @remove="removeConnection"
          />
          <button
            v-else
            type="button"
            class="add-connection"
            data-testid="day-entry-add-connection"
            @click="findConnection"
          >
            <span class="glyph"><IonIcon :icon="trainOutline" aria-hidden="true" /></span>
            <span class="words">
              <span class="what">{{ t('dayPlan.addTrain') }}</span>
              <span class="how">
                {{ searchable ? t('dayPlan.addTrainHint') : t('dayPlan.addTrainHintNoSearch') }}
              </span>
            </span>
          </button>
        </Transition>
        <p v-if="movesTo" class="moves" data-testid="day-entry-moves">
          {{ t('dayPlan.movesTo', { day: movesTo }) }}
        </p>
        <IonInput
          v-if="connectionOnly && connection"
          v-model="note"
          :label="t('dayPlan.noteShort')"
          label-placement="stacked"
          :placeholder="t('dayPlan.optional')"
          data-testid="day-entry-note"
        />

        <div ref="actions" class="actions">
          <IonButton
            expand="block"
            shape="round"
            :disabled="!canSave"
            data-testid="day-entry-save"
            @click="save"
          >
            {{ saveLabel }}
          </IonButton>
          <IonButton
            v-if="entry"
            fill="clear"
            color="danger"
            size="small"
            data-testid="day-entry-remove"
            @click="emit('remove')"
          >
            <IonIcon slot="start" :icon="trashOutline" aria-hidden="true" />
            {{ t('dayPlan.remove') }}
          </IonButton>
        </div>
      </template>

      <template v-else>
        <header class="step-head" data-testid="connection-step" :data-step="step">
          <button
            type="button"
            class="back"
            :aria-label="t('dayPlan.back')"
            data-testid="connection-step-back"
            @click="back"
          >
            <IonIcon :icon="chevronBack" aria-hidden="true" />
          </button>
          <h2 class="jp-sheet-title" data-testid="connection-step-title">{{ stepTitle }}</h2>
        </header>
        <p class="sub step-sub" data-testid="connection-step-sub">{{ stepSub }}</p>
      </template>

      <div v-if="findShown" v-show="step === STEP_FIND" class="find">
        <ConnectionSearch
          v-if="searchable"
          :day="handDay"
          :seed="seed"
          :near="searchNear ?? null"
          @pick="take($event, null)"
        />
        <div
          class="alternatives"
          :data-large="searchable ? undefined : 'true'"
          data-testid="connection-alternatives"
        >
          <p v-if="!searchable" class="note">{{ t('dayPlan.noSearch') }}</p>
          <span v-else class="jp-eyebrow">{{ t('dayPlan.notThere') }}</span>
          <div class="ways">
            <button
              type="button"
              class="way"
              data-testid="connection-via-link"
              @click="step = STEP_LINK"
            >
              <span class="what"
                ><IonIcon :icon="clipboardOutline" aria-hidden="true" />
                {{ t('dayPlan.viaLink') }}</span
              >
              <span class="how">{{ t('dayPlan.viaLinkHint') }}</span>
            </button>
            <button
              type="button"
              class="way"
              data-testid="connection-via-hand"
              @click="step = STEP_HAND"
            >
              <span class="what"
                ><IonIcon :icon="createOutline" aria-hidden="true" />
                {{ t('dayPlan.viaHand') }}</span
              >
              <span class="how">{{ t('dayPlan.viaHandHint') }}</span>
            </button>
          </div>
        </div>
      </div>

      <div v-if="step === STEP_LINK" class="by-link">
        <IonButton
          v-if="clipboard"
          fill="outline"
          expand="block"
          data-testid="day-entry-paste"
          @click="pasteFromClipboard"
        >
          <IonIcon slot="start" :icon="clipboardOutline" aria-hidden="true" />
          {{ t('dayPlan.pasteLink') }}
        </IonButton>
        <IonInput
          v-model="link"
          type="url"
          inputmode="url"
          :label="t('dayPlan.linkLabel')"
          label-placement="stacked"
          data-testid="day-entry-link"
          @paste="onPaste"
          @ionInput="onLinkInput"
          @ionChange="onLinkChange"
          @keydown.enter.prevent="onLinkChange"
        />
        <p
          v-if="readState !== READ_IDLE"
          class="read-state"
          :data-state="readState"
          role="status"
          data-testid="day-entry-read-state"
        >
          <IonSpinner v-if="readState === READ_READING" name="dots" aria-hidden="true" />
          {{
            readState === READ_READING
              ? t('dayPlan.reading')
              : readState === READ_DONE
                ? t('dayPlan.legsRead', { n: readLegs?.length ?? 0 })
                : t('dayPlan.unreadable')
          }}
        </p>
        <ConnectionCard
          v-if="readState === READ_DONE && readLegs"
          :legs="readLegs"
          :link="parsedLink.ok ? parsedLink.link : null"
          :title="connectionTitle(readLegs)"
          readonly
        />
        <IonButton
          v-if="readState === READ_FAILED"
          fill="outline"
          expand="block"
          data-testid="connection-link-to-hand"
          @click="step = STEP_HAND"
        >
          <IonIcon slot="start" :icon="createOutline" aria-hidden="true" />
          {{ t('dayPlan.viaHand') }}
        </IonButton>
        <IonButton
          class="take"
          expand="block"
          shape="round"
          :disabled="readState !== READ_DONE"
          data-testid="connection-take"
          @click="takeRead"
        >
          {{ t('dayPlan.take') }}
        </IonButton>
      </div>

      <div v-if="step === STEP_HAND" class="by-hand">
        <div class="hand" data-testid="day-entry-hand">
          <IonInput
            v-model="hand.from"
            class="stop"
            :label="t('dayPlan.handFrom')"
            label-placement="stacked"
            data-testid="day-entry-hand-from"
          />
          <TimeField
            v-model="hand.dep"
            class="clock"
            :label="t('dayPlan.handDep')"
            label-placement="stacked"
            data-testid="day-entry-hand-dep"
          />
          <IonInput
            v-model="hand.to"
            class="stop"
            :label="t('dayPlan.handTo')"
            label-placement="stacked"
            data-testid="day-entry-hand-to"
          />
          <TimeField
            v-model="hand.arr"
            class="clock"
            :label="t('dayPlan.handArr')"
            label-placement="stacked"
            data-testid="day-entry-hand-arr"
          />
          <IonInput
            v-model="hand.line"
            class="line-field"
            :label="t('dayPlan.handLine')"
            label-placement="stacked"
            data-testid="day-entry-hand-line"
          />
        </div>
        <p v-if="keptLink" class="kept" data-testid="day-entry-kept-link">{{ keptLink }}</p>
        <IonButton
          class="take"
          expand="block"
          shape="round"
          :disabled="!handLegNow"
          data-testid="connection-take"
          @click="takeHand"
        >
          {{ t('dayPlan.take') }}
        </IonButton>
      </div>
    </section>
  </SheetModal>
</template>

<style scoped>
.sheet {
  display: flex;
  flex-direction: column;
  padding: 4px 16px 18px;
}

.sub {
  margin: 2px 0 12px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.sheet ion-input {
  --background: var(--jp-surface-sunken);
  --padding-start: 12px;
  --padding-end: 12px;
  margin-top: 10px;
  border-radius: var(--jp-r-md);
}

.pool {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.chips {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
}

/* FR-29.15: whom it is for, labelled as the pool above it is. */
.who {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
}

.chips .idea {
  flex: none;
}

.pool ion-icon {
  font-size: var(--jp-icon-xs);
}

.title-field {
  font-weight: var(--jp-weight-semibold);
}

.filled {
  margin-left: 4px;
  color: var(--jp-done);
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-medium);
}

ion-icon.filled {
  font-size: var(--jp-icon-xs);
  vertical-align: -1px;
}

.pair {
  display: grid;
  grid-template-columns: 120px 1fr;
  column-gap: 8px;
}

.connection,
.add-connection {
  margin-top: 12px;
}

.add-connection {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 11px 12px;
  border: 1.5px dashed var(--jp-surface-border);
  border-radius: var(--jp-r-md);
  background: none;
  color: var(--ct-text);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.glyph {
  display: grid;
  flex: none;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: var(--jp-r-sm);
  background: color-mix(in srgb, var(--ct-glacier) 18%, transparent);
  color: var(--ct-glacier);
}

.glyph ion-icon {
  font-size: var(--jp-icon-md);
}

.words,
.way {
  display: flex;
  flex-direction: column;
}

.what {
  color: var(--jp-action);
  font-weight: var(--jp-weight-semibold);
}

.how {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.moves {
  margin: 8px 2px 0;
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
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

.step-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.step-head h2 {
  margin: 0;
}

.back {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--jp-surface-sunken);
  color: var(--ct-subtext1);
  cursor: pointer;
}

.back ion-icon {
  font-size: var(--jp-icon-sm);
}

.step-sub {
  padding-left: 40px;
}

.alternatives {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--jp-surface-border);
}

.alternatives[data-large] {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}

.note {
  margin: 0;
  padding: 7px 10px;
  border-left: 3px solid var(--ct-straw);
  border-radius: 0 var(--jp-r-sm) var(--jp-r-sm) 0;
  background: color-mix(in srgb, var(--ct-straw) 9%, transparent);
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
}

.ways {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.alternatives[data-large] .ways {
  grid-template-columns: 1fr;
}

.way {
  padding: 10px;
  border: 1px solid var(--jp-surface-border);
  border-radius: var(--jp-r-md);
  background: none;
  color: var(--ct-text);
  font: inherit;
  text-align: start;
  cursor: pointer;
}

.alternatives[data-large] .way {
  padding: 14px 12px;
}

.way .what {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--ct-text);
}

.read-state {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 2px 0;
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
}

.read-state ion-spinner {
  width: 24px;
  height: 16px;
  color: var(--jp-action);
}

/*
 * A connection taken opens into the form, and the add row closes as it goes:
 * the entry is seen to gain it. A step comes in the same way.
 */
.expand-enter-active,
.expand-leave-active {
  overflow: hidden;
  transition:
    max-height 0.32s cubic-bezier(0.2, 0.8, 0.2, 1),
    opacity 0.24s ease,
    transform 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-4px);
}

.expand-enter-to,
.expand-leave-from {
  max-height: 520px;
}

.find,
.by-link,
.by-hand,
.step-head {
  animation: step-in 0.24s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

@keyframes step-in {
  from {
    opacity: 0;
    transform: translateX(12px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .expand-enter-active,
  .expand-leave-active {
    transition: none;
  }

  .find,
  .by-link,
  .by-hand,
  .step-head {
    animation: none;
  }
}

.read-state[data-state='read'] {
  color: var(--jp-done);
  font-weight: var(--jp-weight-semibold);
}

.by-link > * + *,
.by-hand > * + * {
  margin-top: 10px;
}

.take {
  margin-top: 16px;
}

/* Von and ab on one row, Nach and an on the next, the line under them. */
.hand {
  display: grid;
  grid-template-columns: 1fr 120px;
  column-gap: 8px;
}

.hand .line-field {
  grid-column: 1 / -1;
}

.kept {
  margin: 0 2px;
  overflow-wrap: anywhere;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}
</style>
