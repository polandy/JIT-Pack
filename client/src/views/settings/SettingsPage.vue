<script setup lang="ts">
/**
 * M17 — Settings (personal preferences only; no admin functions, the
 * instance is configured declaratively per PRD Section 2).
 *
 * Profile (FR-17.13): the picture is editable wherever there is a server
 * identity — pan/zoom cropped to a 256×256 JPEG on-device (AvatarCropModal)
 * — because no identity provider supplies one, so gating it on Single-User
 * Mode would mean a multi-user instance can never have one. The display
 * name is different: with an OIDC session it comes from the IdP, so it
 * stays read-only there rather than becoming an editable copy. Local Mode
 * has no server identity at all, so the section is a note.
 *
 * Appearance (FR-21.3, FR-21.29): opt-in light theme (Tag, ADR-048) and
 * the start animation, device-local display preferences — shown in every
 * mode, never synced.
 *
 * Notifications, Data, API tokens and Connection are their own components
 * (`components/settings/Settings*Section.vue`); this page decides which of
 * them a mode shows.
 */
import { API } from '@/api/routes'
import { UPDATE_STATE } from '@/api/types'
import type { InstanceUpdateResponse } from '@/api/types'
import {
  IonPage,
  IonContent,
  IonButton,
  IonList,
  IonItem,
  IonLabel,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonNote,
  IonIcon,
  IonToggle,
  onIonViewWillEnter,
} from '@ionic/vue'
import { addOutline, closeOutline, personOutline } from 'ionicons/icons'
import { computed, onMounted, ref } from 'vue'

import { loadTokens } from '@/auth/tokens'
import { hasCollaborativeSession, readMode } from '@/mode'
import { serverBaseUrl } from '@/config'
import { isValidDisplayName } from '@/domain/displayName'
import { useMasterStore } from '@/stores/masterStore'
import { currentTheme, setTheme } from '@/theme/theme'
import { setSplashEnabled, splashEnabled } from '@/lib/splash'
import { type Locale, currentLocale, formatDate, setLocale, t } from '@/i18n'
import UserAvatar from '@/components/global/UserAvatar.vue'
import AvatarCropModal from '@/components/settings/AvatarCropModal.vue'
import SettingsConnectionSection from '@/components/settings/SettingsConnectionSection.vue'
import SettingsDataSection from '@/components/settings/SettingsDataSection.vue'
import SettingsNotificationsSection from '@/components/settings/SettingsNotificationsSection.vue'
import SettingsTokensSection from '@/components/settings/SettingsTokensSection.vue'
import { useIdentity } from '@/composables/shared/useTripIdentity'
import { defaultTravelers } from '@/composables/useDefaultTravelers'
import { PATH } from '@/router/paths'
import { useOrchestrator } from '@/composables/shared/useOrchestrator'
import SectionHead from '@/components/global/SectionHead.vue'

const orchestrator = useOrchestrator()
const { me, directory, load: loadIdentity } = useIdentity(orchestrator.identity)
const masterStore = useMasterStore()

const mode = readMode()
/**
 * The display name is IdP-sourced with an OIDC session, so editing it there
 * would be editing a copy (FR-17.13).
 */
const nameEditable = mode === 'server' && !loadTokens()
/**
 * The picture is not: no identity provider supplies one, so a read-only
 * profile in Server Mode means the picture can never exist in the mode a
 * multi-user instance actually runs in. Editable wherever there is a server
 * identity at all — Local Mode has none (FR-17.13).
 */
const pictureEditable = mode === 'server'
/** Multi-user instance → notifications exist (FR-17.3/FR-19.3 hide them otherwise). */
const collaborative = hasCollaborativeSession()

/**
 * FR-7.11: a server with no session is Single-User — and it still sends the
 * one kind nobody sets off, the due-task reminder. So the section exists
 * there too, with only the rows that can happen to one person alone, and the
 * push toggle the reminder needs to reach a closed app.
 */
const notifiable = mode === 'server'

const nameDraft = ref('')
const nameSaved = ref(false)
const avatarVersion = ref(0)

onMounted(async () => {
  await loadIdentity()
  // Not awaited: the release line is the least urgent thing on this screen,
  // and on an instance that does not answer, awaiting it would hold the
  // rest of the screen behind a request that is allowed to time out.
  void loadInstanceUpdate()
  nameDraft.value = me.value?.display_name ?? ''
})

// --- Appearance (FR-21.3, device-local) ---

/**
 * FR-2.5a: the people a new trip starts with. Device-local like the
 * theme beside it, and a starting point rather than a rule — M3 edits
 * them freely.
 */
const travelers = defaultTravelers()
const travelerNames = travelers.names
const newTraveler = ref('')

/** Accounts not yet among the defaults; the list is empty (and the picker absent) outside a session. */
const pickableUsers = computed(() =>
  directory.value.filter((u) => !travelers.entries.value.some((e) => e.userId === u.user_id)),
)

function addAccountTraveler(userId: string) {
  const user = directory.value.find((u) => u.user_id === userId)
  if (user) travelers.add(user.display_name, user.user_id)
}

function addTraveler() {
  travelers.add(newTraveler.value)
  newTraveler.value = ''
}

const lightTheme = ref(currentTheme() === 'day')

function toggleLightTheme(enabled: boolean) {
  setTheme(enabled ? 'day' : 'night')
  lightTheme.value = enabled
}

// FR-21.29: read at the next cold start, so the toggle only records the choice.
const splash = ref(splashEnabled())

function toggleSplash(enabled: boolean) {
  setSplashEnabled(enabled)
  splash.value = enabled
}

// --- Language (NFR-4.12, device-local like the theme) ---

const language = ref<Locale>(currentLocale())

function changeLanguage(next: Locale) {
  setLocale(next)
  language.value = next
}

// FR-17.13: validated inline, but only after the field was touched — the
// untouched server-provided name must never greet the user with an error.
const nameValid = computed(() => isValidDisplayName(nameDraft.value))
const nameTouched = ref(false)

async function saveName() {
  if (!me.value || !nameValid.value) return
  // The store is refreshed by `saveDisplayName` itself (ADR-047), so the
  // name this screen shows and the name M4 puts on a packed row are one
  // answer — a ref of this screen's own would leave every other screen's
  // copy behind until it was remounted.
  await orchestrator.identity.saveDisplayName(me.value.user_id, nameDraft.value)
  nameSaved.value = true
  setTimeout(() => (nameSaved.value = false), 2000)
}

const avatarUrl = computed(() =>
  me.value
    ? `${serverBaseUrl()}${API.userAvatar(me.value.user_id)}?v=${avatarVersion.value}`
    : null,
)

// FR-17.13: the picked photo opens the pan/zoom crop modal; the modal
// hands back a ready 256×256 JPEG.
const cropFile = ref<File | null>(null)
const cropOpen = ref(false)

function onAvatarFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // allow re-picking the same file after cancel
  if (!file || !me.value) return
  cropFile.value = file
  cropOpen.value = true
}

async function onAvatarCropped(blob: Blob) {
  cropOpen.value = false
  if (!me.value) return
  await orchestrator.identity.uploadAvatar(me.value.user_id, blob)
  avatarVersion.value++
}

const retiredCount = computed(
  () => masterStore.retiredItemList.length + masterStore.retiredTemplateList.length,
)

const modeText = computed(() =>
  mode === 'local' ? t('settings.modeLocal') : t('settings.modeServer', { url: serverBaseUrl() }),
)

// Build-time constants (vite.config.ts's `define`, git describe/rev-parse or
// the Docker build's APP_VERSION/APP_COMMIT args) — same in every mode,
// since this names the build itself rather than anything server-side.
const appVersionText = computed(() =>
  t('settings.aboutVersion', { version: __APP_VERSION__, commit: __APP_COMMIT__ }),
)

/*
 * FR-23.8 — whether the instance is behind its upstream releases.
 *
 * Read once per app start rather than on every entry: the server answers
 * from a day-old cache anyway, and this line is read when somebody comes
 * looking. Server Mode only — Local Mode has no server to ask, and the
 * line is then absent rather than broken (invariant 5, G-8). A failure
 * leaves it absent too: an instance that cannot answer says nothing, which
 * is what the `off` state already looks like.
 *
 * Deliberately not NFR-4.13's waiting build (FR-19.7): that one every
 * device applies for itself, so it is a banner. This one only whoever runs
 * the instance can act on, so it is a line where they already look.
 */
const instanceUpdate = ref<InstanceUpdateResponse | null>(null)

async function loadInstanceUpdate() {
  if (mode !== 'server') return
  try {
    const resp = await fetch(`${serverBaseUrl()}${API.instanceUpdate}`)
    if (resp.ok) instanceUpdate.value = await resp.json()
  } catch {
    // Server unreachable — the line stays away rather than guessing.
  }
}

/** The moment the answer on screen came from, in the app's locale (UX-5). */
const updateCheckedAt = computed(() => {
  const at = instanceUpdate.value?.checked_at
  return at ? formatDate(new Date(at), { dateStyle: 'short', timeStyle: 'short' }) : ''
})

const updateUnreachableText = computed(() =>
  updateCheckedAt.value
    ? t('settings.updateUnreachableSince', { when: updateCheckedAt.value })
    : t('settings.updateUnreachable'),
)

/** The Data section re-reads its backup stamp on every entry (Ionic keeps this page mounted). */
const dataSection = ref<InstanceType<typeof SettingsDataSection> | null>(null)
onIonViewWillEnter(() => dataSection.value?.refreshReminder())
</script>

<template>
  <IonPage>
    <IonContent class="ion-padding">
      <!-- Profile (FR-17.13) -->
      <SectionHead :title="t('settings.profile')" data-testid="settings-section-profile" />
      <template v-if="mode === 'local'">
        <IonNote>{{ t('settings.profileLocalNote') }}</IonNote>
      </template>
      <template v-else-if="me">
        <div class="avatar-row">
          <UserAvatar
            :name="me.display_name || me.user_id"
            :seed="me.user_id"
            :src="avatarUrl"
            :size="64"
          />
          <label v-if="pictureEditable" class="avatar-upload">
            {{ t('settings.changePicture') }}
            <input type="file" accept="image/*" hidden @change="onAvatarFile" />
          </label>
        </div>
        <AvatarCropModal
          :open="cropOpen"
          :file="cropFile"
          @crop="onAvatarCropped"
          @cancel="cropOpen = false"
        />
        <IonList>
          <IonItem>
            <IonInput
              :label="t('settings.displayName')"
              label-placement="stacked"
              data-testid="settings-name-input"
              :value="nameDraft"
              :readonly="!nameEditable"
              :maxlength="50"
              @ionInput="
                (e: CustomEvent) => {
                  nameDraft = e.detail.value ?? ''
                  nameTouched = true
                }
              "
            />
            <IonButton
              v-if="nameEditable"
              slot="end"
              size="small"
              data-testid="settings-name-save"
              :disabled="!nameValid || nameDraft === me.display_name"
              @click="saveName"
            >
              {{ nameSaved ? t('settings.saved') : t('common.save') }}
            </IonButton>
          </IonItem>
        </IonList>
        <IonNote
          v-if="nameEditable && nameTouched && !nameValid"
          color="danger"
          data-testid="settings-name-rule"
        >
          {{ t('settings.nameRule') }}
        </IonNote>
        <IonNote v-else-if="!nameEditable" data-testid="settings-name-managed">
          {{ t('settings.nameManaged') }}
        </IonNote>
      </template>
      <IonNote v-else>{{ t('settings.profileUnavailable') }}</IonNote>

      <!-- Appearance (FR-21.3, FR-21.29) — every mode, this device only -->
      <SectionHead :title="t('settings.appearance')" data-testid="settings-section-appearance" />
      <IonList>
        <IonItem>
          <IonLabel>
            <h3>{{ t('settings.lightTheme') }}</h3>
            <p>{{ t('settings.lightThemeHint') }}</p>
          </IonLabel>
          <IonToggle
            slot="end"
            data-testid="settings-theme"
            :checked="lightTheme"
            :aria-label="t('settings.lightTheme')"
            @ionChange="(e: CustomEvent) => toggleLightTheme(e.detail.checked)"
          />
        </IonItem>
        <IonItem>
          <IonLabel>
            <h3>{{ t('settings.splash') }}</h3>
            <p>{{ t('settings.splashHint') }}</p>
          </IonLabel>
          <IonToggle
            slot="end"
            data-testid="settings-splash"
            :checked="splash"
            :aria-label="t('settings.splash')"
            @ionChange="(e: CustomEvent) => toggleSplash(e.detail.checked)"
          />
        </IonItem>
        <IonItem>
          <IonLabel>
            <h3>{{ t('settings.language') }}</h3>
            <p>{{ t('settings.languageHint') }}</p>
          </IonLabel>
          <IonSelect
            slot="end"
            data-testid="settings-language"
            :value="language"
            interface="popover"
            :aria-label="t('settings.language')"
            @ionChange="(e: CustomEvent) => changeLanguage(e.detail.value)"
          >
            <IonSelectOption value="en">{{ t('settings.languageEnglish') }}</IonSelectOption>
            <IonSelectOption value="de">{{ t('settings.languageGerman') }}</IonSelectOption>
          </IonSelect>
        </IonItem>
      </IonList>

      <!-- Default travelers (FR-2.5a) — every mode, this device only -->
      <SectionHead :title="t('settings.defaultTravelers')" />
      <p class="section-hint">{{ t('settings.defaultTravelersHint') }}</p>
      <IonList>
        <IonItem v-for="(traveler, index) in travelerNames" :key="`${traveler}-${index}`">
          <IonIcon slot="start" :icon="personOutline" />
          <IonLabel>{{ traveler }}</IonLabel>
          <IonNote v-if="travelers.entries.value[index]?.userId" slot="end">{{
            t('settings.travelerLinked')
          }}</IonNote>
          <IonButton
            slot="end"
            fill="clear"
            size="small"
            :data-testid="`default-traveler-remove-${traveler}`"
            :aria-label="t('common.remove')"
            @click="travelers.remove(index)"
          >
            <IonIcon slot="icon-only" :icon="closeOutline" />
          </IonButton>
        </IonItem>
        <!-- Same add-row shape as M22's traveller editor: a placeholder
             input and a labelled button, no stacked label — the scaled
             floating label renders with glyph gaps mid-word and its lone +
             reads as detached. -->
        <IonItem lines="none">
          <IonInput
            data-testid="default-traveler-input"
            :aria-label="t('settings.addTraveler')"
            fill="outline"
            :placeholder="t('settings.addTraveler')"
            :value="newTraveler"
            @ionInput="(e: CustomEvent) => (newTraveler = e.detail.value ?? '')"
            @keydown.enter="addTraveler"
          />
          <IonButton
            slot="end"
            data-testid="default-traveler-add"
            :disabled="newTraveler.trim() === ''"
            @click="addTraveler"
          >
            <IonIcon slot="start" :icon="addOutline" />
            {{ t('common.add') }}
          </IonButton>
        </IonItem>
        <!-- G-8: only a session has accounts to pick from. -->
        <IonItem v-if="collaborative && pickableUsers.length > 0" lines="none">
          <IonSelect
            data-testid="default-traveler-user"
            interface="popover"
            :aria-label="t('settings.addTravelerAccount')"
            :placeholder="t('settings.addTravelerAccount')"
            :value="null"
            @ionChange="(e: CustomEvent) => addAccountTraveler(String(e.detail.value))"
          >
            <IonSelectOption v-for="u in pickableUsers" :key="u.user_id" :value="u.user_id">
              {{ u.display_name }}
            </IonSelectOption>
          </IonSelect>
        </IonItem>
      </IonList>

      <!-- Notifications (FR-6.2 / NFR-4.6) — every server; Single-User sees
           only what can happen to one person (FR-7.11), Local nothing (G-8). -->
      <SettingsNotificationsSection v-if="notifiable" :collaborative="collaborative" />

      <!-- Data (NFR-4.5) -->
      <SettingsDataSection ref="dataSection" />

      <!-- Administration entry (Addendum 3.23, FR-23.2): instance
           admins with an OIDC session only — same gating as M20. -->
      <template v-if="collaborative && me?.is_instance_admin">
        <SectionHead :title="t('settings.administration')" data-testid="settings-section-admin" />
        <IonList>
          <IonItem
            button
            lines="none"
            data-testid="settings-admin"
            @click="$router.push(PATH.admin)"
          >
            <IonLabel>
              <h3>{{ t('settings.userAdmin') }}</h3>
              <p>{{ t('settings.userAdminHint') }}</p>
            </IonLabel>
          </IonItem>
        </IonList>
      </template>

      <!-- API tokens (FR-23.7, ADR-039): a session only (G-8). -->
      <SettingsTokensSection v-if="collaborative" />

      <!-- M23 (FR-24.3): what a delete only hid, and the way back. Beside
           the conflict log because both are corrective surfaces rather than
           browsing ones, reached after something went wrong. -->
      <SectionHead :title="t('settings.retired')" data-testid="settings-section-retired" />
      <IonList>
        <IonItem
          button
          lines="none"
          data-testid="settings-retired"
          @click="$router.push(PATH.masterRetired)"
        >
          <IonLabel>
            <h3>{{ t('settings.retiredRow') }}</h3>
            <p>{{ t('settings.retiredHint') }}</p>
          </IonLabel>
          <IonNote v-if="retiredCount > 0" slot="end" data-testid="settings-retired-count">
            {{ t('settings.retiredCount', { n: retiredCount }) }}
          </IonNote>
        </IonItem>
      </IonList>

      <!-- Conflict log pointer (G-2) -->
      <SectionHead :title="t('settings.conflictLog')" data-testid="settings-section-conflicts" />
      <IonNote>{{ t('settings.conflictLogNote') }}</IonNote>

      <!-- FR-19.9: Server Mode only (G-8). -->
      <SettingsConnectionSection v-if="mode === 'server'" />

      <!-- App info -->
      <SectionHead :title="t('settings.about')" data-testid="settings-section-about" />
      <IonList>
        <IonItem lines="none">
          <IonLabel>
            <h3>JIT-Pack</h3>
            <p>{{ modeText }}</p>
            <p data-testid="settings-app-version">{{ appVersionText }}</p>
            <!-- FR-23.8: nothing at all where the instance makes no check. -->
            <p
              v-if="instanceUpdate?.state === UPDATE_STATE.available"
              class="update-available"
              data-testid="settings-update-available"
            >
              <span class="jp-eyebrow update-badge">{{ t('settings.updateBadge') }}</span>
              <span>{{ t('settings.updateAvailable', { version: instanceUpdate.latest }) }}</span>
              <a
                v-if="instanceUpdate.release_url"
                :href="instanceUpdate.release_url"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="settings-update-link"
                >{{ t('settings.updateReleaseNotes') }}</a
              >
            </p>
            <p
              v-else-if="instanceUpdate?.state === UPDATE_STATE.current"
              class="update-current"
              data-testid="settings-update-current"
            >
              {{ t('settings.updateCurrent', { when: updateCheckedAt }) }}
            </p>
            <p
              v-else-if="instanceUpdate?.state === UPDATE_STATE.unreachable"
              class="update-unreachable"
              data-testid="settings-update-unreachable"
            >
              {{ updateUnreachableText }}
            </p>
          </IonLabel>
        </IonItem>
      </IonList>
    </IonContent>
  </IonPage>
</template>

<style scoped>
/*
 * FR-23.8's line. Larch (the brand) rather than a warning colour: a release
 * is not a fault, and the one thing the reader does here is decide whether
 * to look at what changed.
 */
.update-available {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
}

/*
 * The type is the G-13 eyebrow role, so this block decides nothing about
 * it. The one thing it overrides is the role's recessive colour: here the
 * label *is* the signal, and the role's own note is why that override is
 * spelled out rather than left to look like an accident.
 */
.update-badge {
  color: var(--jp-brand);
  border: 1px solid var(--jp-brand);
  border-radius: var(--jp-r-xs);
  padding: 1px 6px;
}

.update-available a {
  color: var(--jp-action);
}

.update-current {
  color: var(--jp-done);
}

/*
 * An instance that cannot reach GitHub is the normal case for an
 * offline-first deployment, so this is the recessive ink and not a danger
 * colour.
 */
.update-unreachable {
  color: var(--ct-overlay1);
}

/*
 * The recessive line under a section heading. It was already used at the
 * default-travelers block and defined nowhere — the class lives scoped inside
 * ItemEditorPage, so on this screen it painted nothing and the hint read as
 * ordinary body copy. Found by looking at the rendered screen; no test could
 * have said it, and no stylesheet reading would have either.
 */
.section-hint {
  font-size: var(--jp-text-sm);
  color: var(--ct-subtext0);
  margin: 0 0 8px;
}

.avatar-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 8px;
}

.avatar-upload {
  color: var(--ion-color-primary);
  cursor: pointer;
  font-size: var(--jp-text-base);
}
</style>
