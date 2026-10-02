<script setup lang="ts">
/**
 * M3 step 3 — templates in their two scopes (FR-27.6), single items beside
 * them (FR-27.3), and the composition report under them (FR-27.2/27.7,
 * FR-20.2, FR-1.4).
 */
import { IonList, IonItem, IonLabel, IonInput, IonCheckbox, IonIcon, IonChip } from '@ionic/vue'
import { addOutline, chevronForwardOutline, closeCircleOutline } from 'ionicons/icons'

import SectionHead from '@/components/global/SectionHead.vue'
import ItemMark from '@/components/items/ItemMark.vue'
import { t } from '@/i18n'
import type { MergedOverlap } from '@/domain/instantiate'
import { previewText } from '@/lib/groupPreview'
import { MIN_SEARCH_LENGTH, useMasterStore } from '@/stores/masterStore'
import type { WizardCore } from './useWizardCore'

const { core } = defineProps<{ core: WizardCore }>()

const masterStore = useMasterStore()
const {
  selectedTemplateIds,
  toggleTemplate,
  itemQuery,
  itemSuggestions,
  pickedItems,
  addSingleItem,
  removeSingleItem,
  peekTemplateId,
  vacationTemplates,
  groupTemplates,
  bringingVorlagen,
  taskCount,
  unassignableNames,
  generation,
  companionResolution,
} = core.composition

/**
 * FR-27.2: a merge is reported by name — "Kamera nur 1× — in Makro & Wildlife".
 * The same two sentences the M8 resolution footer uses: it is the same fact
 * about the same composition, and two wordings would eventually disagree.
 */
function mergeLine(merge: MergedOverlap): string {
  return t(merge.strategy === 'sum' ? 'templates.mergeSum' : 'templates.mergeMax', {
    name: merge.item_name,
    n: merge.quantity,
    groups: merge.sources.map((s) => s.name).join(' & '),
  })
}
</script>

<template>
  <section data-testid="wizard-step-3">
    <!-- FR-27.6: Ferien-Vorlagen first — they are what a trip starts from -->
    <template v-if="vacationTemplates.length > 0">
      <SectionHead :title="t('templates.sectionTemplates')" />
      <IonList data-testid="wizard-section-templates">
        <IonItem v-for="row in vacationTemplates" :key="row.template.id">
          <IonCheckbox
            slot="start"
            :data-testid="`wizard-pick-${row.template.id}`"
            :checked="selectedTemplateIds.has(row.template.id)"
            @ionChange="(e: CustomEvent) => toggleTemplate(row.template.id, e.detail.checked)"
          />
          <!-- FR-28.8: the same mark the group carries everywhere else,
               on the column-holding ladder for the same reason M7 uses
               it — see the note there. -->
          <ItemMark
            :mark="row.template.icon ?? null"
            surface="packing"
            :size="20"
            class="pick-mark"
          />
          <IonLabel>
            <h3>{{ row.template.name }}</h3>
            <p :data-testid="`wizard-count-${row.template.id}`">
              {{ t('templates.itemCount', { n: row.count }) }}
            </p>
            <!-- FR-27.12: the row answers "was ist da drin?" for the easy case -->
            <p
              v-if="row.preview.names.length"
              class="preview"
              :data-testid="`wizard-preview-${row.template.id}`"
            >
              {{ previewText(row.preview) }}
            </p>
          </IonLabel>
          <button
            slot="end"
            class="peek"
            :data-testid="`wizard-peek-${row.template.id}`"
            :aria-label="t('templates.peekOpen', { name: row.template.name })"
            @click="peekTemplateId = row.template.id"
          >
            <IonIcon :icon="chevronForwardOutline" />
          </button>
        </IonItem>
      </IonList>
    </template>

    <template v-if="groupTemplates.length > 0">
      <SectionHead :title="t('wizard.sectionGroups')" />
      <IonList data-testid="wizard-section-groups">
        <IonItem v-for="row in groupTemplates" :key="row.template.id">
          <IonCheckbox
            slot="start"
            :data-testid="`wizard-pick-${row.template.id}`"
            :checked="selectedTemplateIds.has(row.template.id)"
            @ionChange="(e: CustomEvent) => toggleTemplate(row.template.id, e.detail.checked)"
          />
          <!-- FR-28.8: the same mark the group carries everywhere else,
               on the column-holding ladder for the same reason M7 uses
               it — see the note there. -->
          <ItemMark
            :mark="row.template.icon ?? null"
            surface="packing"
            :size="20"
            class="pick-mark"
          />
          <IonLabel>
            <h3>{{ row.template.name }}</h3>
            <p :data-testid="`wizard-count-${row.template.id}`">
              {{ t('templates.itemCount', { n: row.count }) }}
            </p>
            <p
              v-if="row.preview.names.length"
              class="preview"
              :data-testid="`wizard-preview-${row.template.id}`"
            >
              {{ previewText(row.preview) }}
            </p>
            <!-- Already on the list through a picked Vorlage — say so -->
            <p
              v-if="bringingVorlagen.has(row.template.id)"
              :data-testid="`wizard-included-${row.template.id}`"
            >
              {{
                t('wizard.alreadyIncluded', {
                  names: bringingVorlagen.get(row.template.id)!.join(' & '),
                })
              }}
            </p>
          </IonLabel>
          <button
            slot="end"
            class="peek"
            :data-testid="`wizard-peek-${row.template.id}`"
            :aria-label="t('templates.peekOpen', { name: row.template.name })"
            @click="peekTemplateId = row.template.id"
          >
            <IonIcon :icon="chevronForwardOutline" />
          </button>
        </IonItem>
      </IonList>
    </template>

    <!-- FR-27.3: single items beside the templates. A trip is not always
         a template — "diesmal noch die Drohne mit" is one item, and
         building a group for it would be filing rather than packing. -->
    <SectionHead :title="t('wizard.sectionSingleItems')" />
    <div class="single-items">
      <!-- `:value` + `@ionInput`, like the name field above: v-model on an
           ion-input binds through a custom element, which nothing outside a
           real browser drives. -->
      <IonInput
        data-testid="wizard-item-search"
        :placeholder="t('wizard.singleItemsSearch')"
        :value="itemQuery"
        :clear-input="true"
        @ionInput="(e: CustomEvent) => (itemQuery = e.detail.value ?? '')"
      />
      <IonList v-if="itemSuggestions.length > 0" data-testid="wizard-item-suggestions">
        <IonItem
          v-for="item in itemSuggestions"
          :key="item.id"
          button
          :data-testid="`wizard-item-suggestion-${item.id}`"
          @click="addSingleItem(item.id)"
        >
          <IonIcon slot="start" :icon="addOutline" />
          <IonLabel>{{ item.name }}</IonLabel>
        </IonItem>
      </IonList>
      <!-- Two words rather than silence: an empty result on a stocked
           inventory and an empty inventory are different problems. -->
      <p
        v-else-if="itemQuery.trim().length >= MIN_SEARCH_LENGTH"
        class="empty-hint"
        data-testid="wizard-item-nomatch"
      >
        {{ t('wizard.singleItemsNoMatch', { query: itemQuery.trim() }) }}
      </p>

      <div v-if="pickedItems.length > 0" class="picked-chips" data-testid="wizard-item-chips">
        <IonChip
          v-for="item in pickedItems"
          :key="item.id"
          :data-testid="`wizard-item-chip-${item.id}`"
          @click="removeSingleItem(item.id)"
        >
          {{ item.name }}
          <IonIcon :icon="closeCircleOutline" />
        </IonChip>
      </div>
    </div>

    <div v-if="masterStore.activeTemplateList.length === 0" class="empty-hint">
      {{ t('wizard.templatesEmpty') }}
    </div>

    <div class="preview-footer">
      <IonChip color="primary" outline data-testid="wizard-item-count">
        {{ t('templates.itemCount', { n: generation.items.length }) }}
      </IonChip>
      <!-- FR-20.2: required companions pulled in by dependencies -->
      <IonChip v-if="companionResolution.required.length > 0" color="secondary" outline>
        {{
          t('wizard.companions', {
            n: companionResolution.required.length,
            names: companionResolution.required.map((c) => c.name).join(', '),
          })
        }}
      </IonChip>
      <!-- FR-27.7: the preparation todos the trip inherits from its positions -->
      <IonChip v-if="taskCount > 0" outline data-testid="wizard-task-count">
        📋 {{ t('wizard.taskCount', { n: taskCount }) }}
      </IonChip>
      <!-- FR-7.4: the trip todos, on their own line — they prepare no row -->
      <IonChip v-if="generation.tripTasks.length > 0" outline data-testid="wizard-trip-task-count">
        ✅ {{ t('wizard.tripTaskCount', { n: generation.tripTasks.length }) }}
      </IonChip>
      <!-- FR-27.3: a picked item a template already brought is *reported*
           rather than added twice — silence here would read as a lost tap. -->
      <IonChip
        v-if="generation.alreadyIncluded.length > 0"
        outline
        color="warning"
        data-testid="wizard-item-duplicates"
      >
        {{
          t('wizard.singleItemsAlready', {
            names: generation.alreadyIncluded.map((d) => d.item_name).join(', '),
          })
        }}
      </IonChip>
      <!-- FR-27.2: a merge names its groups — the point of composing -->
      <div v-if="generation.merged.length > 0" class="preview-block" data-testid="wizard-merges">
        <h3>{{ t('wizard.mergesTitle') }}</h3>
        <p v-for="(m, i) in generation.merged" :key="i">{{ mergeLine(m) }}</p>
      </div>
      <details v-if="generation.excluded.length > 0" class="preview-block">
        <summary>{{ t('wizard.excludedSummary', { n: generation.excluded.length }) }}</summary>
        <p v-for="(ex, i) in generation.excluded" :key="i">
          {{ t('wizard.excludedLine', { item: ex.item_name, reason: ex.reason }) }}
        </p>
      </details>
      <!-- FR-1.4: per-person positions with nobody to belong to. Open
           rather than folded away like the exclusions above, because no
           condition decided against them — the roster did, and the remedy
           is one step back. -->
      <div
        v-if="generation.unassignable.length > 0"
        class="preview-block"
        data-testid="wizard-unassignable"
      >
        <h3>{{ t('wizard.unassignableTitle') }}</h3>
        <p>
          {{
            t('wizard.unassignableLine', {
              names: unassignableNames,
            })
          }}
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* FR-27.3: the picker and its chip list. The chips are the state — what is
   picked has to be visible without scrolling back into the search results. */
.single-items {
  margin-bottom: 16px;
}

.picked-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}

.preview {
  color: var(--ct-overlay0);
}

.peek {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: none;
  color: var(--ct-overlay0);
  font-size: var(--jp-icon-sm);
  cursor: pointer;
}

.empty-hint {
  color: var(--ion-color-medium);
  font-size: var(--jp-text-base);
  margin: 8px 0 16px;
}

.preview-footer {
  margin-top: 16px;
}

.preview-block {
  margin-top: 8px;
  font-size: var(--jp-text-base);
}

.preview-block h3,
.preview-block summary {
  font-size: var(--jp-text-base);
  font-weight: var(--jp-weight-semibold);
}

.preview-block p {
  margin: 2px 0;
  color: var(--ion-color-medium);
}

.pick-mark {
  margin-inline-end: 8px;
}
</style>
