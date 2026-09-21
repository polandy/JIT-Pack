<script setup lang="ts">
/**
 * M6 — the shopping list (FR-3.2, FR-30).
 *
 * Two lists, *Vor der Abreise* and *Vor Ort*, each read from every source
 * the composition root provides (`lib/shoppingSources.ts`) plus the list's
 * own entries. What a line *is* — a packing row bought rather than packed, or
 * „Milch" typed here — is its source's business; this screen renders lines,
 * checks them off and puts them back, and never learns which. That is the
 * module boundary of FR-30.3 (ADR-066): nothing here imports packing code,
 * and a packing line's check-off writes FR-3.3/FR-25.11j through the write
 * its source bound into it.
 *
 * The field at the top adds an entry of the list's own, to the open tab: it
 * is on the shopping list alone and counts towards no packing figure. Adding
 * a packing row in a buy mode is the packing list's job (M4), where the item
 * and its mode are chosen.
 */
import {
  IonPage,
  IonContent,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonList,
  IonItemGroup,
  IonItemDivider,
  IonItem,
  IonCheckbox,
  IonInput,
  IonButton,
  IonIcon,
  IonFab,
  IonFabButton,
} from '@ionic/vue'
import { addOutline, bagHandleOutline, closeOutline } from 'ionicons/icons'
import { computed, inject, onMounted, ref } from 'vue'

import EmptyState from '@/components/global/EmptyState.vue'
import RevealBar from '@/components/global/RevealBar.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import UserAvatar from '@/components/global/UserAvatar.vue'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import { useOrchestrator } from '@/composables/useOrchestrator'
import { useTripScreen } from '@/composables/useTripScreen'
import { useTripIdentity } from '@/composables/useTripIdentity'
import { t } from '@/i18n'
import { FAB_ANCHOR } from '@/lib/fabAnchors'
import { boughtStampText } from '@/lib/rowFacts'
import { SHOPPING_SOURCES, type ShoppingLine } from '@/lib/shoppingSources'
import type { ShoppingMode } from '@/types/domain'
import { ITEM_MODE_BUY_BEFORE, ITEM_MODE_BUY_LOCAL, TRIP_STATUS_PLANNING } from '@/types/domain'
import { isPackingClosed } from '@/lib/tripPhase'
import { createShoppingActions, ownEntriesSource } from './actions'
import { buildSections, listInFocus } from './list'
import ShoppingTagChooser from './ShoppingTagChooser.vue'
import { useShoppingStore } from './store'

const props = defineProps<{ tripId: string }>()

const orchestrator = useOrchestrator()
const shoppingStore = useShoppingStore()
const actions = createShoppingActions(orchestrator.moduleHost)
const own = ownEntriesSource(shoppingStore, actions)
// Absent in a spec that provides none: the list still works on its own.
const sources = inject(SHOPPING_SOURCES, [])

/**
 * FR-25.11j's reveal, shaped like M4's *Erledigte* bar (FR-25.2): off by
 * default, one tap, and the count in the label so the bar states what it is
 * hiding. Deliberately **not** carried across a session the way FR-25.18
 * carries M4's switch: that rule is about not re-picking a filter of four
 * facet values, and it does not reach a single tap whose off-state is the
 * safe one — the more so as the tab itself is not remembered either, so a
 * restored reveal would open on a list the reader did not choose.
 */
const showBought = ref(false)

// ADR-033: whether this trip's rows are here — the entries travel the same
// partition as the packing rows. „Nothing to buy" is a sentence somebody
// leaves the house on, and a partition still in flight is not it.
const { trip, loaded: rowsLoaded, ensure } = useTripScreen(props.tripId, orchestrator)

/**
 * The tab the reader picked; none yet means the trip decides (FR-30.8).
 *
 * Until the trip itself is on the device there is nothing to decide with, and
 * *Vor der Abreise* is the answer that cannot be wrong for a trip nobody has
 * left on yet — a rule read off an absent trip would open a planned trip at
 * the destination and then move the tab under the reader.
 */
const chosen = ref<ShoppingMode | null>(null)
const tab = computed<ShoppingMode>(() => {
  if (chosen.value !== null) return chosen.value
  if (!trip.value) return ITEM_MODE_BUY_BEFORE
  return listInFocus({
    planned: trip.value.status === TRIP_STATUS_PLANNING,
    packingClosed: isPackingClosed(trip.value),
  })
})

// FR-30.4: a purchase is named from the trip's participants, the way every
// other stamp on the trip is — empty in Local Mode, where nobody is named.
const { nameOf, load: loadIdentity } = useTripIdentity(props.tripId, orchestrator)
onMounted(async () => {
  await ensure()
  await loadIdentity()
})

/** „gekauft von Andy · heute 14:32" — who bought the line, and when. */
function boughtStamp(line: ShoppingLine): string | null {
  return boughtStampText(line.boughtAt, line.boughtBy, nameOf)
}

function openLines(list: ShoppingMode) {
  return {
    own: own.open(props.tripId, list),
    sourced: sources.flatMap((source) => source.open(props.tripId, list)),
  }
}

const open = computed(() => openLines(tab.value))
const sections = computed(() => buildSections(open.value.own, open.value.sourced))

/** Flattened: the reveal is a short list of what left, not a second screen. */
const boughtLines = computed(() => [
  ...own.bought(props.tripId, tab.value),
  ...sources.flatMap((source) => source.bought(props.tripId, tab.value)),
])

function tabCount(list: ShoppingMode): number {
  const lines = openLines(list)
  return lines.own.length + lines.sourced.length
}

/*
 * ADR-033 for the labels above the note: until the trip partition is here,
 * „Vor der Abreise (0)" states the same absence the body declines to state,
 * and in the form a reader trusts more. The count returns the moment it is a
 * measurement — a genuinely empty tab is worth naming.
 */
const beforeTabLabel = computed(() =>
  rowsLoaded.value
    ? t('shopping.beforeDepartureCount', { n: tabCount(ITEM_MODE_BUY_BEFORE) })
    : t('shopping.beforeDeparture'),
)
const localTabLabel = computed(() =>
  rowsLoaded.value
    ? t('shopping.atDestinationCount', { n: tabCount(ITEM_MODE_BUY_LOCAL) })
    : t('shopping.atDestination'),
)

/** The recipients, named in roster order (FR-25.6). */
function recipientNames(line: ShoppingLine): string {
  return line.recipients.map((recipient) => recipient.name).join(', ')
}

const draft = ref('')

const content = ref<InstanceType<typeof IonContent> | null>(null)
const field = ref<InstanceType<typeof IonInput> | null>(null)

/**
 * FR-30.6: the ＋ takes the reader to the field, wherever the list was
 * scrolled to — M4's gesture for adding, on a screen whose field is always
 * there. No animation: the next thing is typing, and a scroll still in
 * flight would be what the keyboard opens over.
 */
async function goToField() {
  await (content.value?.$el as HTMLIonContentElement | undefined)?.scrollToTop(0)
  await (field.value?.$el as HTMLIonInputElement | undefined)?.setFocus()
}

/*
 * FR-30.9: the tag the next entry is filed under. It stays after an add — the
 * things for one shop are typed one after another — and only the reader
 * clears it, by tapping the chip again.
 */
const draftTag = ref<string | null>(null)

/**
 * The tags on offer: those still in use on this trip, plus those made in this
 * visit — a tag nobody carries yet must stay a chip, or unselecting it would
 * make it disappear.
 */
const tagChips = computed(() => {
  const names = new Set(shoppingStore.tagCounts(props.tripId).map((entry) => entry.tag))
  for (const tag of [...madeTags.value, ...(draftTag.value ? [draftTag.value] : [])]) names.add(tag)
  return [...names].sort((a, b) => a.localeCompare(b))
})

function toggleDraftTag(tag: string) {
  draftTag.value = draftTag.value === tag ? null : tag
  if (draftTag.value !== null && !madeTags.value.includes(draftTag.value)) {
    madeTags.value.push(draftTag.value)
  }
}

/** FR-30.1: an entry of the list's own, on the open tab. */
function addEntry() {
  if (draft.value.trim() === '') return
  actions.addEntry(props.tripId, tab.value, draft.value, draftTag.value)
  draft.value = ''
}

/**
 * The entry sheet (FR-30.9): the name and the tag, like the packing list's
 * creation sheet. One mask for two acts — adding an entry (opened from the
 * composer's ＋ Tag, carrying what was typed there) and editing one that
 * exists (a tap on its name) — so `line` is what tells them apart.
 */
const entrySheet = ref<{
  line: ShoppingLine | null
  name: string
  tag: string | null
} | null>(null)

/** Tags made in this visit, kept as chips even while no entry carries them yet. */
const madeTags = ref<string[]>([])

function openAddSheet() {
  entrySheet.value = { line: null, name: draft.value, tag: draftTag.value }
}

/** An existing entry, from a tap on its name; a source's line has nothing to edit. */
function openEditSheet(line: ShoppingLine) {
  if (!line.edit) return
  entrySheet.value = { line, name: line.name, tag: line.tag ?? null }
}

function chooseSheetTag(tag: string | null) {
  if (entrySheet.value) entrySheet.value.tag = tag
  if (tag !== null && !madeTags.value.includes(tag)) madeTags.value.push(tag)
}

function confirmEntrySheet() {
  const sheet = entrySheet.value
  if (!sheet || sheet.name.trim() === '') return
  if (sheet.line?.edit) {
    sheet.line.edit({ name: sheet.name, tag: sheet.tag })
  } else {
    actions.addEntry(props.tripId, tab.value, sheet.name, sheet.tag)
    draft.value = ''
    draftTag.value = sheet.tag
  }
  entrySheet.value = null
}

// ADR-050: the frame renders this page head, above the outlet.
setHeaderTitle(
  () => t('shopping.title'),
  () => trip.value?.name,
)
</script>

<template>
  <IonPage>
    <IonContent ref="content" class="shop-content" data-testid="m6-page">
      <!-- ADR-011: a view switcher is page content, not header chrome. -->
      <IonSegment :value="tab" @ionChange="(e: CustomEvent) => (chosen = e.detail.value)">
        <IonSegmentButton :value="ITEM_MODE_BUY_BEFORE" data-testid="m6-tab-before">
          <IonLabel>{{ beforeTabLabel }}</IonLabel>
        </IonSegmentButton>
        <IonSegmentButton :value="ITEM_MODE_BUY_LOCAL" data-testid="m6-tab-local">
          <IonLabel>{{ localTabLabel }}</IonLabel>
        </IonSegmentButton>
      </IonSegment>

      <form class="add" data-testid="m6-add" @submit.prevent="addEntry">
        <IonInput
          ref="field"
          v-model="draft"
          class="add-input"
          :placeholder="t('shopping.addPlaceholder')"
          :aria-label="t('shopping.addPlaceholder')"
          enterkeyhint="done"
          data-testid="m6-add-input"
          @keyup.enter="addEntry"
        />
        <IonButton
          type="submit"
          fill="clear"
          :disabled="draft.trim() === ''"
          :aria-label="t('shopping.addLabel')"
          data-testid="m6-add-submit"
        >
          <IonIcon slot="icon-only" :icon="addOutline" aria-hidden="true" />
        </IonButton>
      </form>

      <!-- FR-30.9: the tag the next entry is filed under. -->
      <div class="chips" role="group" :aria-label="t('shopping.tags')" data-testid="m6-tag-chips">
        <button
          v-for="tag in tagChips"
          :key="tag"
          type="button"
          class="chip"
          :aria-pressed="draftTag === tag"
          data-testid="m6-tag-chip"
          @click="toggleDraftTag(tag)"
        >
          {{ tag }}
        </button>
        <button type="button" class="chip chip-add" data-testid="m6-tag-new" @click="openAddSheet">
          {{ t('shopping.tagAdd') }}
        </button>
      </div>

      <IonList v-if="sections.length > 0">
        <IonItemGroup
          v-for="section in sections"
          :key="section.key"
          :data-testid="`m6-group-${section.own ? 'own' : section.tagged ? `tag-${section.name}` : (section.name ?? 'none')}`"
        >
          <IonItemDivider>
            <IonLabel>{{
              section.own ? t('shopping.ownEntries') : (section.name ?? t('shopping.uncategorized'))
            }}</IonLabel>
          </IonItemDivider>
          <IonItem v-for="line in section.lines" :key="line.key" data-testid="m6-row">
            <!-- FR-30.9: a tap on an own entry's name files it under a tag. -->
            <IonLabel
              :class="{ tappable: !!line.edit }"
              :role="line.edit ? 'button' : undefined"
              :tabindex="line.edit ? 0 : undefined"
              data-testid="m6-row-label"
              @click="openEditSheet(line)"
              @keyup.enter="openEditSheet(line)"
            >
              <h3>{{ line.name }}</h3>
              <p v-if="line.quantity > 1">{{ line.quantity }}×</p>
              <!-- FR-25.6: for whom, derived from membership — never a control. -->
              <p v-if="line.recipients.length > 0" class="recipients" data-testid="m6-row-for">
                <UserAvatar
                  v-for="recipient in line.recipients"
                  :key="recipient.id"
                  :name="recipient.name"
                  :seed="recipient.id"
                  :size="18"
                />
                <span>{{ t('shopping.forWhom', { names: recipientNames(line) }) }}</span>
              </p>
              <p v-if="line.edit && !line.tag" class="tag-add" data-testid="m6-row-tag-add">
                {{ t('shopping.tagAdd') }}
              </p>
            </IonLabel>
            <IonButton
              v-if="line.remove"
              slot="end"
              fill="clear"
              :aria-label="t('shopping.remove', { name: line.name })"
              data-testid="m6-row-remove"
              @click="line.remove()"
            >
              <IonIcon slot="icon-only" :icon="closeOutline" aria-hidden="true" />
            </IonButton>
            <!-- FR-30.9: the check-off sits at the end, where the thumb rests. -->
            <IonCheckbox
              slot="end"
              :checked="false"
              :aria-label="t('shopping.bought', { name: line.name })"
              @ionChange="line.buy()"
            />
          </IonItem>
        </IonItemGroup>
      </IonList>

      <EmptyState
        v-else-if="!rowsLoaded"
        :title="t('shopping.listUnknown')"
        testid="m6-list-loading"
      />

      <!-- Empty state (G-7) -->
      <EmptyState
        v-else
        :icon="bagHandleOutline"
        :title="t(tab === ITEM_MODE_BUY_BEFORE ? 'shopping.emptyBefore' : 'shopping.emptyLocal')"
        :hint="t('shopping.emptyHint')"
        testid="m6-empty"
      />

      <!-- FR-25.11j: what was bought from this list. Same affordance as M4's
           FR-25.2 done bar — the count is in the label, and one tap reveals. -->
      <RevealBar
        v-if="boughtLines.length > 0"
        :open="showBought"
        :label="
          showBought
            ? t('shopping.hideBought', { n: boughtLines.length })
            : t('shopping.showBought', { n: boughtLines.length })
        "
        testid="m6-bought-bar"
        @toggle="showBought = !showBought"
      />

      <IonList v-if="showBought && boughtLines.length > 0" data-testid="m6-bought-list">
        <IonItem v-for="line in boughtLines" :key="line.key" data-testid="m6-bought-row">
          <IonLabel>
            <h3>{{ line.name }}</h3>
            <!-- FR-30.9: the reveal is flat, so the tag has to be said in the row. -->
            <p v-if="line.tag" class="tag-chip" data-testid="m6-bought-tag">{{ line.tag }}</p>
            <p v-if="line.boughtNote" data-testid="m6-bought-note">{{ line.boughtNote }}</p>
            <!-- FR-30.4: who bought it, and when. -->
            <p v-if="boughtStamp(line)" class="recipients" data-testid="m6-bought-stamp">
              <UserAvatar
                v-if="line.boughtBy && nameOf(line.boughtBy)"
                :name="nameOf(line.boughtBy)"
                :seed="line.boughtBy"
                :size="18"
              />
              <span>{{ boughtStamp(line) }}</span>
            </p>
          </IonLabel>
          <IonButton
            v-if="line.remove"
            slot="end"
            fill="clear"
            :aria-label="t('shopping.remove', { name: line.name })"
            data-testid="m6-bought-remove"
            @click="line.remove()"
          >
            <IonIcon slot="icon-only" :icon="closeOutline" aria-hidden="true" />
          </IonButton>
          <IonCheckbox
            slot="end"
            :checked="true"
            :aria-label="t('shopping.undoBought', { name: line.name })"
            @ionChange="line.unbuy()"
          />
        </IonItem>
      </IonList>

      <!-- FR-30.9: name and tag — the packing list's creation sheet, for an entry. -->
      <SheetModal
        :is-open="entrySheet !== null"
        testid="m6-entry-sheet"
        @dismiss="entrySheet = null"
      >
        <section v-if="entrySheet" class="entry-sheet">
          <SheetHead
            :title="entrySheet.line ? t('shopping.entrySheetEdit') : t('shopping.entrySheetNew')"
            title-testid="m6-entry-title"
            close-testid="m6-entry-close"
            @close="entrySheet = null"
          />
          <IonInput
            :value="entrySheet.name"
            :label="t('shopping.entryName')"
            label-placement="stacked"
            fill="outline"
            data-testid="m6-entry-name"
            @ionInput="
              (e: CustomEvent) => entrySheet && (entrySheet.name = (e.detail.value as string) ?? '')
            "
            @keyup.enter="confirmEntrySheet"
          />
          <ShoppingTagChooser
            :tags="shoppingStore.tagCounts(tripId).map((entry) => entry.tag)"
            :assigned="entrySheet.tag"
            @choose="chooseSheetTag"
          />
          <div class="entry-sheet-actions">
            <IonButton
              :disabled="entrySheet.name.trim() === ''"
              data-testid="m6-entry-confirm"
              @click="confirmEntrySheet"
            >
              {{ entrySheet.line ? t('common.save') : t('common.add') }}
            </IonButton>
          </div>
        </section>
      </SheetModal>
      <!-- FR-30.6: M4's ＋, bottom right. The field it leads to stays at the
           top of the list, so the screen still has one way to add. -->
      <IonFab :id="FAB_ANCHOR.m6" slot="fixed" vertical="bottom" horizontal="end">
        <IonFabButton data-testid="m6-fab" :aria-label="t('common.add')" @click="goToField">
          <IonIcon :icon="addOutline" aria-hidden="true" />
        </IonFabButton>
      </IonFab>
    </IonContent>
  </IonPage>
</template>

<style scoped>
/* FR-25.11h's rule, for M6's FAB (FR-30.6): the list scrolls clear of its
   footprint, so the last row is never under the ＋. M4's measure. */
.shop-content {
  --padding-bottom: 96px;
}

.recipients {
  display: flex;
  align-items: center;
  gap: 6px;
}

.add {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 16px 0;
}

.add-input {
  flex: 1;
  min-height: 40px;
}

/* The ＋ is a control in a row of 40, not a 48 that pushes the chips below it down. */
.add ion-button {
  margin: 0;
  height: 40px;
}

/* FR-30.9: the tag the next entry is filed under. */
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 16px 8px;
}

.chip {
  padding: 5px 12px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-sunken);
  color: var(--ct-text);
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.chip[aria-pressed='true'] {
  border-color: var(--jp-action);
  color: var(--jp-action);
}

.chip-add {
  background: none;
  color: var(--ct-subtext0);
}

.chip:focus-visible {
  outline: 2px solid var(--jp-action);
  outline-offset: 2px;
}

.tappable {
  cursor: pointer;
}

.tag-add {
  color: var(--ct-subtext0);
}

.tag-chip {
  display: inline-block;
  padding: 1px 8px;
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-sunken);
  color: var(--ct-subtext0);
}

.entry-sheet {
  padding: 4px 18px 22px;
}

.entry-sheet-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
