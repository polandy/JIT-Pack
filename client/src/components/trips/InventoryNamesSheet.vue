<script setup lang="ts">
/**
 * FR-27.16 — M4's „Namen aus dem Inventar": every name on the trip the
 * inventory has moved on from, each with a tick, and one button that takes
 * the ticked ones over.
 *
 * The sheet decides nothing about *which* names differ — that is
 * `domain/inventoryNames.ts`, handed in as `renames`. What it owns is the
 * selection: every choice starts ticked except the ones the trip named on
 * purpose, and „Alle" ticks those too.
 */
import { IonButton, IonCheckbox } from '@ionic/vue'
import { computed, ref, watch } from 'vue'

import SheetHead from '@/components/global/SheetHead.vue'
import type { InventoryRename } from '@/domain/inventoryNames'
import { t } from '@/i18n'
import type { Traveler } from '@/types/domain'

const props = defineProps<{
  renames: InventoryRename[]
  travelers: Traveler[]
}>()

const emit = defineEmits<{ close: []; adopt: [chosen: InventoryRename[]] }>()

const selected = ref<Set<string>>(preselection(props.renames))

/**
 * A choice that arrives while the sheet is open — another device renamed an
 * item — starts in its default state; the ones already on screen keep what
 * the user made of them, and a choice that went away drops out.
 */
watch(
  () => props.renames,
  (next, previous) => {
    const known = new Set(previous.map((r) => r.key))
    const kept = new Set<string>()
    for (const rename of next) {
      if (known.has(rename.key) ? selected.value.has(rename.key) : !rename.deliberate) {
        kept.add(rename.key)
      }
    }
    selected.value = kept
  },
)

function preselection(renames: InventoryRename[]): Set<string> {
  return new Set(renames.filter((r) => !r.deliberate).map((r) => r.key))
}

const count = computed(() => selected.value.size)
const total = computed(() => props.renames.length)
const coverage = computed(() =>
  count.value === 0 ? 'none' : count.value === total.value ? 'all' : 'some',
)

function toggle(key: string) {
  const next = new Set(selected.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  selected.value = next
}

function toggleAll() {
  selected.value = coverage.value === 'all' ? new Set() : new Set(props.renames.map((r) => r.key))
}

const applyLabel = computed(() => {
  if (count.value === 0) return t('inventoryNames.none')
  return coverage.value === 'all'
    ? t('inventoryNames.applyAll', { n: count.value })
    : t('inventoryNames.apply', { n: count.value })
})

function apply() {
  emit(
    'adopt',
    props.renames.filter((r) => selected.value.has(r.key)),
  )
}

/** The facts that make a choice recognisable without opening its row. */
function facts(rename: InventoryRename): string[] {
  const out: string[] = []
  const people = rename.rows
    .map((row) => props.travelers.find((tr) => tr.id === row.assigned_traveler_id)?.name)
    .filter((name): name is string => name !== undefined)
  if (people.length > 0) out.push(t('inventoryNames.for', { names: people.join(', ') }))
  const packed = rename.rows.reduce((sum, row) => sum + row.packed_count, 0)
  const quantity = rename.rows.reduce((sum, row) => sum + row.quantity, 0)
  if (rename.rows.every((row) => row.state === 'skipped')) {
    out.push(t('inventoryNames.skipped'))
  } else if (packed > 0) {
    out.push(t('inventoryNames.packed', { packed, quantity }))
  }
  return out
}
</script>

<template>
  <div class="sheet" data-testid="inventory-names-sheet">
    <SheetHead
      :title="t('inventoryNames.title')"
      :meta="t('inventoryNames.lead')"
      close-testid="inventory-names-close"
      @close="emit('close')"
    />

    <label class="row all">
      <IonCheckbox
        :checked="coverage !== 'none'"
        :indeterminate="coverage === 'some'"
        :aria-label="t('inventoryNames.all')"
        data-testid="inventory-names-all"
        @ion-change="toggleAll"
      />
      <span class="nm">{{ t('inventoryNames.all') }}</span>
      <span class="n jp-num" data-testid="inventory-names-count">
        {{ t('inventoryNames.selected', { n: count, total }) }}
      </span>
    </label>

    <ul class="list">
      <li v-for="rename in renames" :key="rename.key">
        <label class="row" :data-testid="`inventory-names-row-${rename.to}`">
          <IonCheckbox
            :checked="selected.has(rename.key)"
            :aria-label="rename.to"
            :data-testid="`inventory-names-check-${rename.to}`"
            @ion-change="toggle(rename.key)"
          />
          <span class="txt">
            <span class="from">{{ rename.from }}</span>
            <span class="to">{{ rename.to }}</span>
            <span v-if="facts(rename).length > 0 || rename.deliberate" class="tags">
              <span v-for="fact in facts(rename)" :key="fact" class="tag">{{ fact }}</span>
              <span v-if="rename.deliberate" class="tag deliberate">
                {{ t('inventoryNames.deliberate') }}
              </span>
            </span>
            <span v-if="rename.deliberate" class="note">
              {{ t('inventoryNames.deliberateNote') }}
            </span>
          </span>
        </label>
      </li>
    </ul>

    <footer class="foot">
      <IonButton fill="clear" color="medium" @click="emit('close')">
        {{ t('common.cancel') }}
      </IonButton>
      <IonButton
        class="apply"
        :disabled="count === 0"
        data-testid="inventory-names-apply"
        @click="apply"
      >
        {{ applyLabel }}
      </IonButton>
    </footer>
  </div>
</template>

<style scoped>
.sheet {
  padding: 4px 16px 16px;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 11px 4px;
  border-top: 1px solid var(--ct-surface0);
  cursor: pointer;
}

.row ion-checkbox {
  flex: none;
  margin-top: 2px;
}

/* „Alle" is the one control above the list, so it sits on the sunken
   surface rather than among the rows it governs. */
.row.all {
  align-items: center;
  border-top: none;
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-sunken);
  padding: 10px 12px;
  margin-bottom: 4px;
}

.all .nm {
  font-weight: var(--jp-weight-semibold);
}

.all .n {
  margin-left: auto;
  font-size: var(--jp-text-sm);
  color: var(--ct-subtext0);
}

.txt {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.from {
  font-size: var(--jp-text-sm);
  color: var(--ct-subtext0);
  text-decoration: line-through;
}

.to {
  font-weight: var(--jp-weight-semibold);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 5px;
}

.tag {
  font-size: var(--jp-text-2xs);
  padding: 1px 8px;
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-sunken);
  color: var(--ct-subtext1);
}

.tag.deliberate {
  background: color-mix(in srgb, var(--ct-straw) 20%, transparent);
  color: var(--ct-text);
}

.note {
  margin-top: 6px;
  font-size: var(--jp-text-sm);
  color: var(--ct-subtext0);
}

.foot {
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--ct-surface0);
}

.apply {
  flex: 1;
}
</style>
