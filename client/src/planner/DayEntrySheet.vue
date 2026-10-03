<script setup lang="ts">
/**
 * The day plan's sheet for an entry of its own (FR-29.15): a new one on the
 * chosen day — with the shortlisted ideas without a day beside it, any of
 * which can be planned there instead, and a connection (FR-29.18) — or an
 * existing one to change or delete. Nothing is written before its button.
 *
 * A connection's link is read the moment it arrives — pasted into the field
 * or fetched by the clipboard button — never on a keystroke, and the read
 * replaces the hand fields with its legs. A link nobody can read leaves the
 * hand fields, and is kept beside them. Above both, the timetable search finds a
 * connection to take instead (ADR-086).
 */
import {
  IonButton,
  IonIcon,
  IonInput,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonTextarea,
} from '@ionic/vue'
import { bulbOutline, clipboardOutline, trashOutline } from 'ionicons/icons'
import { computed, onUnmounted, reactive, ref, watch } from 'vue'

import ChoiceChip from '@/components/global/ChoiceChip.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import { t } from '@/i18n'
import { canReadClipboard, readClipboardText } from '@/lib/clipboard'
import { useTimetableOffered } from '@/lib/timetable'
import { shortDueDay } from '@/lib/taskDueText'
import type { ConnectionLeg, DayEntry, Idea } from '@/types/domain'
import { DAY_ENTRY_CONNECTION } from '@/types/domain'
import type { ConnectionFields, DayEntryFields } from './actions'
import ConnectionLegs from './ConnectionLegs.vue'
import ConnectionSearch from './ConnectionSearch.vue'
import {
  connectionDay,
  handFieldsOf,
  handLeg,
  readConnectionLink,
  type HandFields,
  type PageLinks,
} from './domain/connections'
import { isPlanTime } from './domain/dayPlan'
import { parseLink } from './domain/ideas'
import type { SearchSeed } from './domain/timetable'

const props = defineProps<{
  open: boolean
  /** The entry being changed, or null for a new one. */
  entry: DayEntry | null
  /** The chosen day, `YYYY-MM-DD`: a new entry's, and a connection's by hand. */
  day: string | null
  /** The chosen day in words, for the head of a new one. */
  dayText: string
  /** The shortlisted ideas without a day, offered beside a new entry. */
  pool: readonly Idea[]
  /** A page's links, read by the server — null where there is none to ask (Local Mode, previews off). */
  pageLinks: PageLinks | null
  /** The excursion a new or changed connection belongs to (FR-29.18), or null for none. */
  excursionTitle?: string | null
  /** Offers nothing but a connection, as the excursion's own screen asks for one. */
  connectionOnly?: boolean
  /** The head's words where the caller names what is written — *Hinfahrt*. */
  heading?: string | null
  /** Where a new connection's timetable search starts (FR-29.18); the morning of the day where none is given. */
  searchSeed?: SearchSeed | null
  /** The place whose nearest stop a new way there arrives at: the route's start. */
  searchNear?: { lat: number; lon: number } | null
}>()

const emit = defineEmits<{
  close: []
  save: [fields: DayEntryFields]
  saveConnection: [fields: ConnectionFields]
  remove: []
  plan: [idea: Idea]
}>()

const ADD_ENTRY = 'entry'
const ADD_IDEA = 'idea'
const ADD_CONNECTION = 'connection'
type AddKind = typeof ADD_ENTRY | typeof ADD_IDEA | typeof ADD_CONNECTION
const ADD_KINDS: readonly string[] = [ADD_ENTRY, ADD_CONNECTION, ADD_IDEA]

const kind = ref<AddKind>(ADD_ENTRY)
const title = ref('')
const note = ref('')
const time = ref('')

// --- a connection ---

const READ_IDLE = 'idle'
const READ_READING = 'reading'
const READ_DONE = 'read'
const READ_FAILED = 'unreadable'
type ReadState = typeof READ_IDLE | typeof READ_READING | typeof READ_DONE | typeof READ_FAILED

const link = ref('')
const hand = reactive<HandFields>({ from: '', to: '', dep: '', arr: '', line: '' })
const readState = ref<ReadState>(READ_IDLE)
const readLegs = ref<ConnectionLeg[] | null>(null)
/** The link the read state answers for; an edit of the field leaves it. */
let readFor = ''
let generation = 0
const clipboard = canReadClipboard()
const timetableOffered = useTimetableOffered()
const DEFAULT_SEED: SearchSeed = { from: '', to: '', time: '08:00', earliest: null }
const searchable = computed(() => !props.entry && timetableOffered.value && handDay.value !== null)

const parsedLink = computed(() => parseLink(link.value))
/** The day a connection by hand stands on: the entry's own, or the chosen one. */
const handDay = computed(() => props.entry?.on_date ?? props.day)
const connectionLegs = computed<ConnectionLeg[] | null>(() => {
  if (readState.value === READ_DONE) return readLegs.value
  const leg = handDay.value ? handLeg(handDay.value, hand) : null
  return leg ? [leg] : null
})
const canSaveConnection = computed(
  () => parsedLink.value.ok && connectionLegs.value !== null && readState.value !== READ_READING,
)

function setHand(fields: HandFields) {
  Object.assign(hand, fields)
}

/** A connection taken from the timetable reads as a link would: its legs, the link left empty. */
function takeSearched(legs: ConnectionLeg[]) {
  generation++
  link.value = ''
  readFor = ''
  readLegs.value = legs
  readState.value = READ_DONE
}

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

onUnmounted(() => generation++)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    const entry = props.entry
    kind.value =
      props.connectionOnly || (entry?.kind === DAY_ENTRY_CONNECTION && entry.legs)
        ? ADD_CONNECTION
        : ADD_ENTRY
    title.value = entry?.title ?? ''
    note.value = entry?.note ?? ''
    time.value = entry?.at_time ?? ''
    forgetRead()
    link.value = entry?.link ?? ''
    setHand({ from: '', to: '', dep: '', arr: '', line: '' })
    const legs = entry?.legs
    if (legs && legs.length === 1) {
      setHand(handFieldsOf(legs[0]!))
    } else if (legs) {
      // Several legs came from a link, and stay what it said until another is pasted.
      readFor = link.value
      readLegs.value = legs
      readState.value = READ_DONE
    }
  },
  { immediate: true },
)

const canSave = computed(() => title.value.trim() !== '')

function onKind(event: CustomEvent) {
  const value = (event.detail as { value?: unknown }).value
  if (typeof value === 'string' && ADD_KINDS.includes(value)) kind.value = value as AddKind
}

function saveConnection() {
  const parsed = parsedLink.value
  const legs = connectionLegs.value
  if (!canSaveConnection.value || !parsed.ok || !legs) return
  emit('saveConnection', { legs, link: parsed.link })
}

const connectionSaveLabel = computed(() => {
  const legs = connectionLegs.value
  if (readState.value === READ_DONE && legs) {
    return t('dayPlan.insertOn', { day: shortDueDay(connectionDay(legs)) })
  }
  return props.entry ? t('common.save') : t('common.add')
})

function save() {
  if (!canSave.value) return
  emit('save', {
    title: title.value,
    note: note.value,
    time: isPlanTime(time.value) ? time.value : null,
  })
}
</script>

<template>
  <SheetModal :is-open="open" testid="day-entry" @dismiss="emit('close')">
    <section v-if="open" class="sheet">
      <SheetHead
        :title="
          heading
            ? heading
            : !entry
              ? connectionOnly
                ? t('dayPlan.addConnection')
                : t('dayPlan.newTitle', { day: dayText })
              : kind === ADD_CONNECTION
                ? t('dayPlan.editConnectionTitle')
                : t('dayPlan.editTitle')
        "
        title-testid="day-entry-title"
        close-testid="day-entry-close"
        @close="emit('close')"
      />
      <IonSegment
        v-if="!entry && !connectionOnly"
        :value="kind"
        class="kinds"
        data-testid="day-entry-kinds"
        @ionChange="onKind"
      >
        <IonSegmentButton :value="ADD_ENTRY" data-testid="day-entry-kind-entry">
          <IonLabel>{{ t('dayPlan.kind.entry') }}</IonLabel>
        </IonSegmentButton>
        <IonSegmentButton :value="ADD_CONNECTION" data-testid="day-entry-kind-connection">
          <IonLabel>{{ t('dayPlan.kind.connection') }}</IonLabel>
        </IonSegmentButton>
        <IonSegmentButton :value="ADD_IDEA" data-testid="day-entry-kind-idea">
          <IonLabel>{{ t('dayPlan.kind.idea') }}</IonLabel>
        </IonSegmentButton>
      </IonSegment>

      <template v-if="kind === ADD_ENTRY">
        <IonInput
          v-model="title"
          class="title-field"
          :placeholder="t('dayPlan.titlePlaceholder')"
          :aria-label="t('dayPlan.titlePlaceholder')"
          data-testid="day-entry-name"
          @keydown.enter.prevent="save"
        />
        <IonTextarea
          v-model="note"
          auto-grow
          :rows="2"
          :placeholder="t('dayPlan.notePlaceholder')"
          :aria-label="t('dayPlan.notePlaceholder')"
          data-testid="day-entry-note"
        />
        <IonInput
          v-model="time"
          type="time"
          class="time-field"
          :label="t('dayPlan.timeLabel')"
          label-placement="stacked"
          data-testid="day-entry-time"
        />
        <div class="actions">
          <IonButton
            v-if="entry"
            fill="clear"
            color="danger"
            data-testid="day-entry-remove"
            @click="emit('remove')"
          >
            <IonIcon slot="start" :icon="trashOutline" aria-hidden="true" />
            {{ t('dayPlan.remove') }}
          </IonButton>
          <span class="spacer" />
          <IonButton shape="round" :disabled="!canSave" data-testid="day-entry-save" @click="save">
            {{ entry ? t('common.save') : t('common.add') }}
          </IonButton>
        </div>
      </template>

      <div
        v-else-if="kind === ADD_CONNECTION"
        class="connection"
        data-testid="day-entry-connection"
      >
        <p v-if="excursionTitle" class="hint" data-testid="day-entry-excursion">
          {{ t('dayPlan.connectionFor', { title: excursionTitle }) }}
        </p>
        <ConnectionSearch
          v-if="searchable"
          :day="handDay"
          :seed="searchSeed ?? DEFAULT_SEED"
          :near="searchNear ?? null"
          @pick="takeSearched"
        />
        <p class="hint">{{ t('dayPlan.connectionHint') }}</p>
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
          {{
            readState === READ_READING
              ? t('dayPlan.reading')
              : readState === READ_DONE
                ? t('dayPlan.legsRead', { n: readLegs?.length ?? 0 })
                : t('dayPlan.unreadable')
          }}
        </p>
        <ConnectionLegs
          v-if="readState === READ_DONE && readLegs"
          class="preview"
          :legs="readLegs"
          data-testid="day-entry-legs"
        />
        <div v-else-if="readState !== READ_READING" class="hand" data-testid="day-entry-hand">
          <IonInput
            v-model="hand.from"
            class="stop"
            :label="t('dayPlan.handFrom')"
            label-placement="stacked"
            data-testid="day-entry-hand-from"
          />
          <IonInput
            v-model="hand.dep"
            type="time"
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
          <IonInput
            v-model="hand.arr"
            type="time"
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
        <div class="actions">
          <IonButton
            v-if="entry"
            fill="clear"
            color="danger"
            data-testid="day-entry-remove"
            @click="emit('remove')"
          >
            <IonIcon slot="start" :icon="trashOutline" aria-hidden="true" />
            {{ t('dayPlan.remove') }}
          </IonButton>
          <span class="spacer" />
          <IonButton
            shape="round"
            :disabled="!canSaveConnection"
            data-testid="day-entry-save"
            @click="saveConnection"
          >
            {{ connectionSaveLabel }}
          </IonButton>
        </div>
      </div>

      <div v-else class="pool" data-testid="day-entry-pool">
        <p v-if="pool.length === 0" class="empty">{{ t('dayPlan.poolEmpty') }}</p>
        <ChoiceChip
          v-for="idea in pool"
          :key="idea.id"
          :pressed="false"
          :data-testid="`day-entry-plan-${idea.id}`"
          @click="emit('plan', idea)"
        >
          <IonIcon :icon="bulbOutline" aria-hidden="true" />
          {{ idea.title }}
        </ChoiceChip>
      </div>
    </section>
  </SheetModal>
</template>

<style scoped>
.sheet {
  padding: 4px 16px 18px;
}

.kinds {
  margin-top: 6px;
}

.sheet ion-input,
.sheet ion-textarea {
  --background: var(--jp-surface-sunken);
  --padding-start: 12px;
  --padding-end: 12px;
  margin-top: 10px;
  border-radius: var(--jp-r-md);
}

.title-field {
  font-weight: var(--jp-weight-semibold);
}

.time-field {
  max-width: 180px;
}

.actions {
  display: flex;
  align-items: center;
  margin-top: 14px;
}

.spacer {
  flex: 1;
}

.hint {
  margin: 12px 2px 8px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.read-state {
  margin: 10px 2px 0;
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
}

.read-state[data-state='read'] {
  color: var(--jp-done);
  font-weight: var(--jp-weight-semibold);
}

.preview {
  margin-top: 6px;
  padding: 6px 12px;
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-sunken);
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

.pool {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.pool ion-icon {
  font-size: var(--jp-icon-xs);
}

.empty {
  margin: 4px 2px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}
</style>
