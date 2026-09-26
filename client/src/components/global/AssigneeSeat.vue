<script setup lang="ts">
/**
 * Whose job something is, as the control that decides it: the assignee's
 * avatar, or an empty seat while it is nobody's (FR-25.25). A packing row's
 * right edge, a task (FR-7.5) and a shopping entry (FR-30.12) all end in it —
 * one idiom for one question, so they cannot drift apart. Shared, because
 * the shopping module may reach only `components/global/` (ADR-066).
 *
 * `.stop.prevent` on the click because a packing row is an anchor Ionic
 * wraps, and an anchor's jump is a default action that stopping propagation
 * alone never cancelled; `@pointerdown.stop` because the row's own
 * press-and-hold (FR-5.5) must not arm under a tap meant for the seat.
 */
import { IonIcon } from '@ionic/vue'
import { personAddOutline } from 'ionicons/icons'

import UserAvatar from '@/components/global/UserAvatar.vue'
import { t } from '@/i18n'

defineProps<{
  /** Who is named — null renders the empty seat. */
  avatar: { variant: 'assignee' | 'packer'; id: string; name: string | null } | null
}>()

const emit = defineEmits<{ assign: [event: MouseEvent] }>()
</script>

<template>
  <button
    type="button"
    class="assign"
    :aria-label="avatar ? t('item.assignedTo') : t('item.assignTo')"
    @click.stop.prevent="(e: MouseEvent) => emit('assign', e)"
    @pointerdown.stop
  >
    <UserAvatar v-if="avatar" :variant="avatar.variant" :name="avatar.name" :seed="avatar.id" />
    <IonIcon v-else :icon="personAddOutline" class="assign-empty" />
  </button>
</template>

<style scoped>
/*
 * The control is the avatar's own box and nothing more: a background or a
 * ring here would put a second frame around a circle that already has one,
 * and the empty seat is the only state that needs to look like somewhere to
 * tap at all.
 */
.assign {
  display: grid;
  place-items: center;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
}

/* The empty seat is the avatar's size — 14 + 2 × 4 + 2 × 1 = 24 px — so a
   row reads the same height handed over or not. */
.assign-empty {
  font-size: var(--jp-icon-xs);
  color: var(--ct-overlay0);
  border: 1px dashed var(--ct-surface2);
  border-radius: 50%;
  padding: 4px;
}
</style>
