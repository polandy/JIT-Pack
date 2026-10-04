<script setup lang="ts">
/**
 * Another module's lines on an excursion's list (FR-33.6) — a picnic from the
 * meal plan — under their own heading, ticked as packed here and opened where
 * they are edited. They are not M4's rows: they have no amount, no person and
 * nothing to borrow, so they stand beside the list rather than inside it.
 */
import { IonLabel, IonList } from '@ionic/vue'
import { computed } from 'vue'

import ListRow from '@/components/global/ListRow.vue'
import { t } from '@/i18n'
import type { ExcursionExtraLine } from '@/lib/excursionExtraLines'

const props = defineProps<{ lines: readonly ExcursionExtraLine[] }>()

/** The lines by their heading, in the order the headings first come. */
const groups = computed(() => {
  const byGroup = new Map<string, ExcursionExtraLine[]>()
  for (const line of props.lines)
    byGroup.set(line.group, [...(byGroup.get(line.group) ?? []), line])
  return [...byGroup].map(([name, lines]) => ({ name, lines }))
})
</script>

<template>
  <IonList v-if="lines.length > 0" class="extra-list" data-testid="m27-extra">
    <template v-for="group in groups" :key="group.name">
      <div class="group-head jp-eyebrow">{{ group.name }}</div>
      <ListRow
        v-for="line in group.lines"
        :key="line.key"
        :checked="line.packed"
        :done="line.packed"
        :tick-label="t('excursions.packLine', { name: line.title })"
        :data-testid="`m27-extra-${line.key}`"
        @tick="line.toggle()"
      >
        <IonLabel
          class="tappable"
          role="button"
          tabindex="0"
          :data-testid="`m27-extra-open-${line.key}`"
          @click="line.open()"
          @keyup.enter="line.open()"
        >
          <h3>{{ line.title }}</h3>
          <p v-if="line.detail">{{ line.detail }}</p>
        </IonLabel>
      </ListRow>
    </template>
  </IonList>
</template>

<style scoped>
.extra-list {
  margin-bottom: 8px;
  background: transparent;
}
.group-head {
  padding: 10px 16px 4px;
  color: var(--ct-subtext0);
}
.tappable {
  cursor: pointer;
}
</style>
