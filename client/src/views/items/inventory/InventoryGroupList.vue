<script setup lang="ts">
/**
 * M9's list: the groups — by primary tag, one alphabetical run, or the search
 * results by why they matched (FR-24.2/24.6/24.7) — and their rows, which
 * carry only what the device asked for (FR-24.4).
 */
import { IonIcon, IonItem, IonLabel, IonList } from '@ionic/vue'
import { chevronForwardOutline, personOutline } from 'ionicons/icons'
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import ListGroup from '@/components/global/ListGroup.vue'
import SelectBox from '@/components/global/SelectBox.vue'
import ItemMark from '@/components/items/ItemMark.vue'
import { type MatchReason } from '@/domain/itemSearch'
import { UNTAGGED_KEY } from '@/domain/tags'
import { t } from '@/i18n'
import { formatValue, formatWeight } from '@/lib/format'
import { itemPath } from '@/router/paths'
import { useMasterStore } from '@/stores/masterStore'
import type { MasterItem } from '@/types/domain'

import type { InventoryCore } from './useInventoryCore'

const { core, freshId, canJump, toolsHeight, registerSection } = defineProps<{
  core: InventoryCore
  /** The row FR-24.11 just created or restored, marked until the query changes. */
  freshId: string | null
  canJump: boolean
  /** The tool bar's height, which the headings stick beneath (FR-24.6). */
  toolsHeight: number
  /** Hands each group's element to the jump, by its key (FR-24.8). */
  registerSection: (key: string, ref: unknown) => void
}>()

defineEmits<{ jump: [] }>()

const masterStore = useMasterStore()
const router = useRouter()
const { searching, resultGroups, groups, rows, selecting, selected, viaOf, groupLabel } = core
const properties = core.props

/**
 * A tap on a row: while selecting it picks the row, otherwise it opens the
 * item (FR-24.9). A navigation in code rather than a `routerLink`, so the
 * release after a hold — spent by `rows.click` — never opens the editor.
 */
function onRowClick(item: MasterItem) {
  if (rows.click(item.id, true)) return
  void router.push(itemPath(item.id))
}

/** Tags by name — a group's key is its tag's name, and its heading carries the mark. */
const tagByName = computed(() => new Map(masterStore.tagList.map((tag) => [tag.name, tag])))

/** The mark a heading shows: its tag's (FR-24.13), none for a bucket or a search reason. */
function groupMark(key: string): string | null {
  return searching.value ? null : (tagByName.value.get(key)?.icon ?? null)
}

/**
 * The primary tag's mark, which an item without its own borrows on this
 * screen (FR-24.13) — the rung between the item's mark and the initial.
 */
function primaryTagMark(item: MasterItem): string | null {
  return masterStore.getItemTags(item.id)[0]?.icon ?? null
}

/**
 * Whether the group's heading names its rows' primary tag — grouped by tag,
 * outside the untagged bucket. Its rows then stop borrowing that tag's mark
 * or initial (G-15): the heading already shows it, once.
 */
function headedByTag(key: string): boolean {
  return !searching.value && core.sort.value === 'grouped' && key !== UNTAGGED_KEY
}

/**
 * The avatar glyph: the primary tag's initial, or a neutral one.
 *
 * Read from the item rather than from the heading it sits under, because
 * under FR-24.6/24.7 the heading is not always a tag: under „Treffer im Tag"
 * the key is the *reason*, and taking its initial would paint a column of „T"s
 * on rows filed under six different tags. The map is the same one the search
 * reads, so this costs no second pass (NFR-4.3).
 */
function avatarGlyph(item: MasterItem): string {
  const primary = core.tagNames.value.get(item.id)?.[0]
  return primary ? [...primary][0]!.toUpperCase() : '·'
}

function reasonLabel(reason: MatchReason): string {
  return t(`items.match.${reason}`)
}

/**
 * Who the row is usually somebody's job for (FR-1.9), or null — shown only
 * while the device asked for it. An item that names nobody shows **nothing**:
 * „Niemand" is the editor's empty state, and repeating it down a list is the
 * overload FR-24.4 took the columns away for.
 */
function assigneeOf(item: MasterItem): string | null {
  if (!properties.isShown('assignee') || !core.canAssign.value) return null
  return item.default_assignee_id ? core.userName(item.default_assignee_id) : null
}

function extrasFor(item: MasterItem): string[] {
  const extras: string[] = []
  if (properties.isShown('weight') && item.weight_grams !== null) {
    extras.push(formatWeight(item.weight_grams))
  }
  if (properties.isShown('price') && item.value_cents !== null) {
    extras.push(formatValue(item.value_cents))
  }
  return extras
}
</script>

<template>
  <IonList class="groups" :style="{ '--list-group-top': `${toolsHeight}px` }">
    <!-- FR-24.8: the heading is the jump control. The axis was used to
         *get somewhere*, not to filter — 3 of 184 items carry a second
         tag — so the navigation is named as navigation and the list
         stays whole. It stays under the tool bar while its rows scroll
         (FR-24.6). -->
    <ListGroup
      v-for="[key, groupItems] in searching ? resultGroups : groups"
      :key="key"
      :ref="(el) => registerSection(key as string, el)"
      :title="searching ? reasonLabel(key as MatchReason) : groupLabel(key)"
      :count="groupItems.length"
      sticky
      :jumpable="canJump"
      head-testid="m9-group-head"
      jump-testid="m9-jump-open"
      @jump="$emit('jump')"
    >
      <template v-if="groupMark(key)" #mark>
        <ItemMark :mark="groupMark(key)" surface="plain" :size="16" />
      </template>
      <IonItem
        v-for="item in groupItems"
        :key="item.id"
        button
        :detail="false"
        :data-selected="selecting && selected.has(item.id) ? 'true' : undefined"
        data-testid="m9-row"
        @click="onRowClick(item)"
        @pointerdown="(e: PointerEvent) => rows.press(item.id, e)"
        @pointermove="rows.move"
        @pointerup="rows.release"
        @pointercancel="rows.release"
        @contextmenu.prevent="rows.contextMenu(item.id)"
      >
        <!-- FR-24.9: a tap opens the item, a hold (or right-click) starts
             a selection with it; while selecting, the same tap picks the
             row. The whole row is the surface — M9 has no grip to share
             it with (ADR-075). No `routerLink`: its shadow anchor, left
             with an empty href while selecting, reloaded the app on a
             tap — which every bulk case, tapping rows in the mode, would
             see. -->
        <SelectBox
          v-if="selecting"
          slot="start"
          :on="selected.has(item.id)"
          :data-testid="`m9-row-check-${item.name}`"
        />
        <!-- FR-28.4 + FR-24.13: photo → mark → the primary tag's mark →
             the tag initial; under that tag's own heading the last two
             give way to an empty slot that holds the column (G-15). -->
        <ItemMark
          slot="start"
          :mark="item.icon ?? null"
          :tag-mark="primaryTagMark(item)"
          :headed="headedByTag(key as string)"
          surface="inventory"
          :photo-item="item"
          :initial="avatarGlyph(item)"
          :size="34"
          class="row-mark"
        />

        <IonLabel>
          <h2>
            {{ item.name }}
            <span v-if="item.id === freshId" class="row-new" data-testid="m9-row-new">{{
              t('items.rowNew')
            }}</span>
          </h2>
          <!-- FR-24.7: a row that matched through something other than
               its name says what, or it reads as a bug. -->
          <p v-if="searching && viaOf.get(item.id)" class="row-via" data-testid="m9-row-via">
            {{ t('items.matchVia', { via: viaOf.get(item.id)! }) }}
          </p>
          <!-- FR-1.9: whose job this usually is, where the device asked
               for it and there is an account to name (G-8). -->
          <p v-if="assigneeOf(item)" class="row-assignee" data-testid="m9-row-assignee">
            <IonIcon :icon="personOutline" />
            {{ assigneeOf(item) }}
          </p>
          <!-- FR-24.4: only when the device asked for them. -->
          <div v-if="properties.isShown('tags')" class="row-tags">
            <span v-for="tag in masterStore.getItemTags(item.id)" :key="tag.id" class="row-tag">
              {{ tag.name }}
            </span>
          </div>
        </IonLabel>

        <div v-if="extrasFor(item).length > 0" slot="end" class="row-extras">
          <span v-for="extra in extrasFor(item)" :key="extra">{{ extra }}</span>
        </div>
        <IonIcon v-if="!selecting" slot="end" :icon="chevronForwardOutline" class="row-chevron" />
      </IonItem>
    </ListGroup>
  </IonList>
</template>

<style scoped>
.row-new {
  margin-inline-start: 6px;
  padding: 0 7px;
  border: 1px solid var(--jp-done);
  border-radius: var(--jp-r-pill);
  color: var(--jp-done);
  font-size: var(--jp-text-xs);
  vertical-align: middle;
}

/* The tile itself lives in ItemMark with the ladder that decides when
   it shows (FR-28.4); only the row's own spacing stays here. */
.row-mark {
  margin-inline-end: 12px;
}

.row-via {
  color: var(--ion-color-medium);
  font-size: var(--jp-text-xs);
}

/* FR-1.9: one quiet line under the name, the weight of the „via" line above
   it — the account is context for the row, never its headline. */
.row-assignee {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--ct-subtext0);
}

.row-assignee ion-icon {
  font-size: var(--jp-icon-xs);
}

.row-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 4px;
}

.row-tag {
  padding: 2px 7px;
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-sunken);
  color: var(--ion-color-medium);
  font-size: var(--jp-text-xs);
}

.row-extras {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  color: var(--ion-color-medium);
  font-size: var(--jp-text-sm);
  white-space: nowrap;
}

.row-chevron {
  color: var(--ion-color-medium);
  font-size: var(--jp-icon-sm);
  margin-inline-start: 6px;
}
</style>
