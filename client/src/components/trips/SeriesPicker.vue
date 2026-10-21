<script lang="ts">
/** The select's value for "a new series, named inline" (FR-13.1); '' is none. */
export const NEW_SERIES = 'new'
</script>

<script setup lang="ts">
/**
 * A trip's series, picked or named (FR-13.1): none, one of the instance's
 * series, or a new one typed inline.
 *
 * M3 sets it at creation and M22 afterwards (FR-2.7); two copies would be two
 * readings of what "new" means. The component owns no draft: when a choice or
 * a name takes effect — on the wizard's last step, at once on M22 — stays with
 * the caller, which is why every act is an event.
 */
import { IonInput, IonItem, IonList, IonNote, IonSelect, IonSelectOption } from '@ionic/vue'

import { t } from '@/i18n'
import { useMasterStore } from '@/stores/masterStore'

const props = defineProps<{
  /** A series id, '' for none, or {@link NEW_SERIES}. */
  choice: string
  newName: string
  /** The series the typed name already belongs to — names are unique instance-wide. */
  taken: { name: string } | null
  /** The select's test id; the name field and its note append `-name` and `-name-taken`. */
  testid: string
  /** The list's separator style, so the picker can sit flush under a card (M22). */
  lines?: 'full' | 'inset' | 'none'
}>()

const emit = defineEmits<{
  pick: [choice: string]
  name: [value: string]
  enter: []
  blur: []
}>()

const masterStore = useMasterStore()
</script>

<template>
  <IonList :lines="props.lines">
    <IonItem>
      <IonSelect
        :label="t('wizard.series')"
        interface="popover"
        :value="props.choice"
        :data-testid="props.testid"
        @ionChange="(e: CustomEvent) => emit('pick', e.detail.value)"
      >
        <IonSelectOption value="">{{ t('wizard.seriesNone') }}</IonSelectOption>
        <IonSelectOption v-for="s in masterStore.seriesList" :key="s.id" :value="s.id">
          {{ s.name }}
        </IonSelectOption>
        <IonSelectOption :value="NEW_SERIES">{{ t('wizard.seriesNew') }}</IonSelectOption>
      </IonSelect>
    </IonItem>
    <IonItem v-if="props.choice === NEW_SERIES">
      <IonInput
        :label="t('wizard.seriesName')"
        label-placement="stacked"
        :placeholder="t('wizard.seriesNamePlaceholder')"
        :value="props.newName"
        :data-testid="`${props.testid}-name`"
        @keydown.enter="emit('enter')"
        @ionBlur="emit('blur')"
        @ionInput="(e: CustomEvent) => emit('name', e.detail.value ?? '')"
      />
    </IonItem>
    <IonItem v-if="props.taken" lines="none">
      <IonNote class="name-taken" :data-testid="`${props.testid}-name-taken`">
        {{ t('wizard.seriesNameTaken', { name: props.taken.name }) }}
      </IonNote>
    </IonItem>
  </IonList>
</template>

<style scoped>
/* A note about something that exists, not an error state (G-14). */
.name-taken {
  color: var(--ct-straw);
}
</style>
