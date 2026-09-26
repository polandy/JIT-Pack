<script setup lang="ts">
/**
 * One list of M6 — *Vor der Reise* or *Vor Ort* — on `ListSection`,
 * `FoldToggle` and `ListRow`, the components M25's phase is drawn with
 * (owner, 2026-09-26: one look and feel, guaranteed by one component): its head with what is
 * open under it, its tag groups, and **one** *gekauft* fold at its end. The
 * two lists used to be tabs, one hidden behind the other; they now stand one
 * under the other, with what is due now above both.
 *
 * A component because the page draws a list in two places: in reading
 * order, and — once nothing of it is open, or for *before* once the packing
 * is finished (FR-7.12) — inside its folded line at the end of the screen.
 *
 * The acts are reported, never written: the page owns the toast and the drag.
 */
import { IonLabel, IonList } from '@ionic/vue'
import { computed, ref } from 'vue'

import FoldToggle from '@/components/global/FoldToggle.vue'
import ListGroup from '@/components/global/ListGroup.vue'
import ListRow from '@/components/global/ListRow.vue'
import ListSection from '@/components/global/ListSection.vue'
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
      <FoldToggle
        v-if="!headless"
        :label="t('shopping.boughtFold', { n: bought.length })"
        :open="showBought"
        testid="m6-bought-bar"
        @toggle="showBought = !showBought"
      />
      <IonList v-if="showBought || headless" class="list-groups" data-testid="m6-bought-list">
        <ListRow
          v-for="line in bought"
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
            <h3 class="row-name">{{ line.name }}</h3>
          </IonLabel>
          <template v-if="line.tag || line.boughtNote || boughtStamp(line)" #facts>
            <!-- FR-30.9: the fold is flat, so the tag is said in the row. -->
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
        </ListRow>
      </IonList>
    </template>
  </ListSection>
</template>

<style scoped>
.tappable {
  cursor: pointer;
}

.recipients {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
</style>
