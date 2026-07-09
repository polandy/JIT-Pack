<script setup lang="ts">
/**
 * M7 — Template List
 *
 * Two sections: My Templates and Published. Per row shows name, item count,
 * published toggle. FAB for new template.
 */
import {
  IonPage,
  IonContent,
  IonList,
  IonItemGroup,
  IonItemDivider,
  IonItem,
  IonLabel,
  IonIcon,
  IonToggle,
  IonFab,
  IonFabButton,
  IonBadge,
  IonRefresher,
  IonRefresherContent,
  IonButton,
} from '@ionic/vue'
import { addOutline, documentTextOutline, downloadOutline, listOutline, gitBranchOutline } from 'ionicons/icons'
import { computed } from 'vue'
import { serializeTemplate } from '@/domain/portable'
import { safeFilename, saveText } from '@/lib/download'
import { useMasterStore } from '@/stores/masterStore'
import type { Template } from '@/types/domain'

const store = useMasterStore()

/** FR-18.2: client-side export — works identically in Local Mode. */
function exportTemplate(tpl: Template) {
  const yaml = serializeTemplate(tpl, store.getTemplateItems(tpl.id), (id) => store.getItem(id))
  saveText(yaml, `${safeFilename(tpl.name)}.yaml`)
}

// TODO: filter by current user's ID when auth is wired
const myTemplates = computed(() =>
  store.templateList.filter((t) => !t.is_published),
)

const publishedTemplates = computed(() =>
  store.templateList.filter((t) => t.is_published),
)

const isEmpty = computed(() => store.templateList.length === 0)

async function handleRefresh(event: CustomEvent) {
  const refresher = event.target as HTMLIonRefresherElement
  refresher.complete()
}
</script>

<template>
  <IonPage>
    <IonContent>
      <IonRefresher slot="fixed" @ionRefresh="handleRefresh">
        <IonRefresherContent />
      </IonRefresher>

      <div class="ion-padding">
        <div class="title-row">
          <h1 class="page-title">Templates</h1>
          <!-- M18: portable template import (FR-18.4) -->
          <IonButton fill="clear" size="small" aria-label="Import template from file" router-link="/portable-import">
            <IonIcon slot="icon-only" :icon="documentTextOutline" />
          </IonButton>
        </div>
      </div>

      <!-- Empty state (G-7) -->
      <div v-if="isEmpty" class="empty-state">
        <IonIcon :icon="listOutline" class="empty-icon" />
        <p>No templates yet</p>
        <p class="empty-hint">Create your first template to start building packing lists</p>
      </div>

      <IonList v-else>
        <!-- My templates -->
        <IonItemGroup v-if="myTemplates.length > 0">
          <IonItemDivider sticky>
            <IonLabel>My Templates</IonLabel>
          </IonItemDivider>

          <IonItem v-for="tpl in myTemplates" :key="tpl.id" button :router-link="`/templates/${tpl.id}`">
            <IonLabel>
              <h2>{{ tpl.name }}</h2>
              <p>{{ store.templateItemCount(tpl.id) }} items</p>
            </IonLabel>
            <!-- FR-18.2: portable YAML export, generated client-side -->
            <IonButton
              slot="end"
              fill="clear"
              color="medium"
              aria-label="Export template"
              @click.stop.prevent="exportTemplate(tpl)"
            >
              <IonIcon slot="icon-only" :icon="downloadOutline" />
            </IonButton>
            <IonToggle
              slot="end"
              :checked="tpl.is_published"
              aria-label="Published"
              @click.stop
            />
          </IonItem>
        </IonItemGroup>

        <!-- Published templates (read-only, forkable) -->
        <IonItemGroup v-if="publishedTemplates.length > 0">
          <IonItemDivider sticky>
            <IonLabel>Published</IonLabel>
          </IonItemDivider>

          <IonItem v-for="tpl in publishedTemplates" :key="tpl.id" button :router-link="`/templates/${tpl.id}`">
            <IonIcon :icon="gitBranchOutline" slot="start" color="medium" />
            <IonLabel>
              <h2>{{ tpl.name }}</h2>
              <p>{{ store.templateItemCount(tpl.id) }} items</p>
            </IonLabel>
            <IonBadge slot="end" color="light">Published</IonBadge>
          </IonItem>
        </IonItemGroup>
      </IonList>

      <!-- FAB: New template -->
      <IonFab vertical="bottom" horizontal="end" slot="fixed">
        <IonFabButton aria-label="New template">
          <IonIcon :icon="addOutline" />
        </IonFabButton>
      </IonFab>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.page-title {
  font-size: 1.8rem;
  font-weight: 700;
  margin: 16px 0 16px;
}

.title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
  font-size: 64px;
  margin-bottom: 16px;
}

.empty-hint {
  font-size: 0.85rem;
  margin-top: 8px;
}
</style>
