<script setup lang="ts">
/**
 * M17's Notifications section (FR-6.2 / NFR-4.6): per-kind toggles and the
 * Web Push opt-in for this device. The page mounts it on every server; a
 * Single-User instance (`collaborative` false) shows only the kinds that can
 * happen to one person alone (FR-7.11), Local Mode nothing (G-8).
 */
import { IonList, IonItem, IonLabel, IonNote, IonToggle } from '@ionic/vue'
import { onMounted, ref } from 'vue'
import type { NotificationPrefs } from '@/notifications/format'
import { pushRegistered, pushSupported, registerPush, unregisterPush } from '@/notifications/push'
import { type MessageKey, t } from '@/i18n'
import SectionHead from '@/components/global/SectionHead.vue'
import { useOrchestrator } from '@/composables/shared/useOrchestrator'

const props = defineProps<{
  /** A multi-user instance: every kind. Otherwise only `SOLO_KINDS`. */
  collaborative: boolean
}>()

const orchestrator = useOrchestrator()

/** The kinds a person alone can receive: none is anybody's act (FR-17.3's reason). */
const SOLO_KINDS: ReadonlySet<keyof NotificationPrefs> = new Set([
  'task_due',
  'shopping_due',
  'excursion_due',
])

const prefs = ref<NotificationPrefs | null>(null)
const pushOn = ref(false)
const pushAvailable = pushSupported()

onMounted(async () => {
  prefs.value = await orchestrator.notifications.fetchNotificationPrefs()
  pushOn.value = await pushRegistered()
})

/*
 * Keys, not finished text: a module-level constant is evaluated once at import
 * and a language switch can never reach it — the same trap the nav anchors and
 * route titles were caught in during the i18n migration. `t()` runs during
 * render here, so it tracks the locale.
 */
const prefRows: { kind: keyof NotificationPrefs; label: MessageKey; hint: MessageKey }[] = [
  { kind: 'delegation', label: 'settings.prefDelegation', hint: 'settings.prefDelegationHint' },
  { kind: 'mention', label: 'settings.prefMention', hint: 'settings.prefMentionHint' },
  { kind: 'task', label: 'settings.prefTask', hint: 'settings.prefTaskHint' },
  { kind: 'lock_taken', label: 'settings.prefLockTaken', hint: 'settings.prefLockTakenHint' },
  { kind: 'note', label: 'settings.prefNote', hint: 'settings.prefNoteHint' },
  { kind: 'note_reply', label: 'settings.prefNoteReply', hint: 'settings.prefNoteReplyHint' },
  // FR-29.8: the planner's three kinds, each its own switch.
  { kind: 'idea', label: 'settings.prefIdea', hint: 'settings.prefIdeaHint' },
  { kind: 'idea_comment', label: 'settings.prefIdeaComment', hint: 'settings.prefIdeaCommentHint' },
  {
    kind: 'idea_shortlisted',
    label: 'settings.prefIdeaShortlisted',
    hint: 'settings.prefIdeaShortlistedHint',
  },
  { kind: 'task_due', label: 'settings.prefTaskDue', hint: 'settings.prefTaskDueHint' },
  // FR-30.10: a purchase's reminder, its own switch.
  { kind: 'shopping_due', label: 'settings.prefShoppingDue', hint: 'settings.prefShoppingDueHint' },
  // FR-31.9: an excursion's reminder, its own switch.
  {
    kind: 'excursion_due',
    label: 'settings.prefExcursionDue',
    hint: 'settings.prefExcursionDueHint',
  },
]

/** The rows this instance can actually send (FR-7.11, FR-30.10, FR-31.9: Single-User only the reminders). */
const shownPrefRows = props.collaborative
  ? prefRows
  : prefRows.filter((row) => SOLO_KINDS.has(row.kind))

async function togglePref(kind: keyof NotificationPrefs, enabled: boolean) {
  if (!prefs.value) return
  prefs.value = { ...prefs.value, [kind]: enabled }
  await orchestrator.notifications.saveNotificationPrefs(prefs.value)
}

async function togglePush(enabled: boolean) {
  if (enabled) {
    pushOn.value = await registerPush(orchestrator.notifications.pushApi)
  } else {
    await unregisterPush(orchestrator.notifications.pushApi)
    pushOn.value = false
  }
}
</script>

<template>
  <SectionHead :title="t('settings.notifications')" data-testid="settings-section-notifications" />
  <IonList v-if="prefs">
    <IonItem v-for="p in shownPrefRows" :key="p.kind" :data-testid="`settings-pref-${p.kind}`">
      <IonLabel>
        <h3>{{ t(p.label) }}</h3>
        <p>{{ t(p.hint) }}</p>
      </IonLabel>
      <IonToggle
        slot="end"
        :checked="prefs[p.kind]"
        :aria-label="t(p.label)"
        @ionChange="(e: CustomEvent) => togglePref(p.kind, e.detail.checked)"
      />
    </IonItem>
    <IonItem>
      <IonLabel>
        <h3>{{ t('settings.push') }}</h3>
        <p>
          {{ pushAvailable ? t('settings.pushHint') : t('settings.pushUnsupported') }}
        </p>
      </IonLabel>
      <IonToggle
        slot="end"
        data-testid="settings-push"
        :checked="pushOn"
        :disabled="!pushAvailable"
        :aria-label="t('settings.push')"
        @ionChange="(e: CustomEvent) => togglePush(e.detail.checked)"
      />
    </IonItem>
  </IonList>
  <IonNote v-else>{{ t('settings.notificationsUnavailable') }}</IonNote>
</template>
