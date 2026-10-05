<script lang="ts">
/**
 * FR-30.14: what a bought line offers — a way back on the list as a new
 * entry (`offer`), word that it stands there open already (`listed`), or
 * nothing (null: a source's line).
 */
export type AgainState = 'offer' | 'listed' | null
</script>

<script setup lang="ts">
/**
 * One list of M6 — *Vor der Reise* or *Vor Ort* — on `ListSection`,
 * `FoldToggle` and `ListRow`, the components M25's phase is drawn with
 * (one look and feel, guaranteed by one component): its head with what is
 * open under it, its tag groups, and **one** *gekauft* fold at its end. The
 * two lists stand one under the other, with what is due now above both.
 *
 * A component because the page draws a list in two places: in reading
 * order, and — once nothing of it is open, or for *before* once the packing
 * is finished (FR-7.12) — inside its folded line at the end of the screen.
 *
 * The acts are reported, never written: the page owns the toast and the drag.
 */
import { IonIcon, IonLabel, IonList } from '@ionic/vue'
import { addOutline, checkmarkOutline } from 'ionicons/icons'
import { computed, ref } from 'vue'

import FoldToggle from '@/components/global/FoldToggle.vue'
import ListGroup from '@/components/global/ListGroup.vue'
import ListRow from '@/components/global/ListRow.vue'
import ListSection from '@/components/global/ListSection.vue'
import UserAvatar from '@/components/global/UserAvatar.vue'
import type { RowSelection } from '@/composables/useRowSelection'
import { intlLocale, t } from '@/i18n'
import { boughtStampText, type NameOf } from '@/lib/rowFacts'
import type { ShoppingLine } from '@/lib/shoppingSources'
import { ITEM_MODE_BUY_BEFORE, type ShoppingMode } from '@/types/domain'

import { boughtByDay, type BoughtDay, type ListShelf, type ShoppingSection } from './list'
import ShoppingRows from './ShoppingRows.vue'

const props = withDefaults(
  defineProps<{
    list: ShoppingMode
    /** The list's open lines as the board filed them (`shoppingBoard`). */
    shelf: ListShelf
    /** What was bought from it and can still be put back (FR-25.11j). */
    bought: readonly ShoppingLine[]
    today: string
    nameOf: NameOf
    /** The key a drop on `section` carries — the page reads it back. */
    dropKey: (section: ShoppingSection) => string
    /** FR-7.12: a closed list — no drop, no grip, no check-off, nothing put back. */
    readonly?: boolean
    /**
     * The head is the page's, where the list is drawn inside its folded line
     * at the screen's end (`RestLine`) — whose words already count what was
     * bought, so it is shown without a second fold.
     */
    headless?: boolean
    testid?: string
    selection?: RowSelection
    leave?: (el: Element, done: () => void) => void
    /** FR-30.12: whether a line can be handed to somebody — `ShoppingRows`' prop. */
    assignable?: boolean
    /** FR-30.14: what each bought line offers; absent offers nothing. */
    again?: (line: ShoppingLine) => AgainState
  }>(),
  {
    readonly: false,
    headless: false,
    testid: undefined,
    selection: undefined,
    leave: undefined,
    assignable: false,
    again: undefined,
  },
)

const emit = defineEmits<{
  buy: [line: ShoppingLine]
  unbuy: [line: ShoppingLine]
  again: [line: ShoppingLine]
  open: [line: ShoppingLine]
  lift: [line: ShoppingLine, event: PointerEvent]
  assign: [line: ShoppingLine]
}>()

const before = computed(() => props.list === ITEM_MODE_BUY_BEFORE)

/** What the head counts: what stands under it, as M25's head does. */
const count = computed(() =>
  props.shelf.open > 0 ? t('shopping.openCount', { n: props.shelf.open }) : null,
)

/**
 * FR-25.11j's reveal, M25's *erledigt* fold: off by default and not carried
 * across a visit — its off-state is the safe one.
 */
const showBought = ref(false)

function sectionTitle(section: ShoppingSection): string {
  if (section.carried) return t('shopping.carriedOver')
  if (section.packing) return t('shopping.packingList')
  if (section.own) return t('shopping.ownEntries')
  return section.name ?? ''
}

/** FR-30.14: a closed list is a record and offers nothing again (FR-7.12). */
function againOf(line: ShoppingLine): AgainState {
  return props.readonly ? null : (props.again?.(line) ?? null)
}

/** FR-30.15: the fold's purchases under the day each was bought on. */
const boughtDays = computed(() => boughtByDay(props.bought, new Date()))

/** *Heute*, *Gestern*, then the date — „Sa., 3. Okt.". */
function dayTitle(day: BoughtDay): string {
  if (!day.day) return t('shopping.boughtUndated')
  if (day.relative === 'today') return t('shopping.boughtToday')
  if (day.relative === 'yesterday') return t('shopping.boughtYesterday')
  return dayDate(day.day)
}

/** The date beside *Heute* and *Gestern*; a dated heading already is one. */
function dayNote(day: BoughtDay): string | undefined {
  return day.day && day.relative ? dayDate(day.day) : undefined
}

function dayDate(day: Date): string {
  return day.toLocaleDateString(intlLocale(), { weekday: 'short', day: 'numeric', month: 'short' })
}

/** „gekauft von Andy · 14:32" — who bought the line, and at what time of its day. */
function boughtStamp(line: ShoppingLine): string | null {
  return boughtStampText(line.boughtAt, line.boughtBy, props.nameOf, undefined, { withDay: false })
}
</script>

<template>
  <ListSection
    :title="t(before ? 'shopping.beforeDeparture' : 'shopping.atDestination')"
    :count="count"
    :headless="headless"
    :testid="testid ?? (before ? 'm6-before' : 'm6-local')"
  >
    <IonList v-if="shelf.sections.length > 0" class="list-groups">
      <ListGroup
        v-for="section in shelf.sections"
        :key="section.key"
        :title="sectionTitle(section)"
        :drop-target="dropKey(section)"
        :drop-label="
          headless
            ? sectionTitle(section)
            : `${t(before ? 'shopping.beforeDeparture' : 'shopping.atDestination')} · ${sectionTitle(section)}`
        "
        :droppable="!readonly"
        :data-testid="`m6-group-${section.carried ? 'carried' : section.packing ? 'packing' : section.own ? 'own' : section.tagged ? `tag-${section.name}` : `source-${section.name}`}`"
      >
        <ShoppingRows
          :lines="section.lines"
          :today="today"
          :selection="readonly ? undefined : selection"
          :readonly="readonly"
          :leave="leave"
          :assignable="assignable"
          :name-of="nameOf"
          @buy="emit('buy', $event)"
          @open="emit('open', $event)"
          @lift="(line, e) => emit('lift', line, e)"
          @assign="emit('assign', $event)"
        />
      </ListGroup>
    </IonList>

    <!-- FR-25.11j + M25's fold: what was bought from this list, at its end. -->
    <template v-if="bought.length > 0">
      <FoldToggle
        v-if="!headless"
        :label="t('shopping.boughtFold', { n: bought.length })"
        :open="showBought"
        testid="m6-bought-bar"
        @toggle="showBought = !showBought"
      />
      <IonList v-if="showBought || headless" class="list-groups" data-testid="m6-bought-list">
        <ListGroup
          v-for="day in boughtDays"
          :key="day.key"
          :title="dayTitle(day)"
          :note="dayNote(day)"
          :count="day.lines.length"
          :data-day="day.key"
          data-testid="m6-bought-day"
          head-testid="m6-bought-day-head"
        >
          <ListRow
            v-for="line in day.lines"
            :key="line.key"
            done
            :checked="true"
            :tick-disabled="readonly"
            :tick-label="t('shopping.undoBought', { name: line.name })"
            data-testid="m6-bought-row"
            @tick="emit('unbuy', line)"
          >
            <IonLabel
              :class="{ tappable: !!line.edit && !readonly }"
              data-testid="m6-bought-label"
              @click="line.edit && !readonly && emit('open', line)"
            >
              <div class="name-line">
                <h3 class="row-name">{{ line.name }}</h3>
                <!-- FR-33.14: a summed line's total, as on the open list. -->
                <span v-if="line.total" class="total" data-testid="m6-bought-total"
                  >· {{ line.total }}</span
                >
              </div>
            </IonLabel>
            <template v-if="line.tag || line.boughtNote || boughtStamp(line)" #facts>
              <!-- FR-30.9: the fold is filed by day, not tag, so the tag is said in the row. -->
              <span v-if="line.tag" data-testid="m6-bought-tag">{{ line.tag }}</span>
              <span v-if="line.boughtNote" data-testid="m6-bought-note">{{ line.boughtNote }}</span>
              <!-- FR-30.4: who bought it, and when. -->
              <span v-if="boughtStamp(line)" class="recipients" data-testid="m6-bought-stamp">
                <UserAvatar
                  v-if="line.boughtBy && nameOf(line.boughtBy)"
                  :name="nameOf(line.boughtBy)"
                  :seed="line.boughtBy"
                  :size="18"
                />
                <span>{{ boughtStamp(line) }}</span>
              </span>
            </template>
            <!-- FR-30.14: before the tick, in the thumb's reach, and worded —
               the tick beside it still means *not bought after all*. -->
            <template v-if="againOf(line)" #end>
              <button
                v-if="againOf(line) === 'offer'"
                type="button"
                class="again"
                :aria-label="t('shopping.buyAgainLabel', { name: line.name })"
                data-testid="m6-bought-again"
                @click="emit('again', line)"
              >
                <IonIcon :icon="addOutline" aria-hidden="true" />
                {{ t('shopping.buyAgain') }}
              </button>
              <span v-else class="again listed" data-testid="m6-bought-listed">
                <IonIcon :icon="checkmarkOutline" aria-hidden="true" />
                {{ t('shopping.onListAgain') }}
              </span>
            </template>
          </ListRow>
        </ListGroup>
      </IonList>
    </template>
  </ListSection>
</template>

<style scoped>
/* The name and a summed line's total on one line (FR-33.14). */
.name-line {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.total {
  flex: none;
  color: var(--ct-subtext0);
}

.tappable {
  cursor: pointer;
}

.again {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
  margin-inline-end: 12px;
  padding: 5px 11px;
  border: 1px solid color-mix(in srgb, var(--jp-brand) 55%, transparent);
  border-radius: var(--jp-r-pill);
  background: color-mix(in srgb, var(--jp-brand) 10%, transparent);
  color: var(--jp-brand);
  font-size: var(--jp-text-sm);
  white-space: nowrap;
  cursor: pointer;
}

.again.listed {
  border-color: transparent;
  background: transparent;
  color: var(--ct-subtext0);
  cursor: default;
}

.recipients {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>
