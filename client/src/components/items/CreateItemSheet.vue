<script setup lang="ts">
/**
 * Create the item the inventory search did not find (FR-24.11).
 *
 * Name and tags, nothing else: everything FR-24.5's form folds behind
 * „Mehr" — weight, price, the mark, a photo — is a follow-up in M10, reached
 * from the toast or from „Anlegen und öffnen". The point of the sheet is that
 * the search and the filter survive it: after „Stirnlampe" usually comes
 * „Ersatzbatterien", and M10 would have cost the query both times.
 *
 * The write is the same one M10's creation makes (FR-24.5's rule, the
 * naming rule's collision check, one `createMasterItem` plus one assignment
 * per tag), so an item made here is indistinguishable from one made there.
 */
import { IonButton, IonIcon, IonInput, IonNote } from '@ionic/vue'
import { warningOutline } from 'ionicons/icons'
import { computed, ref, watch } from 'vue'

import SheetModal from '@/components/global/SheetModal.vue'
import SheetHead from '@/components/global/SheetHead.vue'
import TagChooser from '@/components/items/TagChooser.vue'
import { useMasterStore } from '@/stores/masterStore'
import { useOrchestrator } from '@/composables/useOrchestrator'
import { findNameCollision } from '@/domain/nameCollision'
import { t } from '@/i18n'
import type { Tag } from '@/types/domain'

const props = defineProps<{
  isOpen: boolean
  /** The search query, already trimmed — the name the sheet opens with. */
  name: string
  /** Assigned from the start: the tags the list is filtered by. */
  tagIds: string[]
  /** Offered first: the tags of the items the search found by name. */
  preferredTagIds: string[]
}>()

const emit = defineEmits<{
  dismiss: []
  /** The item exists; `open` asks the page to continue in M10. */
  created: [payload: { id: string; name: string; open: boolean }]
}>()

const masterStore = useMasterStore()
const orchestrator = useOrchestrator()

const draftName = ref('')
const draftTagIds = ref<string[]>([])
const nameError = ref('')

// Re-seeded on every opening, so a second search does not inherit the first
// one's draft.
watch(
  () => props.isOpen,
  (open) => {
    if (!open) return
    draftName.value = props.name
    draftTagIds.value = [...props.tagIds]
    nameError.value = ''
  },
  { immediate: true },
)

const assigned = computed<Tag[]>(() => {
  const byId = new Map(masterStore.tagList.map((tag) => [tag.id, tag]))
  return draftTagIds.value.map((id) => byId.get(id)).filter((tag): tag is Tag => !!tag)
})

function assign(tagId: string) {
  if (!draftTagIds.value.includes(tagId)) draftTagIds.value = [...draftTagIds.value, tagId]
}

function unassign(tagId: string) {
  draftTagIds.value = draftTagIds.value.filter((id) => id !== tagId)
}

function makePrimary(tagId: string) {
  draftTagIds.value = [tagId, ...draftTagIds.value.filter((id) => id !== tagId)]
}

function create(open: boolean) {
  const name = draftName.value.trim()
  if (!name) {
    // A hint, not a disabled button (FR-24.5).
    nameError.value = t('items.editor.nameMissing')
    return
  }
  if (findNameCollision(name, masterStore.activeItemList)) {
    nameError.value = t('items.editor.nameTaken', { name })
    return
  }
  nameError.value = ''
  const id = orchestrator.createMasterItem(name)
  for (const tagId of draftTagIds.value) orchestrator.assignTag(id, tagId)
  emit('created', { id, name, open })
}
</script>

<template>
  <SheetModal :is-open="isOpen" testid="m9-create-sheet" @dismiss="emit('dismiss')">
    <section class="sheet-body">
      <SheetHead
        :title="t('items.new')"
        title-testid="m9-create-title"
        close-testid="m9-create-close"
        @close="emit('dismiss')"
      />

      <IonInput
        :value="draftName"
        :label="t('items.editor.name')"
        label-placement="stacked"
        fill="outline"
        data-testid="m9-create-name"
        @ionInput="(e: CustomEvent) => (draftName = (e.detail.value as string) ?? '')"
        @keyup.enter="create(false)"
      />
      <IonNote v-if="nameError" color="danger" class="field-error" data-testid="m9-create-error">
        <IonIcon :icon="warningOutline" />
        {{ nameError }}
      </IonNote>

      <TagChooser
        :tags="masterStore.tagList"
        :assigned="assigned"
        :preferred-ids="preferredTagIds"
        in-sheet
        @assign="assign"
        @unassign="unassign"
        @primary="makePrimary"
        @create="(tagName: string) => assign(orchestrator.createTag(tagName))"
      />

      <p class="later">{{ t('items.createLater') }}</p>

      <div class="actions">
        <IonButton fill="clear" data-testid="m9-create-open" @click="create(true)">
          {{ t('items.createAndOpen') }}
        </IonButton>
        <IonButton data-testid="m9-create-confirm" @click="create(false)">
          {{ t('items.createConfirm') }}
        </IonButton>
      </div>
    </section>
  </SheetModal>
</template>

<style scoped>
/* The sheet's own inset, like every other sheet body (§3.25). */
.sheet-body {
  padding: 4px 18px 22px;
}

.field-error {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--jp-text-sm);
  margin: 6px 0 0;
}

.later {
  color: var(--ion-color-medium);
  font-size: var(--jp-text-xs);
  margin: 0 0 8px;
}

.actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
