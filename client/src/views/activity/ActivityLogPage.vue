<script setup lang="ts">
/**
 * M30 — Aktivität (FR-32.2): who changed what, newest first.
 *
 * One page, two logs, like the conflict log beside it: with a `tripId` it
 * reads that trip's — everything inside the trip plus the trip's own name,
 * dates and roster — and without one the inventory's. A person's run of the
 * same act is one line (`groupActivity`), opened to show what it was made of.
 *
 * The log is read, not synced, so it is fetched on entry and on a pull; a
 * page of older entries is fetched when asked for. It exists only where a
 * server recorded it — the entries that reach it are hidden in Local Mode
 * (G-8) — and in Single-User there is nobody to tell apart, so it names no
 * one.
 */
import {
  IonPage,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
  IonIcon,
  IonButton,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/vue'
import {
  addCircleOutline,
  archiveOutline,
  arrowUndoOutline,
  bagCheckOutline,
  cartOutline,
  checkmarkCircleOutline,
  createOutline,
  eyeOffOutline,
  eyeOutline,
  refreshOutline,
  removeCircleOutline,
  swapVerticalOutline,
  thumbsUpOutline,
  timeOutline,
  trashOutline,
} from 'ionicons/icons'
import { computed, inject, onMounted, ref } from 'vue'

import EmptyState from '@/components/global/EmptyState.vue'
import SectionHead from '@/components/global/SectionHead.vue'
import type { ActivityEntry } from '@/api/types'
import { setHeaderTitle } from '@/composables/shared/useHeaderTitle'
import { useOrchestrator } from '@/composables/shared/useOrchestrator'
import { useIdentity } from '@/composables/shared/useTripIdentity'
import {
  SAID_BY_KIND,
  groupActivity,
  readActivity,
  type ActivityArea,
  type ActivityGroup,
  type ActivityKind,
} from '@/domain/activity'
import { t, formatDate, formatDay, type MessageKey } from '@/i18n'
import { ACTIVITY_READERS } from '@/kernel/activityReaders'
import { FIELD_LABELS } from '@/lib/fieldLabels'
import { hasCollaborativeSession } from '@/mode'
import { useTripStore } from '@/stores/tripStore'

const props = defineProps<{ tripId?: string }>()

const orchestrator = useOrchestrator()
const trips = useTripStore()
/** The feature modules' readings of their own rows, bound by `App.vue`. */
const readers = inject(ACTIVITY_READERS, {})
const { directory, load: loadIdentity } = useIdentity(orchestrator.identity)

/** Single-User has one person; a name on every line would say nothing. */
const namesPeople = hasCollaborativeSession()

setHeaderTitle(
  () => t(props.tripId ? 'activity.title' : 'activity.titleInventory'),
  () => (props.tripId ? trips.getTrip(props.tripId)?.name : undefined),
)

const entries = ref<ActivityEntry[]>([])
/** The cursor of the next older page; 0 once the log's beginning is on screen. */
const before = ref(0)
const failed = ref(false)
/** ADR-033: „nothing recorded yet" is a verdict only once the log was read. */
const settled = ref(false)
const loadingMore = ref(false)
const open = ref<Set<string>>(new Set())

function fetchPage(cursor?: number) {
  return props.tripId
    ? orchestrator.activity.fetchTripActivity(props.tripId, cursor)
    : orchestrator.activity.fetchInventoryActivity(cursor)
}

async function load() {
  try {
    const page = await fetchPage()
    entries.value = page.entries
    before.value = page.before
    failed.value = false
  } catch {
    failed.value = true
  } finally {
    settled.value = true
  }
  if (namesPeople && entries.value.length > 0) await loadIdentity()
}

async function loadMore() {
  if (loadingMore.value || before.value === 0) return
  loadingMore.value = true
  try {
    const page = await fetchPage(before.value)
    entries.value = [...entries.value, ...page.entries]
    before.value = page.before
  } catch {
    failed.value = true
  } finally {
    loadingMore.value = false
  }
}

onMounted(load)

async function onRefresh(event: CustomEvent) {
  await load()
  ;(event.target as HTMLIonRefresherElement).complete()
}

/**
 * The fields a „changed" line names: those with a word for them, minus the
 * references (an id is not an answer) and what the kind already says.
 */
/** A column that holds another row's id — a uuid, not an answer. */
const REFERENCE_SUFFIX = '_id'

const SHOWN_FIELDS: ReadonlySet<string> = new Set(
  Object.keys(FIELD_LABELS).filter((f) => !f.endsWith(REFERENCE_SUFFIX) && !SAID_BY_KIND.has(f)),
)

function isTask(commentId: string): boolean | undefined {
  if (!props.tripId) return undefined
  const id = props.tripId
  if (trips.getPrepTasks(id).some((c) => c.id === commentId)) return true
  if (trips.getOwnTasks(id).some((c) => c.id === commentId)) return true
  if (trips.getComments(id).some((c) => c.id === commentId)) return false
  return undefined
}

/** A timestamp's day in the reader's own calendar. */
function localDay(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const days = computed(() =>
  groupActivity(readActivity(entries.value, SHOWN_FIELDS, { isTask, readers }), localDay),
)

function dayTitle(day: string): string {
  const now = new Date(orchestrator.now())
  const today = localDay(now.toISOString())
  // The calendar's day before, not 24 hours back: a DST night is 23 or 25.
  const yesterday = localDay(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toISOString(),
  )
  if (day === today) return t('activity.today')
  if (day === yesterday) return t('activity.yesterday')
  return formatDay(day)
}

const KIND_ICON: Record<ActivityKind, string> = {
  added: addCircleOutline,
  removed: trashOutline,
  changed: createOutline,
  reordered: swapVerticalOutline,
  packed: bagCheckOutline,
  unpacked: arrowUndoOutline,
  skipped: removeCircleOutline,
  bought: cartOutline,
  unbought: arrowUndoOutline,
  done: checkmarkCircleOutline,
  reopened: refreshOutline,
  read: eyeOutline,
  unread: eyeOffOutline,
  voted: thumbsUpOutline,
  unvoted: arrowUndoOutline,
  retired: archiveOutline,
  restored: eyeOutline,
}

const KIND_LABEL: Record<ActivityKind, MessageKey> = {
  added: 'activity.kind.added',
  removed: 'activity.kind.removed',
  changed: 'activity.kind.changed',
  reordered: 'activity.kind.reordered',
  packed: 'activity.kind.packed',
  unpacked: 'activity.kind.unpacked',
  skipped: 'activity.kind.skipped',
  bought: 'activity.kind.bought',
  unbought: 'activity.kind.unbought',
  done: 'activity.kind.done',
  reopened: 'activity.kind.reopened',
  read: 'activity.kind.read',
  unread: 'activity.kind.unread',
  voted: 'activity.kind.voted',
  unvoted: 'activity.kind.unvoted',
  retired: 'activity.kind.retired',
  restored: 'activity.kind.restored',
}

const AREA_LABEL: Record<ActivityArea, MessageKey> = {
  packing: 'packing.title',
  luggage: 'packing.luggage',
  travellers: 'activity.area.travellers',
  shopping: 'packing.shopping',
  tasks: 'packing.tasks',
  notes: 'notes.title',
  excursions: 'excursions.title',
  ideas: 'ideas.title',
  dayplan: 'dayPlan.title',
  meals: 'meals.title',
  trip: 'activity.area.trip',
  members: 'members.title',
  inventory: 'items.title',
  tags: 'activity.area.tags',
  templates: 'nav.templates',
  series: 'nav.title.series',
}

/** How many names a folded line spells out before it counts the rest. */
const NAMED_IN_A_GROUP = 3

function labelOf(entry: ActivityEntry): string {
  return entry.label || t('activity.unnamed')
}

function groupTitle(group: ActivityGroup): string {
  const names = [...new Set(group.lines.map((l) => labelOf(l.entry)))]
  const shown = names.slice(0, NAMED_IN_A_GROUP).join(', ')
  const rest = names.length - NAMED_IN_A_GROUP
  return rest > 0 ? `${shown} ${t('activity.andMore', { n: rest })}` : shown
}

function whatLine(group: ActivityGroup): string {
  const verb = t(KIND_LABEL[group.kind])
  const count = group.lines.length > 1 ? `${t('activity.times', { n: group.lines.length })} ` : ''
  const subject = group.lines.length === 1 ? group.lines[0]!.entry.subject : undefined
  const parts = [`${count}${verb}`, t(AREA_LABEL[group.area])]
  if (subject) parts.push(t('activity.in', { subject }))
  return parts.join(' · ')
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return t('conflicts.emptyValue')
  if (typeof value === 'boolean') return t(value ? 'common.yes' : 'common.no')
  return String(value)
}

function detailLine(group: ActivityGroup): string {
  return group.lines[0]!.details.map((d) => {
    const key = FIELD_LABELS[d.field]
    return `${key ? t(key) : d.field}: ${formatValue(d.before)} → ${formatValue(d.after)}`
  }).join(' · ')
}

const names = computed(() => new Map(directory.value.map((u) => [u.user_id, u.display_name])))

function timeOf(iso: string): string {
  return formatDate(new Date(iso), { timeStyle: 'short' })
}

/** Who and when; a run spans from its oldest line to its newest. */
function metaLine(group: ActivityGroup): string {
  const newest = timeOf(group.lines[0]!.entry.created_at)
  const oldest = timeOf(group.lines.at(-1)!.entry.created_at)
  const when = newest === oldest ? newest : `${oldest}–${newest}`
  if (!namesPeople) return when
  return `${names.value.get(group.actor) ?? t('activity.someone')} · ${when}`
}

function toggle(group: ActivityGroup) {
  if (group.lines.length < 2) return
  const next = new Set(open.value)
  if (next.has(group.key)) next.delete(group.key)
  else next.add(group.key)
  open.value = next
}
</script>

<template>
  <IonPage>
    <IonContent class="ion-padding">
      <IonRefresher slot="fixed" @ionRefresh="onRefresh">
        <IonRefresherContent />
      </IonRefresher>

      <template v-if="days.length > 0">
        <section v-for="day in days" :key="day.day" data-testid="activity-day">
          <SectionHead :title="dayTitle(day.day)" />
          <IonList class="jp-card day-card">
            <template v-for="group in day.groups" :key="group.key">
              <IonItem
                lines="inset"
                :button="group.lines.length > 1"
                :detail="false"
                data-testid="activity-row"
                :data-kind="group.kind"
                :aria-expanded="group.lines.length > 1 ? open.has(group.key) : undefined"
                @click="toggle(group)"
              >
                <IonIcon slot="start" :icon="KIND_ICON[group.kind]" aria-hidden="true" />
                <IonLabel>
                  <h3 data-testid="activity-title">{{ groupTitle(group) }}</h3>
                  <p data-testid="activity-what">{{ whatLine(group) }}</p>
                  <p v-if="group.lines[0]!.details.length > 0" data-testid="activity-detail">
                    {{ detailLine(group) }}
                  </p>
                </IonLabel>
                <IonNote slot="end" data-testid="activity-meta">{{ metaLine(group) }}</IonNote>
              </IonItem>
              <template v-if="open.has(group.key)">
                <IonItem
                  v-for="line in group.lines"
                  :key="line.entry.id"
                  lines="none"
                  class="activity-member"
                  data-testid="activity-member"
                >
                  <IonLabel>{{ labelOf(line.entry) }}</IonLabel>
                  <IonNote slot="end">{{ timeOf(line.entry.created_at) }}</IonNote>
                </IonItem>
              </template>
            </template>
          </IonList>
        </section>

        <div v-if="before > 0" class="activity-more">
          <IonButton
            fill="clear"
            :disabled="loadingMore"
            data-testid="activity-more"
            @click="loadMore"
          >
            {{ t('activity.more') }}
          </IonButton>
        </div>
      </template>

      <EmptyState v-else-if="!settled" :title="t('activity.loading')" testid="activity-loading" />
      <EmptyState
        v-else
        :icon="timeOutline"
        :title="failed ? t('activity.unavailable') : t('activity.empty')"
        :hint="failed ? undefined : t('activity.emptyHint')"
        testid="activity-empty"
      />
    </IonContent>
  </IonPage>
</template>

<style scoped>
.day-card {
  padding-block: 4px;
}

/* A part of a folded line stands under the line's words, past the glyph
   column the line hangs from — the glyph's box and Ionic's start margin. */
.activity-member {
  --padding-start: 72px;
  --min-height: 36px;
}

.activity-more {
  display: flex;
  justify-content: center;
}
</style>
