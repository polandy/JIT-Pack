<script setup lang="ts">
/**
 * M27's sheet for one excursion (FR-31.1–31.3): its name, its optional days,
 * who goes — and, when it is new, the Gruppe it starts from.
 *
 * The group choice is FR-27.13's search (by the group's name and by the things
 * inside it), and the sheet says before the tap what the tap will do to the
 * packing list: while the suitcase is open, what is not in it is added; once
 * the packing is closed, it is only marked (FR-31.7).
 */
import { IonButton, IonInput } from '@ionic/vue'
import { computed, ref, watch } from 'vue'

import DateRangeField from '@/components/global/DateRangeField.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import SheetModal from '@/components/global/SheetModal.vue'
import WhoChips from '@/components/global/WhoChips.vue'
import { resolveTemplate, searchGroups, type GroupSearchCandidate } from '@/domain/templates'
import { t } from '@/i18n'
import { useMasterStore } from '@/stores/masterStore'
import type { Excursion, Traveler } from '@/types/domain'

/** What the sheet hands back: the fields, and for a new one its start. */
export interface ExcursionSheetResult {
  name: string
  startsOn: string | null
  endsOn: string | null
  /** Null: everybody (FR-31.3). */
  travelerIds: string[] | null
  templateId: string | null
}

/** How many groups the picker lists before a search narrows them. */
const GROUP_LIST_LIMIT = 8

const props = withDefaults(
  defineProps<{
    isOpen: boolean
    travelers: Traveler[]
    /** Absent: a new excursion. Present: its fields, to edit. */
    excursion?: Excursion | null
    /** Who goes today, for an edit; null for everybody. */
    travelerIds?: string[] | null
    /** Whether the suitcase still takes things (FR-31.7). */
    suitcaseOpen: boolean
    /** The trip's days, which bound the excursion's (FR-31.1); null is unbounded. */
    tripStart?: string | null
    tripEnd?: string | null
    /** FR-29.13: for a new one made from an idea — its name and day, to start from. */
    seed?: { name: string; day: string | null } | null
  }>(),
  { excursion: null, travelerIds: null, tripStart: null, tripEnd: null, seed: null },
)

const emit = defineEmits<{ dismiss: []; save: [result: ExcursionSheetResult] }>()

const masterStore = useMasterStore()

const name = ref('')
const startsOn = ref('')
const endsOn = ref('')
/** Null is everybody; a set is the named people. */
const who = ref<string[] | null>(null)
const templateId = ref<string | null>(null)
const query = ref('')

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return
    name.value = props.excursion?.name ?? props.seed?.name ?? ''
    startsOn.value = props.excursion?.starts_on ?? props.seed?.day ?? ''
    endsOn.value = props.excursion?.ends_on ?? props.seed?.day ?? ''
    who.value = props.travelerIds === null ? null : [...props.travelerIds]
    templateId.value = null
    query.value = ''
  },
  { immediate: true },
)

function onDates(start: string, end: string) {
  startsOn.value = start
  endsOn.value = end
}

const creating = computed(() => props.excursion === null)

/** The groups the picker offers, each with what it resolves to. */
const candidates = computed<GroupSearchCandidate[]>(() => {
  const input = {
    templates: masterStore.templateList,
    includes: masterStore.includeList,
    positions: masterStore.positionList,
  }
  return masterStore.activeTemplateList
    .filter((tpl) => tpl.kind === 'group')
    .map((tpl) => ({
      id: tpl.id,
      name: tpl.name,
      itemNames: resolveTemplate(tpl.id, input)
        .positions.map((p) => masterStore.getItem(p.item_id)?.name)
        .filter((n): n is string => n !== undefined),
      included: false,
    }))
})

const shown = computed(() => {
  const byId = new Map(candidates.value.map((c) => [c.id, c]))
  if (query.value.trim() === '') {
    return [...candidates.value]
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, GROUP_LIST_LIMIT)
      .map((c) => ({ candidate: c, via: null as string | null }))
  }
  return searchGroups(query.value, candidates.value)
    .map((hit) => ({ candidate: byId.get(hit.id)!, via: hit.via }))
    .filter((e) => e.candidate !== undefined)
})

const canSave = computed(() => name.value.trim() !== '')

function save() {
  if (!canSave.value) return
  emit('save', {
    name: name.value.trim(),
    startsOn: startsOn.value || null,
    endsOn: endsOn.value || null,
    travelerIds: who.value,
    templateId: templateId.value,
  })
}
</script>

<template>
  <SheetModal :is-open="isOpen" testid="m27-sheet" @dismiss="emit('dismiss')">
    <div class="sheet">
      <SheetHead
        :title="creating ? t('excursions.new') : t('excursions.edit')"
        title-testid="m27-sheet-title"
        close-testid="m27-sheet-close"
        @close="emit('dismiss')"
      />

      <IonInput
        v-model="name"
        class="field"
        :label="t('excursions.name')"
        label-placement="stacked"
        :placeholder="t('excursions.namePlaceholder')"
        data-testid="m27-name"
      />

      <div class="dates">
        <DateRangeField
          testid="m27-dates"
          :label="t('excursions.when')"
          :start-label="t('excursions.from')"
          :end-label="t('excursions.to')"
          :start="startsOn"
          :end="endsOn"
          :min="tripStart ?? ''"
          :max="tripEnd ?? ''"
          @update="onDates"
        />
      </div>

      <div v-if="travelers.length > 1" class="block">
        <p class="label">{{ t('excursions.who') }}</p>
        <WhoChips
          :travelers="travelers"
          :who="who"
          :all-label="t('excursions.everybody')"
          test-key="m27"
          @update="who = $event"
        />
      </div>

      <div v-if="creating" class="block">
        <p class="label">{{ t('excursions.startWith') }}</p>
        <IonInput
          v-model="query"
          class="field search"
          :placeholder="t('excursions.searchGroup')"
          :aria-label="t('excursions.searchGroup')"
          data-testid="m27-group-search"
        />
        <div class="groups">
          <button
            v-for="entry in shown"
            :key="entry.candidate.id"
            type="button"
            class="group"
            :class="{ on: templateId === entry.candidate.id }"
            :aria-pressed="templateId === entry.candidate.id"
            :data-testid="`m27-group-${entry.candidate.name}`"
            @click="templateId = templateId === entry.candidate.id ? null : entry.candidate.id"
          >
            <b>{{ entry.candidate.name }}</b>
            <span>
              {{ t('excursions.groupPositions', { n: entry.candidate.itemNames.length }) }}
              <template v-if="entry.via">
                · {{ t('excursions.via', { name: entry.via }) }}</template
              >
            </span>
          </button>
          <button
            type="button"
            class="group plain"
            :class="{ on: templateId === null }"
            :aria-pressed="templateId === null"
            data-testid="m27-group-none"
            @click="templateId = null"
          >
            {{ t('excursions.startEmpty') }}
          </button>
        </div>
        <p v-if="templateId" class="note" data-testid="m27-suitcase-note">
          {{ suitcaseOpen ? t('excursions.suitcaseNote') : t('excursions.closedNote') }}
        </p>
      </div>

      <div class="actions">
        <IonButton fill="clear" data-testid="m27-cancel" @click="emit('dismiss')">
          {{ t('common.cancel') }}
        </IonButton>
        <IonButton shape="round" :disabled="!canSave" data-testid="m27-save" @click="save">
          {{ creating ? t('excursions.create') : t('common.save') }}
        </IonButton>
      </div>
    </div>
  </SheetModal>
</template>

<style scoped>
.sheet {
  padding: 4px 16px 18px;
}

.field {
  --background: var(--jp-surface-sunken);
  --padding-start: 12px;
  --padding-end: 12px;
  margin-top: 10px;
  border-radius: var(--jp-r-md);
}

.dates {
  margin-top: 10px;
}

.block {
  margin-top: 14px;
}

.label {
  margin: 0 2px 6px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.groups {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.group {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  border: 1px solid var(--jp-surface-border);
  border-radius: var(--jp-r-md);
  background: none;
  color: var(--ct-text);
  text-align: start;
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.group span {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.group.on {
  border-color: var(--jp-action);
  background: color-mix(in srgb, var(--jp-action) 10%, transparent);
}

.group.plain {
  border-style: dashed;
  color: var(--ct-subtext1);
}

.note {
  margin: 8px 2px 0;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.actions {
  display: flex;
  justify-content: space-between;
  margin-top: 14px;
}
</style>
