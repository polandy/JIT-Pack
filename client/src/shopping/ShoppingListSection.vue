<script setup lang="ts">
/**
 * One list of M6 — *Vor der Abreise* or *Vor Ort* — drawn as M25 draws a
 * phase (`TaskPhaseSection.vue`; owner, 2026-09-26): its head with what is
 * open under it, its tag groups, and **one** *gekauft* fold at its end. The
 * two lists used to be tabs, one hidden behind the other; they now stand one
 * under the other, with what is due now above both.
 *
 * A component because the page draws a list in two places: in reading
 * order, and — for *before*, once the packing is finished (FR-7.12) — inside
 * the fold at the end of the screen, as the record of what was bought.
 *
 * The acts are reported, never written: the page owns the toast and the drag.
 */
import { IonCheckbox, IonIcon, IonItem, IonLabel, IonList } from '@ionic/vue'
import { chevronForwardOutline } from 'ionicons/icons'
import { computed, ref } from 'vue'

import InlineHint from '@/components/global/InlineHint.vue'
import ListGroup from '@/components/global/ListGroup.vue'
import SectionHead from '@/components/global/SectionHead.vue'
import UserAvatar from '@/components/global/UserAvatar.vue'
import type { RowSelection } from '@/composables/useRowSelection'
import { t } from '@/i18n'
import { boughtStampText, type NameOf } from '@/lib/rowFacts'
import type { ShoppingLine } from '@/lib/shoppingSources'
import { ITEM_MODE_BUY_BEFORE, type ShoppingMode } from '@/types/domain'

import { dropTag, type ListShelf, type ShoppingSection } from './list'
import ShoppingRows from './ShoppingRows.vue'

const props = withDefaults(
  defineProps<{
    list: ShoppingMode
    /** The list's open lines as the board filed them (`shoppingBoard`). */
    shelf: ListShelf
    /** What was bought from it and can still be put back (FR-25.11j). */
    bought: readonly ShoppingLine[]
    /** How many of its open lines stand in the *Fällig* block instead. */
    dueElsewhere: number
    today: string
    nameOf: NameOf
    /** The key a drop on `section` carries — the page reads it back. */
    dropKey: (section: ShoppingSection) => string
    /** FR-7.12: a closed list — no drop, no grip, no check-off, nothing put back. */
    readonly?: boolean
    /** The head is the page's, where the list is drawn inside a fold. */
    headless?: boolean
    testid?: string
    selection?: RowSelection
    leave?: (el: Element, done: () => void) => void
  }>(),
  { readonly: false, headless: false, testid: undefined, selection: undefined, leave: undefined },
)

const emit = defineEmits<{
  buy: [line: ShoppingLine]
  unbuy: [line: ShoppingLine]
  open: [line: ShoppingLine]
  lift: [line: ShoppingLine, event: PointerEvent]
}>()

const before = computed(() => props.list === ITEM_MODE_BUY_BEFORE)

/** What the head counts: what stands under it, as M25's head does. */
const count = computed(() =>
  props.shelf.open > 0 ? t('shopping.openCount', { n: props.shelf.open }) : null,
)

/** Said only when nothing of the list is open anywhere — the block above included. */
const empty = computed(() => props.shelf.open === 0 && props.dueElsewhere === 0)

/**
 * FR-25.11j's reveal, M25's *erledigt* fold: off by default and not carried
 * across a visit — its off-state is the safe one.
 */
const showBought = ref(false)

function sectionTitle(section: ShoppingSection): string {
  if (section.packing) return t('shopping.packingList')
  if (section.own) return t('shopping.ownEntries')
  return section.name ?? ''
}

/** „gekauft von Andy · heute 14:32" — who bought the line, and when. */
function boughtStamp(line: ShoppingLine): string | null {
  return boughtStampText(line.boughtAt, line.boughtBy, props.nameOf)
}
</script>

<template>
  <section class="list" :data-testid="testid ?? (before ? 'm6-before' : 'm6-local')">
    <SectionHead
      v-if="!headless"
      :title="t(before ? 'shopping.beforeDeparture' : 'shopping.atDestination')"
      :count="count"
    />
    <InlineHint v-if="empty && !readonly" class="hint-wide" data-testid="m6-list-empty">{{
      t(before ? 'shopping.emptyBefore' : 'shopping.emptyLocal')
    }}</InlineHint>
    <IonList v-if="shelf.sections.length > 0" class="groups">
      <ListGroup
        v-for="section in shelf.sections"
        :key="section.key"
        :title="sectionTitle(section)"
        :drop-target="dropKey(section)"
        :droppable="!readonly && dropTag(section) !== undefined"
        :data-testid="`m6-group-${section.packing ? 'packing' : section.own ? 'own' : `tag-${section.name}`}`"
      >
        <ShoppingRows
          :lines="section.lines"
          :today="today"
          :selection="readonly ? undefined : selection"
          :readonly="readonly"
          :leave="leave"
          @buy="emit('buy', $event)"
          @open="emit('open', $event)"
          @lift="(line, e) => emit('lift', line, e)"
        />
      </ListGroup>
    </IonList>

    <!-- FR-25.11j + M25's fold: what was bought from this list, at its end. -->
    <template v-if="bought.length > 0">
      <button
        type="button"
        class="bought-toggle"
        :class="{ open: showBought }"
        :aria-expanded="showBought ? 'true' : 'false'"
        data-testid="m6-bought-bar"
        @click="showBought = !showBought"
      >
        <IonIcon :icon="chevronForwardOutline" class="caret" aria-hidden="true" />
        {{ t('shopping.boughtFold', { n: bought.length }) }}
      </button>
      <IonList v-if="showBought" class="groups" data-testid="m6-bought-list">
        <IonItem v-for="line in bought" :key="line.key" class="bought" data-testid="m6-bought-row">
          <IonLabel
            :class="{ tappable: !!line.edit && !readonly }"
            data-testid="m6-bought-label"
            @click="line.edit && !readonly && emit('open', line)"
          >
            <h3>{{ line.name }}</h3>
            <div class="facts">
              <!-- FR-30.9: the fold is flat, so the tag is said in the row. -->
              <span v-if="line.tag" class="fact" data-testid="m6-bought-tag">{{ line.tag }}</span>
              <span v-if="line.boughtNote" class="fact" data-testid="m6-bought-note">{{
                line.boughtNote
              }}</span>
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
            </div>
          </IonLabel>
          <IonCheckbox
            slot="end"
            class="tick"
            :checked="true"
            :disabled="readonly"
            :aria-label="t('shopping.undoBought', { name: line.name })"
            @ionChange="emit('unbuy', line)"
          />
        </IonItem>
      </IonList>
    </template>
  </section>
</template>

<style scoped>
.list :deep(.section-head) {
  margin: 18px 16px 4px;
}

.hint-wide {
  margin: 4px 18px 8px;
}

/* The groups sit in one list per section, full width, as M25's do. */
.groups {
  padding: 0;
  background: transparent;
}

/* M25's *erledigt* fold (`TripTodoList.vue`), for what was bought. */
.bought-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  padding: 6px 16px;
  border: none;
  background: none;
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.bought-toggle .caret {
  transition: transform 0.15s;
}

.bought-toggle.open .caret {
  transform: rotate(90deg);
}

.bought ion-label {
  color: var(--ct-subtext0);
}

.bought h3 {
  text-decoration: line-through;
}

.tappable {
  cursor: pointer;
}

.facts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  font-size: var(--jp-text-sm);
}

.fact {
  white-space: nowrap;
}

.recipients {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.tick {
  margin-inline-start: 4px;
}
</style>
