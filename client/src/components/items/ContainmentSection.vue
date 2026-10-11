<script setup lang="ts">
/**
 * M10's „Enthalten in" section (FR-27.8): every group and Ferien-Vorlage
 * holding the item as one of its own positions, each row opening that
 * template. The page works the list out (`containingTemplates`); this renders
 * it.
 */
import { IonItem, IonLabel, IonList } from '@ionic/vue'
import { useRouter } from 'vue-router'

import SectionHead from '@/components/global/SectionHead.vue'
import type { Containment } from '@/domain/itemHistory'
import { t } from '@/i18n'
import { templatePath } from '@/router/paths'
import { TEMPLATE_KIND_GROUP } from '@/types/domain'

defineProps<{ entries: readonly Containment[] }>()

const router = useRouter()
</script>

<template>
  <SectionHead :title="t('items.editor.containedIn')" data-testid="m10-section-containment" />
  <IonList>
    <IonItem
      v-for="entry in entries"
      :key="entry.templateId"
      button
      :detail="true"
      :data-testid="`m10-contained-${entry.templateName}`"
      @click="router.push(templatePath(entry.templateId))"
    >
      <IonLabel>
        <h3>{{ entry.templateName }}</h3>
        <p>
          {{ t('items.editor.containedPositions', { n: entry.positions }) }}
          <template v-if="entry.retired"> · {{ t('items.editor.containedRetired') }} </template>
        </p>
      </IonLabel>
      <!--
        M7's scope chip, on both scopes: M7 marks only groups because its
        sections already label the scope, but in one mixed list an unmarked
        row beside a chipped one reads as an inconsistency (G-14).
      -->
      <span
        slot="end"
        class="scope-chip"
        :data-testid="`m10-contained-${entry.kind}-${entry.templateName}`"
      >
        {{
          entry.kind === TEMPLATE_KIND_GROUP
            ? t('templates.groupChip')
            : t('templates.scopeTemplatesShort')
        }}
      </span>
    </IonItem>
  </IonList>
</template>

<style scoped>
.scope-chip {
  align-self: center;
  padding: 2px 8px;
  border-radius: var(--jp-r-pill);
  background: var(--ct-surface0);
  color: var(--ct-subtext1);
  font-size: var(--jp-text-xs);
  font-weight: var(--jp-weight-semibold);
}
</style>
