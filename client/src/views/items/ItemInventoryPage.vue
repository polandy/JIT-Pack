<script setup lang="ts">
/**
 * M9 — Item Inventory (§3.24, FR-24.2/24.4/24.6/24.7/24.11)
 *
 * The master item database, and deliberately a **lookup surface rather
 * than a spreadsheet**: every row is the primary-tag avatar and the name,
 * nothing else — all tags, the weight and the price on every row read as
 * overload.
 *
 * **The tools do not leave (FR-24.6).** Search and the tag chips — with the
 * sheet that also sets the sort — sit in a bar that stays while the list scrolls, and the group headings
 * stick underneath it. Measured against the family instance the list is
 * 10 391 px against a 671 px viewport — fifteen screens, and tools that
 * scrolled away would leave no heading, no axis and no field after two.
 *
 * **Search is the screen's main route, so it is not behind the magnifier**
 * (the one G-12 exception, FR-24.6): on a 184-row database looking something
 * up is what the screen is *for*, and every lookup paid a tap to reveal the
 * field. The matching rule is `domain/itemSearch` (FR-24.7) — it folds both
 * spellings of an umlaut and reaches tags and marks, and it says *why* a row
 * matched so the results can be grouped by it.
 *
 * What the list shows beyond the name is a *device-local* preference in the
 * head of that sheet (FR-24.4) — the weight-focused packer and the
 * price-focused shopper get the same mechanism instead of one compromise.
 *
 * Grouping is by **primary tag** (FR-24.2), so an item on three axes still
 * occupies one row; the chip axis filters by *any* of an item's tags, which
 * is the reach the single category could not give.
 *
 * The page is the wiring: `useInventoryCore` holds what every part reads, and
 * the concerns live beside it in `inventory/`.
 */
import { IonPage, IonContent, IonIcon, IonFab, IonFabButton, IonButton } from '@ionic/vue'
import { addOutline, cloudUploadOutline, cubeOutline } from 'ionicons/icons'
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useMasterStore } from '@/stores/masterStore'
import { useOrchestrator } from '@/composables/useOrchestrator'
import { useInventoryHygiene } from '@/composables/useInventoryHygiene'
import EmptyState from '@/components/global/EmptyState.vue'
import TagFilterSheet from '@/components/items/TagFilterSheet.vue'
import GroupJumpSheet from '@/components/items/GroupJumpSheet.vue'
import TagManagerSheet from '@/components/items/TagManagerSheet.vue'
import MarkPicker from '@/components/items/MarkPicker.vue'
import CreateItemSheet from '@/components/items/CreateItemSheet.vue'
import SearchOfferButton from '@/components/items/SearchOfferButton.vue'
import { FAB_ANCHOR } from '@/lib/fabAnchors'
import { t } from '@/i18n'
import { PATH } from '@/router/paths'
import InventoryBulkSheets from './inventory/InventoryBulkSheets.vue'
import InventoryGroupList from './inventory/InventoryGroupList.vue'
import InventoryViewHead from './inventory/InventoryViewHead.vue'
import InventoryTools from './inventory/InventoryTools.vue'
import { useGroupJump } from './inventory/useGroupJump'
import { useInventoryCore } from './inventory/useInventoryCore'
import { useInventoryHeader } from './inventory/useInventoryHeader'
import { useSearchOffer } from './inventory/useSearchOffer'
import { useTagManagement } from './inventory/useTagManagement'

const masterStore = useMasterStore()
const orchestrator = useOrchestrator()
const router = useRouter()

const core = useInventoryCore()
const {
  props,
  sort,
  selection,
  filterMode,
  filterOpen,
  tagsOpen,
  isEmpty,
  itemsKnown,
  knownEmpty,
  selecting,
  canAssign,
  counts,
  untaggedCount,
  hitsOutsideFilter,
  shownCount,
  noResults,
  filterName,
  filtering,
} = core

useInventoryHeader(core)

/** FR-24.12: how many findings M24 would list — the foot note's number. */
const { report: hygiene } = useInventoryHygiene()

const { tagUsage, renameTag, mergeTag, mergeTagsSelected, removeTag, markingTag, onTagMarkPicked } =
  useTagManagement()

const {
  offer,
  createOpen,
  freshId,
  createTagIds,
  preferredTagIds,
  takeOffer,
  onSearchSubmit,
  onCreated,
} = useSearchOffer(core)

const {
  jumpOpen,
  jumpGroups,
  canJump,
  registerSection,
  currentGroup,
  requestJump,
  onJumpDismissed,
  openJump,
  toolsHeight,
} = useGroupJump(core)

function newItem() {
  // FR-24.5: creation is the editor in its minimal mode, not a prompt —
  // a name typed into an alert cannot carry tags or a weight.
  router.push(PATH.newItem)
}

/** How many items FR-24.3 has hidden from this list (ADR-032). */
const retiredCount = computed(() => masterStore.retiredItemList.length)
</script>

<template>
  <IonPage>
    <IonContent ref="content">
      <!-- FR-24.6: the tools stay while the list moves. -->
      <InventoryTools
        v-if="!knownEmpty"
        ref="tools"
        :core="core"
        :style="{ '--m9-tools-height': `${toolsHeight}px` }"
        @submit="onSearchSubmit"
      />

      <!-- FR-24.11: the name the search did not find, offered at the top —
           with the keyboard up, the end of a list of partial hits is out of
           reach. The same place whether or not anything matched. -->
      <SearchOfferButton v-if="offer" :offer="offer" testid="m9-offer" @take="takeOffer" />

      <!-- ADR-033: an inventory that has not arrived is not an empty one. -->
      <EmptyState
        v-if="isEmpty && !itemsKnown"
        :title="t('items.listUnknown')"
        testid="m9-list-loading"
      />

      <!-- G-7 empty state — M15 is the way in from here. -->
      <EmptyState
        v-else-if="isEmpty"
        :icon="cubeOutline"
        :title="t('items.empty')"
        :hint="t('items.emptyHint')"
        testid="m9-empty"
      >
        <IonButton
          fill="outline"
          size="small"
          :router-link="PATH.importSpreadsheet"
          data-testid="m9-import"
        >
          <IonIcon slot="start" :icon="cloudUploadOutline" />
          {{ t('items.importSpreadsheet') }}
        </IonButton>
      </EmptyState>

      <!-- FR-24.7: a dead end says what caused it and how many rows lie
           outside it, rather than being a bare "nothing found". -->
      <EmptyState
        v-else-if="noResults"
        :title="
          filterName
            ? t('items.noMatchInTag', { tag: filterName })
            : filtering
              ? t('items.noMatchInFilter')
              : t('items.noMatch')
        "
        :hint="
          hitsOutsideFilter.length > 0
            ? t('items.noMatchElsewhere', { n: hitsOutsideFilter.length })
            : undefined
        "
        testid="m9-no-match"
      >
        <IonButton
          v-if="filtering"
          fill="outline"
          size="small"
          data-testid="m9-search-everywhere"
          @click="selection = []"
        >
          {{ hitsOutsideFilter.length > 0 ? t('items.searchAll') : t('items.clearFilter') }}
        </IonButton>
      </EmptyState>

      <InventoryGroupList
        v-else
        :core="core"
        :fresh-id="freshId"
        :can-jump="canJump"
        :tools-height="toolsHeight"
        :register-section="registerSection"
        @jump="openJump"
      />

      <!--
        The foot of the list: what the screen is *not* showing, in two
        sentences that are each the way to it. One block, so the clearance
        the FAB needs is paid once below both rather than between them.

        FR-24.12 first: what a cleanup rule found — a sentence here rather
        than a banner over a list that is not wrong, only untidy.

        FR-24.3's other half, said out loud. A retired item is hidden from
        this list by design (ADR-032); without a sentence admitting the
        hidden ones exist, „25 Artikel" would read as the whole collection,
        and the way back to them (M23) would be reachable only by someone
        who already knew it was there.

        Both behind `itemsKnown` for ADR-033's reason: a partition that has
        not arrived has no findings and no retired rows, and „nothing to
        tidy" and „nothing is hidden" are claims.
      -->
      <div
        v-if="itemsKnown && !selecting && (hygiene.total > 0 || retiredCount > 0)"
        class="retired-note"
      >
        <button
          v-if="hygiene.total > 0"
          type="button"
          data-testid="m9-cleanup-note"
          @click="router.push(PATH.inventoryCleanup)"
        >
          {{ t('items.cleanupHint', { n: hygiene.total }) }}
        </button>
        <button
          v-if="retiredCount > 0"
          type="button"
          data-testid="m9-retired-note"
          @click="router.push(PATH.masterRetired)"
        >
          {{ t('items.retiredHint', { n: retiredCount }) }}
        </button>
      </div>

      <!-- FR-24.9: what the selection can be acted on with. -->
      <InventoryBulkSheets :core="core" />

      <IonFab v-if="!selecting" :id="FAB_ANCHOR.m9" vertical="bottom" horizontal="end" slot="fixed">
        <IonFabButton :aria-label="t('items.new')" data-testid="m9-fab" @click="newItem">
          <IonIcon :icon="addOutline" />
        </IonFabButton>
      </IonFab>

      <CreateItemSheet
        :is-open="createOpen"
        :name="offer?.name ?? ''"
        :tag-ids="createTagIds"
        :preferred-tag-ids="preferredTagIds"
        @dismiss="createOpen = false"
        @created="onCreated"
      />

      <!-- FR-24.8: everything the three chips do not offer; its head is the
           list's shape — sort and shown properties (FR-24.4, UX-05). -->
      <TagFilterSheet
        :is-open="filterOpen"
        :tags="masterStore.tagList"
        :counts="counts"
        :untagged-count="untaggedCount"
        :selection="selection"
        :mode="filterMode"
        :shown="shownCount"
        @dismiss="filterOpen = false"
        @update:selection="selection = $event"
        @update:mode="filterMode = $event"
      >
        <template #view>
          <InventoryViewHead
            :sort="sort"
            :can-assign="canAssign"
            :properties="props"
            @update:sort="sort = $event"
          />
        </template>
      </TagFilterSheet>

      <!-- FR-24.10: where a tag itself is renamed, merged, reordered, deleted. -->
      <TagManagerSheet
        :is-open="tagsOpen"
        :tags="masterStore.tagList"
        :counts="tagUsage"
        @dismiss="tagsOpen = false"
        @rename="renameTag"
        @merge="mergeTag"
        @merge-many="mergeTagsSelected"
        @remove="removeTag"
        @move="orchestrator.reorderTags"
        @mark="markingTag = $event"
      />

      <!-- FR-24.13: a tag's mark, chosen with the item mark's own picker. -->
      <MarkPicker
        :is-open="markingTag !== null"
        :name="markingTag?.name ?? ''"
        :current="markingTag?.icon ?? null"
        @pick="onTagMarkPicked"
        @close="markingTag = null"
      />

      <GroupJumpSheet
        :is-open="jumpOpen"
        :groups="jumpGroups"
        :current="currentGroup"
        @dismiss="onJumpDismissed"
        @jump="requestJump"
      />
    </IonContent>
  </IonPage>
</template>

<style scoped>
/* A note, not a row: it reports on what the list does *not* contain, so it
   must not read as one more item in it.

   The wrapper is what spans the width; the button is only as wide as its
   own text. A full-width tap target here runs under the FAB, and the
   rendered screen is the only thing that says so — every tap on the right
   third would have opened the item editor instead of M23. The bottom
   padding clears the FAB for the same reason, so the note can be read as
   well as hit. */
.retired-note {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 18px 4px 96px;
}

.retired-note button {
  background: none;
  border: 0;
  padding: 10px 14px;
  color: var(--ct-overlay2);
}
</style>
