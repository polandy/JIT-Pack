<script setup lang="ts">
/**
 * The tag a bulk action acts with (FR-24.9) — M9's selection mode asks this
 * sheet which tag to give or to take away.
 *
 * Two modes, one component, because the difference is *which tags are worth
 * offering* and nothing else: giving offers the whole vocabulary, while
 * taking offers only the tags the selection actually carries. An action that
 * cannot change anything is not offered rather than offered and refused.
 *
 * **Giving creates what the search did not find** (FR-24.9, amended with
 * FR-24.12): a typed name no tag holds is offered as a new tag, in the same
 * dashed row FR-24.11 offers a missing item in. Left to M10 alone, tagging
 * forty untagged items would take a trip to M10 first — the exact detour the
 * bulk action exists to spare. Taking never offers it: a tag
 * nobody carries cannot be taken away.
 *
 * **Giving carries the switch that refiles.** Assigning a tag does not move an
 * item in the grouped list — the primary tag decides that, and it is the one
 * assigned first. „Als primären Tag setzen" is therefore not a second action
 * but the difference between *labelling* 49 items and *emptying* a group, and
 * it is the same write M10's chip menu makes for one item.
 */
import { IonIcon } from '@ionic/vue'
import { searchOutline } from 'ionicons/icons'
import { computed, ref, watch } from 'vue'

import SheetModal from '@/components/global/SheetModal.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import ItemMark from '@/components/items/ItemMark.vue'
import SearchOfferButton from '@/components/items/SearchOfferButton.vue'
import { OFFER_CREATE } from '@/domain/itemSearch'
import { findNameCollision } from '@/domain/nameCollision'
import { searchMatches } from '@/domain/search'
import { t } from '@/i18n'
import type { Tag } from '@/types/domain'

/** What the sheet is being opened for. */
export type BulkTagMode = 'give' | 'take'

const props = withDefaults(
  defineProps<{
    isOpen: boolean
    mode: BulkTagMode
    /** The tags to offer — already narrowed by the caller for `take`. */
    tags: Tag[]
    /** How many of the *selected* items each tag holds, by tag id. */
    counts: Map<string, number>
    /** How many items the action would touch. */
    selected: number
    /**
     * Whether to offer „Als primären Tag setzen". M24 opens this sheet for one
     * *untagged* item, where the tag given is the primary one whatever the
     * switch says — offering it there asks a question with no effect.
     */
    refile?: boolean
  }>(),
  { refile: true },
)

const emit = defineEmits<{
  dismiss: []
  pick: [value: { tagId: string; primary: boolean }]
  /** FR-24.9: create a tag by this name, then give it as `pick` would. */
  create: [value: { name: string; primary: boolean }]
}>()

const query = ref('')
const primary = ref(true)

// Both reset on closing: the next opening is a new question, and a sheet that
// reopens pre-narrowed hides tags the user never excluded.
watch(
  () => props.isOpen,
  (open) => {
    if (open) return
    query.value = ''
    primary.value = true
  },
)

const matches = computed(() => props.tags.filter((tag) => searchMatches(tag.name, query.value)))

/**
 * The name to offer as a new tag, or null. Decided under the *uniqueness*
 * fold (`findNameCollision`) rather than the search's: „diverses" finds
 * „Diverses" and would be refused as its duplicate, so it is not offered.
 */
const createName = computed(() => {
  const name = query.value.trim()
  if (props.mode !== 'give' || name === '') return null
  return findNameCollision(name, props.tags) ? null : name
})

const title = computed(() =>
  t(props.mode === 'give' ? 'items.bulkGiveTitle' : 'items.bulkTakeTitle'),
)
</script>

<template>
  <SheetModal :is-open="isOpen" testid="m9-bulk-tag-sheet" @dismiss="emit('dismiss')">
    <section class="sheet-body">
      <SheetHead
        :title="title"
        :meta="t('items.bulkSelected', { n: selected })"
        title-testid="m9-bulk-tag-title"
        close-testid="m9-bulk-tag-close"
        @close="emit('dismiss')"
      />

      <div class="search">
        <IonIcon :icon="searchOutline" />
        <input
          v-model="query"
          :placeholder="t('items.filterSearch')"
          data-testid="m9-bulk-tag-search"
          autocomplete="off"
        />
      </div>

      <!-- FR-24.9: the difference between labelling and refiling. -->
      <label v-if="mode === 'give' && refile" class="primary-switch">
        <input v-model="primary" type="checkbox" data-testid="m9-bulk-primary" />
        <span>
          <strong>{{ t('items.bulkPrimary') }}</strong>
          <em>{{ t('items.bulkPrimaryHint') }}</em>
        </span>
      </label>

      <SearchOfferButton
        v-if="createName"
        :offer="{ kind: OFFER_CREATE, name: createName }"
        :create-hint="t('items.bulkCreateHint', { n: selected })"
        testid="m9-bulk-tag-create"
        class="create"
        @take="emit('create', { name: createName, primary })"
      />

      <ul class="tags">
        <li v-for="tag in matches" :key="tag.id">
          <button
            type="button"
            :data-testid="`m9-bulk-tag-${tag.name}`"
            @click="emit('pick', { tagId: tag.id, primary: mode === 'give' && primary })"
          >
            <ItemMark :mark="tag.icon ?? null" surface="plain" :size="20" />
            <span class="name">{{ tag.name }}</span>
            <span v-if="counts.get(tag.id)" class="count jp-num">
              {{ t('items.bulkAlreadyOn', { n: counts.get(tag.id) ?? 0 }) }}
            </span>
          </button>
        </li>

        <li v-if="matches.length === 0" class="none" data-testid="m9-bulk-tag-none">
          {{ mode === 'give' ? t('items.filterNoTag') : t('items.bulkNoSharedTag') }}
        </li>
      </ul>
    </section>
  </SheetModal>
</template>

<style scoped>
.sheet-body {
  padding: 4px 18px 22px;
}

.search {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--jp-surface-sunken);
  border: 1px solid var(--ct-surface0);
  border-radius: var(--jp-r-sm);
  padding: 8px 11px;
  margin: 4px 0 10px;
  color: var(--ct-overlay2);
}

.search input {
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  color: var(--ct-text);
  font-size: var(--jp-text-md);
}

.create {
  padding: 0 0 10px;
}

.primary-switch {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: var(--jp-surface-sunken);
  border-radius: var(--jp-r-md);
  padding: 10px 12px;
  margin-bottom: 12px;
  cursor: pointer;
}

.primary-switch span {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.primary-switch strong {
  font-size: var(--jp-text-base);
  font-weight: var(--jp-weight-semibold);
  color: var(--ct-text);
}

.primary-switch em {
  font-size: var(--jp-text-sm);
  font-style: normal;
  color: var(--ct-overlay2);
}

.tags {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 46vh;
  overflow-y: auto;
}

.tags button {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  background: none;
  border: none;
  border-bottom: 1px solid var(--ct-surface0);
  padding: 10px 2px;
  color: var(--ct-text);
  font-size: var(--jp-text-md);
  text-align: left;
  cursor: pointer;
}

.name {
  min-width: 0;
  overflow-wrap: anywhere;
}

.count {
  margin-left: auto;
  color: var(--ct-overlay1);
  font-size: var(--jp-text-sm);
  white-space: nowrap;
}

.none {
  padding: 14px 2px;
  color: var(--ct-overlay2);
  font-size: var(--jp-text-sm);
}
</style>
