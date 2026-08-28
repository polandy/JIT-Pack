<script setup lang="ts">
/**
 * G-10 — trip presence: who else has this trip open, and whether the group
 * has caught up (FR-4.6).
 *
 * Advisory only. Rendered above one person, so it disappears in Single-User
 * and Local Mode without a mode check (G-8).
 *
 * **Everything it knows is on screen** (2026-08-28). The presence event
 * carries three fields, and the answer that is worth acting on is *who* is
 * behind — you turn to that person. So the state sits on each face rather
 * than behind a tap: an amber ring marks somebody still catching up, and
 * the glyph beside the pile carries their count in a bubble — the same
 * grammar G-2's own indicator uses, because a header ornament that spells
 * a sentence competes with the trip's name next to it. G-10 had specified a sheet listing each person
 * instead; a sheet was rejected because it puts the one actionable fact one
 * tap deeper than the pile that is already there, and because on a phone
 * its whole content is three fields.
 *
 * **The ring marks the exception, not the norm** — decided by rendering it
 * both ways. Ringing everyone who *is* caught up makes the ordinary state
 * loud and says the same thing as the badge beside it, and it leaves the
 * one person worth noticing marked by an absence, which is the harder thing
 * to see. Amber-on-the-straggler is also the vocabulary G-10 already uses
 * for the group badge.
 *
 * A tap still exists, for the half a hover cannot give a touch device: it
 * names the person. The device count the wire carries is deliberately not
 * rendered — that a person has the trip open twice is not something anyone
 * packing acts on.
 *
 * Names come from the host screen (M4's participant directory): a presence
 * entry carries the account id alone, and `users.id` is a random hex key.
 */
import { IonBadge, IonIcon } from '@ionic/vue'
import { checkmarkDoneOutline, closeOutline, syncOutline } from 'ionicons/icons'
import { computed, ref, watch } from 'vue'

import UserAvatar from './UserAvatar.vue'
import { t } from '@/i18n'
import type { PresenceUser } from '@/composables/useSyncOrchestrator'

const props = withDefaults(
  defineProps<{
    users: PresenceUser[]
    /** Display name per user id; a face falls back to its id where absent. */
    names?: Record<string, string>
    /**
     * Faces before the "+N" bubble. The host decides it, because it is a
     * question about the header's width and only the host knows that
     * (G-10: two on a phone, four from the desktop breakpoint).
     */
    max?: number
  }>(),
  { names: undefined, max: 4 },
)

/** Who a face is, as the trip knows them. */
function nameOf(userId: string): string {
  return props.names?.[userId] || userId
}

/**
 * Whoever is still catching up comes first, then by name.
 *
 * Not cosmetic: with more people than fit, the "+N" bubble has to hide the
 * ones nothing can be done about, or the pile would summarise away the only
 * fact it exists to show.
 */
const ordered = computed(() =>
  [...props.users].sort(
    (a, b) =>
      Number(a.in_sync) - Number(b.in_sync) || nameOf(a.user_id).localeCompare(nameOf(b.user_id)),
  ),
)

const visible = computed(() => ordered.value.slice(0, props.max))
const overflow = computed(() => Math.max(0, ordered.value.length - props.max))

const behind = computed(() => props.users.filter((u) => !u.in_sync).length)
const allInSync = computed(() => props.users.length > 0 && behind.value === 0)

/** The face whose name is currently spelled out, if any. */
const named = ref<string | null>(null)

// A person who leaves takes their line with them, rather than leaving a
// sentence about somebody who is no longer here.
watch(
  () => props.users.map((u) => u.user_id).join(),
  () => {
    if (named.value && !props.users.some((u) => u.user_id === named.value)) named.value = null
  },
)

function toggle(userId: string) {
  named.value = named.value === userId ? null : userId
}

function stateOf(user: PresenceUser): string {
  return user.in_sync ? t('presence.stateSynced') : t('presence.stateBehind')
}

/** What a face says on hover, and what the tapped line says in words. */
function describe(user: PresenceUser): string {
  return `${nameOf(user.user_id)} · ${stateOf(user)}`
}

const namedUser = computed(() => props.users.find((u) => u.user_id === named.value) ?? null)
</script>

<template>
  <div class="wrap">
    <div class="facepile" :aria-label="t('presence.activeMembers')" data-testid="presence-facepile">
      <button
        v-for="user in visible"
        :key="user.user_id"
        type="button"
        class="face"
        :class="{ behind: !user.in_sync }"
        :title="describe(user)"
        :aria-label="describe(user)"
        :data-testid="`presence-face-${nameOf(user.user_id)}`"
        @click.stop="toggle(user.user_id)"
      >
        <UserAvatar :name="nameOf(user.user_id)" :seed="user.user_id" :size="28" />
      </button>

      <span v-if="overflow > 0" class="face more" data-testid="presence-overflow">
        {{ t('presence.more', { n: overflow }) }}
      </span>

      <!-- The group answer in the app's own indicator grammar (G-2's
           SyncIndicator): a glyph, and a count in a bubble on its corner
           where there is something to count. The state is named on the
           element rather than spelled out beside it — the pile is a header
           ornament, and a sentence there competes with the trip's name. -->
      <span
        v-if="allInSync"
        class="group-sync synced"
        role="img"
        :title="t('presence.allInSync')"
        :aria-label="t('presence.allInSync')"
        data-testid="presence-in-sync"
      >
        <IonIcon :icon="checkmarkDoneOutline" />
      </span>
      <span
        v-else
        class="group-sync lagging"
        role="img"
        :title="t('presence.behind', { n: behind })"
        :aria-label="t('presence.behind', { n: behind })"
        data-testid="presence-behind"
      >
        <IonIcon :icon="syncOutline" />
        <IonBadge color="warning" data-testid="presence-behind-count">{{ behind }}</IonBadge>
      </span>
    </div>

    <!-- The touch half of the hover title: a phone has no hover, and *who*
         is behind is the only part worth acting on. -->
    <div v-if="namedUser" class="named" data-testid="presence-named">
      <span>{{ describe(namedUser) }}</span>
      <button
        type="button"
        class="dismiss"
        :aria-label="t('common.close')"
        data-testid="presence-named-dismiss"
        @click="named = null"
      >
        <IonIcon :icon="closeOutline" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.facepile {
  display: inline-flex;
  align-items: center;
}

/* The separator ring sits inside and the state ring outside, so a marked
   face carries both without either eating into the 28px circle. */
.face {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 2px solid var(--ion-background-color);
  border-radius: 50%;
  background: none;
  margin-left: -6px;
  cursor: pointer;
}

.face:first-child {
  margin-left: 0;
}

.face.behind {
  box-shadow: 0 0 0 2px var(--ct-yellow);
}

.face:focus-visible {
  outline: 2px solid var(--jp-action);
  outline-offset: 2px;
}

.more {
  cursor: default;
  width: 28px;
  height: 28px;
  background: var(--jp-surface-sunken);
  color: var(--ion-color-medium);
  font-size: var(--jp-text-3xs);
  font-weight: var(--jp-weight-semibold);
}

/* The same shape as the G-2 indicator: a relative box so the count can sit
   on the glyph's corner rather than beside it. */
.group-sync {
  position: relative;
  display: inline-flex;
  align-items: center;
  margin-left: 12px;
}

.group-sync ion-icon {
  font-size: var(--jp-icon-md);
}

.group-sync.synced {
  color: var(--ion-color-success);
}

.group-sync.lagging {
  color: var(--ion-color-warning);
}

.group-sync ion-badge {
  position: absolute;
  top: -6px;
  right: -8px;
  font-size: var(--jp-text-3xs);
  padding: 2px 4px;
}

.named {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--ion-color-medium);
  font-size: var(--jp-text-2xs);
}

.dismiss {
  display: inline-flex;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  cursor: pointer;
  font-size: var(--jp-icon-xs);
}

.dismiss:focus-visible {
  outline: 2px solid var(--jp-action);
  outline-offset: 2px;
}
</style>
