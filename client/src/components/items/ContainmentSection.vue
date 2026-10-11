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
      <!-- The scope chip M7's rows already wear, so the two lists read alike. -->
      <!--
        Both scopes wear the same chip here, unlike M7 where only a
        group needs one: there the two live in separate sections, so
        the section is the label. In one mixed list an unmarked row
        and a chipped one read as an inconsistency rather than as a
        rule — found by rendering it (G-14).
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
