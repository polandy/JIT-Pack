<script setup lang="ts">
/**
 * M7 — Template List
 *
 * One shared instance-wide list (FR-1.6 MVP simplification, 2026-08-08):
 * every account sees and edits every template, so there is no my/published
 * split and no publish toggle. Per row: name, item count, YAML export.
 * FAB for new template.
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
  IonRefresher,
  IonRefresherContent,
  IonButton,
  alertController,
} from '@ionic/vue'
import { addOutline, documentTextOutline, downloadOutline, listOutline } from 'ionicons/icons'
import { computed, inject } from 'vue'
import { useRouter } from 'vue-router'
import { serializeTemplate } from '@/domain/portable'
import { safeFilename, saveText } from '@/lib/download'
import { useMasterStore } from '@/stores/masterStore'
import type { useSyncOrchestrator } from '@/composables/useSyncOrchestrator'
import type { Template } from '@/types/domain'
import SearchRow from '@/components/global/SearchRow.vue'
import { useContextSearch } from '@/composables/useContextSearch'
import { setHeaderActions } from '@/composables/useHeaderActions'
import { t } from '@/i18n'

const store = useMasterStore()
const orchestrator = inject<ReturnType<typeof useSyncOrchestrator>>('orchestrator')!
const router = useRouter()

/** New template (FR-1.6): prompt for a name, create it, open M8. */
async function newTemplate() {
  const alert = await alertController.create({
    header: 'New template',
    inputs: [{ name: 'name', type: 'text', placeholder: 'Template name' }],
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      { text: 'Create', role: 'confirm' },
    ],
  })
  await alert.present()
  const { data, role } = await alert.onDidDismiss()
  const name = (data?.values?.name ?? '').trim()
  if (role !== 'confirm' || !name) return
  const id = orchestrator.createTemplate(name)
  router.push(`/templates/${id}`)
}

/** FR-18.2: client-side export — works identically in Local Mode. */
function exportTemplate(tpl: Template) {
  const yaml = serializeTemplate(tpl, store.getTemplateItems(tpl.id), (id) => store.getItem(id))
  saveText(yaml, `${safeFilename(tpl.name)}.yaml`)
}

const {
  term: search,
  isOpen: searchOpen,
  toggle: toggleSearch,
  action,
  matches,
} = useContextSearch()
setHeaderActions(() => [action()])

const visibleTemplates = computed(() => store.templateList.filter((tpl) => matches(tpl.name)))
const isEmpty = computed(() => visibleTemplates.value.length === 0)

async function handleRefresh(event: CustomEvent) {
  const refresher = event.target as HTMLIonRefresherElement
  refresher.complete()
}
</script>

<template>
  <IonPage>
    <IonContent>
      <SearchRow
        v-if="searchOpen || search"
        v-model="search"
        testid="templates-search-input"
        :placeholder="t('templates.searchPlaceholder')"
        @close="toggleSearch"
      />

      <IonRefresher slot="fixed" @ionRefresh="handleRefresh">
        <IonRefresherContent />
      </IonRefresher>

      <div class="ion-padding">
        <div class="title-row">
          <h1 class="page-title jp-page-title">Templates</h1>
          <!-- M18: portable template import (FR-18.4) -->
          <IonButton
            fill="clear"
            size="small"
            aria-label="Import template from file"
            router-link="/portable-import"
          >
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
        <IonItem
          v-for="tpl in visibleTemplates"
          :key="tpl.id"
          button
          :router-link="`/templates/${tpl.id}`"
        >
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
        </IonItem>
      </IonList>

      <!-- FAB: New template -->
      <IonFab vertical="bottom" horizontal="end" slot="fixed">
        <IonFabButton aria-label="New template" @click="newTemplate">
          <IonIcon :icon="addOutline" />
        </IonFabButton>
      </IonFab>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.page-title {
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
