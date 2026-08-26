<script setup lang="ts">
/**
 * M9 — Item Inventory (§3.24, FR-24.2/24.4)
 *
 * The master item database, and deliberately a **lookup surface rather
 * than a spreadsheet**: every row is the primary-tag avatar and the name,
 * nothing else. The earlier layout put all tags, the weight and the price
 * on every row and read as overload (owner, 2026-08-08).
 *
 * What the list shows beyond the name is a *device-local* preference
 * behind the eye icon (FR-24.4) — the weight-focused packer and the
 * price-focused shopper get the same mechanism instead of one compromise.
 *
 * Grouping is by **primary tag** (FR-24.2), so an item on three axes still
 * occupies one row; the chip axis filters by *any* of an item's tags, which
 * is the reach the single category could not give.
 */
import {
  IonPage,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonIcon,
  IonFab,
  IonFabButton,
  IonModal,
  IonRefresher,
  IonRefresherContent,
  IonSegment,
  IonSegmentButton,
  IonToggle,
  IonButton,
} from '@ionic/vue'
import {
  addOutline,
  chevronForwardOutline,
  cloudUploadOutline,
  cubeOutline,
  eyeOutline,
} from 'ionicons/icons'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMasterStore } from '@/stores/masterStore'
import ItemMark from '@/components/items/ItemMark.vue'
import SearchRow from '@/components/global/SearchRow.vue'
import { useContextSearch } from '@/composables/useContextSearch'
import { setHeaderActions, type HeaderAction } from '@/composables/useHeaderActions'
import {
  inventoryProperties,
  INVENTORY_PROPERTIES,
  type InventoryProperty,
} from '@/composables/useInventoryProperties'
import { UNTAGGED_KEY } from '@/domain/tags'
import { formatWeight } from '@/lib/format'
import { t } from '@/i18n'
import type { MasterItem } from '@/types/domain'

const store = useMasterStore()
const router = useRouter()
const { term: search, isOpen: searchOpen, toggle: toggleSearch, action } = useContextSearch()

const props = inventoryProperties()
const propsOpen = ref(false)

/** `null` = the "Alle" chip: no tag filter. */
const tagFilter = ref<string | null>(null)

setHeaderActions(() => {
  const eye: HeaderAction = {
    id: 'm9-properties',
    icon: eyeOutline,
    label: t('items.properties'),
    active: props.shownCount.value > 0,
    badge: props.shownCount.value,
    onClick: () => (propsOpen.value = true),
  }
  return [eye, action()]
})

/**
 * An item matches a tag filter when the tag is anywhere in its set — not
 * only when it is primary (FR-24.2). Filtering by *Sommer* has to surface
 * the swimsuit that is filed under *Kleidung*.
 */
const filtered = computed<MasterItem[]>(() => {
  const term = search.value.trim().toLowerCase()
  // The matching items are collected once from the assignment list; asking
  // each item for its tags would scan that list per row (NFR-4.3).
  const onTag =
    tagFilter.value === null
      ? null
      : new Set(store.itemTagList.filter((a) => a.tag_id === tagFilter.value).map((a) => a.item_id))
  return store.activeItemList.filter((item) => {
    if (term && !item.name.toLowerCase().includes(term)) return false
    return onTag === null || onTag.has(item.id)
  })
})

const groups = computed(() => store.itemsByPrimaryTag(filtered.value))

const isEmpty = computed(() => store.activeItemList.length === 0)
const noResults = computed(() => !isEmpty.value && filtered.value.length === 0)

/** The heading a group renders — the untagged bucket is not a tag name. */
function groupLabel(key: string): string {
  return key === UNTAGGED_KEY ? t('items.untagged') : key
}

/** The avatar glyph: the primary tag's initial, or a neutral one. */
function avatarGlyph(key: string): string {
  return key === UNTAGGED_KEY ? '·' : [...key][0]!.toUpperCase()
}

function extrasFor(item: MasterItem): string[] {
  const extras: string[] = []
  if (props.isShown('weight') && item.weight_grams !== null) {
    extras.push(formatWeight(item.weight_grams))
  }
  if (props.isShown('price') && item.value_cents !== null) {
    extras.push((item.value_cents / 100).toFixed(2))
  }
  return extras
}

function propertyLabel(key: InventoryProperty): string {
  return t(`items.property.${key}`)
}

function newItem() {
  // FR-24.5: creation is the editor in its minimal mode, not a prompt —
  // a name typed into an alert cannot carry tags or a weight.
  router.push('/items/new')
}

function handleRefresh(event: CustomEvent) {
  ;(event.target as HTMLIonRefresherElement).complete()
}
</script>

<template>
  <IonPage>
    <IonContent>
      <IonRefresher slot="fixed" @ionRefresh="handleRefresh">
        <IonRefresherContent />
      </IonRefresher>

      <SearchRow
        v-if="searchOpen || search"
        v-model="search"
        testid="items-search-input"
        :placeholder="t('items.searchPlaceholder')"
        @close="toggleSearch"
      />

      <div class="ion-padding">
        <h1 class="page-title jp-page-title">{{ t('items.title') }}</h1>
      </div>

      <!-- Tag axis (FR-24.2) — an item surfaces under every tag it carries. -->
      <IonSegment
        v-if="store.tagList.length > 0 && !isEmpty"
        :value="tagFilter ?? 'all'"
        scrollable
        data-testid="m9-tag-axis"
        @ionChange="
          (e: CustomEvent) => (tagFilter = e.detail.value === 'all' ? null : e.detail.value)
        "
      >
        <IonSegmentButton value="all">
          <IonLabel>{{ t('items.tagFilterAll') }}</IonLabel>
        </IonSegmentButton>
        <IonSegmentButton
          v-for="tag in store.tagList"
          :key="tag.id"
          :value="tag.id"
          :data-testid="`m9-tag-chip-${tag.name}`"
        >
          <IonLabel>{{ tag.name }}</IonLabel>
        </IonSegmentButton>
      </IonSegment>

      <!-- G-7 empty state — M15 is the way in from here. -->
      <div v-if="isEmpty" class="empty-state" data-testid="m9-empty">
        <IonIcon :icon="cubeOutline" class="empty-icon" />
        <p>{{ t('items.empty') }}</p>
        <p class="empty-hint">{{ t('items.emptyHint') }}</p>
        <IonButton fill="outline" size="small" router-link="/import">
          <IonIcon slot="start" :icon="cloudUploadOutline" />
          {{ t('items.importSpreadsheet') }}
        </IonButton>
      </div>

      <div v-else-if="noResults" class="empty-state" data-testid="m9-no-match">
        <p>{{ t('items.noMatch') }}</p>
      </div>

      <template v-else>
        <section v-for="[key, groupItems] in groups" :key="key" class="tag-group">
          <h2 class="group-head jp-eyebrow" data-testid="m9-group-head">
            {{ groupLabel(key) }}
            <span class="group-count">{{ groupItems.length }}</span>
          </h2>

          <IonList class="jp-card group-card" lines="full">
            <IonItem
              v-for="item in groupItems"
              :key="item.id"
              button
              :detail="false"
              :router-link="`/items/${item.id}`"
              data-testid="m9-row"
            >
              <!-- FR-28.4: photo → mark → the tag initial. The inventory is
                   where an item is identified, so this ladder never ends in
                   nothing and the column stays aligned. -->
              <ItemMark
                slot="start"
                :mark="item.icon ?? null"
                surface="inventory"
                :photo-item="item"
                :initial="avatarGlyph(key)"
                :size="34"
                class="row-mark"
              />

              <IonLabel>
                <h2>{{ item.name }}</h2>
                <!-- FR-24.4: only when the device asked for them. -->
                <div v-if="props.isShown('tags')" class="row-tags">
                  <span v-for="tag in store.getItemTags(item.id)" :key="tag.id" class="row-tag">
                    {{ tag.name }}
                  </span>
                </div>
              </IonLabel>

              <div v-if="extrasFor(item).length > 0" slot="end" class="row-extras">
                <span v-for="extra in extrasFor(item)" :key="extra">{{ extra }}</span>
              </div>
              <IonIcon slot="end" :icon="chevronForwardOutline" class="row-chevron" />
            </IonItem>
          </IonList>
        </section>
      </template>

      <IonFab id="m9-fab-anchor" vertical="bottom" horizontal="end" slot="fixed">
        <IonFabButton :aria-label="t('items.new')" data-testid="m9-fab" @click="newItem">
          <IonIcon :icon="addOutline" />
        </IonFabButton>
      </IonFab>

      <!-- FR-24.4 "Angezeigte Eigenschaften" — device-local, no save button. -->
      <IonModal
        :is-open="propsOpen"
        :initial-breakpoint="0.5"
        :breakpoints="[0, 0.5]"
        data-testid="m9-properties-sheet"
        @didDismiss="propsOpen = false"
      >
        <div class="sheet-body ion-padding">
          <h2 class="jp-sheet-title">{{ t('items.properties') }}</h2>
          <p class="sheet-hint">{{ t('items.propertiesHint') }}</p>

          <IonList>
            <IonItem v-for="key in INVENTORY_PROPERTIES" :key="key" lines="full">
              <IonLabel>{{ propertyLabel(key) }}</IonLabel>
              <IonToggle
                slot="end"
                :checked="props.isShown(key)"
                :data-testid="`m9-property-${key}`"
                @ionChange="props.toggle(key)"
              />
            </IonItem>
          </IonList>
        </div>
      </IonModal>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.page-title {
  margin: 16px 0 8px;
}

/* Clearance below the axis (UX-4): at 0px the active chip's underline sat
   flush against the first group heading, which read as the heading sliding
   under the bar. Inset to match M7's segment. */
ion-segment {
  margin: 0 12px 12px;
}

.tag-group {
  margin: 0 0 18px;
}

.group-card {
  /* Inset like M7's section card, so the radius reads as a card edge
     instead of bleeding into the page (G-14). */
  margin: 0 8px 8px;
}

.group-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0 20px 6px;
  color: var(--ion-color-medium);
}

.group-count {
  color: var(--ion-color-medium);
}

/* The tile itself now lives in ItemMark with the ladder that decides when
   it shows (FR-28.4); only the row's own spacing stays here. */
.row-mark {
  margin-inline-end: 12px;
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

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 24px;
  text-align: center;
  color: var(--ion-color-medium);
}

.empty-icon {
  font-size: var(--jp-icon-2xl);
  margin-bottom: 16px;
}

.empty-hint {
  font-size: var(--jp-text-sm);
  margin-top: 8px;
}

.sheet-hint {
  color: var(--ion-color-medium);
  font-size: var(--jp-text-sm);
  margin: 0 0 12px;
}
</style>
