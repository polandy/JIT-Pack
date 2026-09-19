<script setup lang="ts">
/**
 * M24 — Aufräumen (FR-24.12)
 *
 * The inventory's cleanup rules, each with the one repair that answers it.
 * A rule *finds* and never refuses (see `domain/inventoryHygiene` for why a
 * refusal cannot exist here), so this screen is where the findings go rather
 * than a guard somewhere upstream.
 *
 * **Nothing here is a new way to write.** Giving a tag is FR-24.9's, a
 * retire is FR-24.3's, a merge is FR-24.10's through the same prompt M9's
 * manager uses. The screen is a way *in* to those — a list of the rows each
 * one is owed on — which is what keeps it from growing a second set of rules
 * about the same data.
 *
 * Every write raises a snackbar with **Rückgängig**, including the retire,
 * whose undo is M23's restore; a cleanup pass is a run of quick decisions,
 * and one that cannot take back a mis-tap is one people stop using.
 */
import { IonPage, IonContent, IonItem, IonLabel, IonList, IonModal, IonToggle } from '@ionic/vue'
import { checkmarkCircleOutline, optionsOutline } from 'ionicons/icons'
import { computed, ref } from 'vue'

import EmptyState from '@/components/global/EmptyState.vue'
import BulkTagSheet from '@/components/items/BulkTagSheet.vue'
import ItemMark from '@/components/items/ItemMark.vue'
import { cleanupSettings } from '@/composables/useCleanupSettings'
import { setHeaderActions } from '@/composables/useHeaderActions'
import { setHeaderTitle } from '@/composables/useHeaderTitle'
import { useInventoryHygiene } from '@/composables/useInventoryHygiene'
import { useOrchestrator } from '@/composables/useOrchestrator'
import {
  HYGIENE_RULES,
  HYGIENE_RULE_SINGLE_TAG,
  HYGIENE_RULE_UNTAGGED,
  HYGIENE_RULE_UNUSED,
  UNUSED_MONTH_CHOICES,
  type HygieneRule,
  type TagSuggestion,
  type UntaggedFinding,
} from '@/domain/inventoryHygiene'
import { tagDeletion } from '@/domain/tags'
import { formatDate, t } from '@/i18n'
import { promptTagMerge } from '@/lib/tagMergePrompt'
import { presentToast } from '@/lib/toast'
import { useMasterStore } from '@/stores/masterStore'
import type { MasterItem, Tag } from '@/types/domain'

const masterStore = useMasterStore()
const orchestrator = useOrchestrator()
const { report, unseen } = useInventoryHygiene()
const cleanup = cleanupSettings()
const settings = cleanup.settings

/** ADR-033: a partition that has not arrived has no findings to claim. */
const known = computed(() => orchestrator.masterDataLoaded())

setHeaderTitle(
  () => t('cleanup.title'),
  () => {
    if (!known.value) return null
    return report.value.total > 0
      ? t('cleanup.metaOpen', { n: report.value.total })
      : t('cleanup.metaDone')
  },
)

const rulesOpen = ref(false)

setHeaderActions(() => [
  {
    id: 'm24-rules',
    icon: optionsOutline,
    label: t('cleanup.rules'),
    onClick: () => (rulesOpen.value = true),
  },
])

const tagsById = computed(() => new Map(masterStore.tagList.map((tag) => [tag.id, tag])))
const itemsById = computed(() => new Map(masterStore.activeItemList.map((item) => [item.id, item])))

function tagName(tagId: string): string {
  return tagsById.value.get(tagId)?.name ?? ''
}

/** The master row behind a finding, for the photo rung of the ladder. */
function itemRow(id: string): MasterItem | null {
  return itemsById.value.get(id) ?? null
}

function ruleTitle(rule: HygieneRule): string {
  return t(`cleanup.rule.${rule}`)
}

function suggestionReason(s: TagSuggestion): string {
  return s.reason.kind === 'name'
    ? t('cleanup.suggestName', { name: s.reason.via })
    : t('cleanup.suggestTemplate', { name: s.reason.via })
}

async function announce(message: string, undo: () => void) {
  await presentToast({ message, buttons: [{ text: t('items.bulkUndo'), handler: undo }] })
}

// --- Ohne Tag ---------------------------------------------------------------

const withSuggestion = computed(() => report.value.untagged.filter((f) => f.suggestion))

async function takeSuggestion(finding: UntaggedFinding) {
  if (!finding.suggestion) return
  const tagId = finding.suggestion.tagId
  const assignment = orchestrator.assignTag(finding.item.id, tagId)
  await announce(t('cleanup.tagged', { name: finding.item.name, tag: tagName(tagId) }), () =>
    orchestrator.unassignTag(assignment),
  )
}

async function takeAllSuggestions() {
  const created = withSuggestion.value.map((f) =>
    orchestrator.assignTag(f.item.id, f.suggestion!.tagId),
  )
  await announce(t('cleanup.taggedAll', { n: created.length }), () => {
    for (const id of created) orchestrator.unassignTag(id)
  })
}

/** The item „Tag wählen …" was pressed on — the sheet is FR-24.9's own. */
const picking = ref<UntaggedFinding | null>(null)

async function give(tagId: string, freshTag: boolean) {
  const finding = picking.value
  picking.value = null
  if (!finding) return
  const assignment = orchestrator.assignTag(finding.item.id, tagId)
  await announce(t('cleanup.tagged', { name: finding.item.name, tag: tagName(tagId) }), () => {
    orchestrator.unassignTag(assignment)
    // A tag created for this one item goes with the undo, as FR-24.9's does.
    if (freshTag) orchestrator.deleteTag(tagId)
  })
}

// --- Lange nicht gebraucht --------------------------------------------------

function lastUsedLabel(day: string): string {
  return t('cleanup.lastUsed', { date: formatDate(new Date(`${day}T00:00:00`)) })
}

function primaryTagName(itemId: string): string {
  return masterStore.getItemTags(itemId)[0]?.name ?? ''
}

async function retire(itemId: string, name: string) {
  orchestrator.deleteMasterItem(itemId)
  // The undo is M23's restore — the row was retired, not removed: it was on
  // a trip, which is what the rule found it by.
  await announce(t('cleanup.retired', { name }), () => orchestrator.restoreMasterItem(itemId))
}

async function keepItem(itemId: string, name: string) {
  cleanup.keepItem(itemId)
  await announce(t('cleanup.kept', { name }), () => cleanup.unkeepItem(itemId))
}

// --- Tag mit nur einem Artikel ----------------------------------------------

async function mergeTag(tag: Tag) {
  await promptTagMerge(tag, {
    tags: masterStore.tagList,
    usage: tagDeletion(tag.id, masterStore.itemTagList).references,
    merge: orchestrator.mergeTags,
  })
}

async function keepTag(tag: Tag) {
  cleanup.keepTag(tag.id)
  await announce(t('cleanup.kept', { name: tag.name }), () => cleanup.unkeepTag(tag.id))
}

/** A rule is rendered while it is on; with nothing to report it collapses. */
function findings(rule: HygieneRule): number {
  if (rule === HYGIENE_RULE_UNTAGGED) return report.value.untagged.length
  if (rule === HYGIENE_RULE_UNUSED) return report.value.unused.length
  return report.value.singleTag.length
}

const enabledRules = computed(() => HYGIENE_RULES.filter((rule) => settings.value.enabled[rule]))
</script>

<template>
  <IonPage>
    <IonContent>
      <EmptyState v-if="!known" :title="t('items.listUnknown')" testid="m24-loading" />

      <template v-else>
        <EmptyState
          v-if="report.total === 0"
          :icon="checkmarkCircleOutline"
          :title="t('cleanup.doneTitle')"
          :hint="t('cleanup.doneHint')"
          testid="m24-done"
        />

        <section
          v-for="rule in enabledRules"
          :key="rule"
          class="jp-card rule"
          :class="{ quiet: findings(rule) === 0 }"
          :data-testid="`m24-rule-${rule}`"
        >
          <header class="rule-head">
            <span class="dot" :class="{ done: findings(rule) === 0 }" aria-hidden="true" />
            <span class="rule-title">
              <strong>{{ ruleTitle(rule) }}</strong>
              <span class="why">
                {{
                  findings(rule) === 0
                    ? t('cleanup.nothing')
                    : rule === HYGIENE_RULE_UNUSED
                      ? t('cleanup.rule.unusedWhy', { n: settings.unusedMonths })
                      : t(`cleanup.rule.${rule}Why`)
                }}
              </span>
            </span>
            <span v-if="findings(rule) > 0" class="count jp-num">{{ findings(rule) }}</span>
          </header>

          <!-- Ohne Tag: the suggestion, and the sheet when there is none. -->
          <template v-if="rule === HYGIENE_RULE_UNTAGGED">
            <div
              v-for="finding in report.untagged"
              :key="finding.item.id"
              class="finding"
              :data-testid="`m24-untagged-${finding.item.name}`"
            >
              <div class="finding-top">
                <ItemMark
                  :mark="itemRow(finding.item.id)?.icon ?? null"
                  surface="inventory"
                  :photo-item="itemRow(finding.item.id)"
                  initial="·"
                  :size="32"
                />
                <span class="name">{{ finding.item.name }}</span>
              </div>
              <div class="acts">
                <button
                  v-if="finding.suggestion"
                  type="button"
                  class="act suggest"
                  :data-testid="`m24-suggest-${finding.item.name}`"
                  @click="takeSuggestion(finding)"
                >
                  <ItemMark
                    :mark="tagsById.get(finding.suggestion.tagId)?.icon ?? null"
                    surface="plain"
                    :size="16"
                  />
                  + {{ tagName(finding.suggestion.tagId) }}
                </button>
                <button
                  type="button"
                  class="act"
                  :data-testid="`m24-pick-${finding.item.name}`"
                  @click="picking = finding"
                >
                  {{ t('cleanup.pick') }}
                </button>
              </div>
              <p class="reason">
                {{
                  finding.suggestion
                    ? suggestionReason(finding.suggestion)
                    : t('cleanup.noSuggestion')
                }}
              </p>
            </div>
            <footer v-if="withSuggestion.length > 1" class="rule-foot">
              <button
                type="button"
                class="act primary"
                data-testid="m24-take-all"
                @click="takeAllSuggestions"
              >
                {{ t('cleanup.takeAll', { n: withSuggestion.length }) }}
              </button>
            </footer>
          </template>

          <!-- Lange nicht gebraucht: retire or keep. -->
          <template v-else-if="rule === HYGIENE_RULE_UNUSED">
            <p v-if="findings(rule) > 0 && unseen > 0" class="honest" data-testid="m24-unseen">
              {{ t('cleanup.unseen', { n: unseen }) }}
            </p>
            <div
              v-for="finding in report.unused"
              :key="finding.item.id"
              class="finding"
              :data-testid="`m24-unused-${finding.item.name}`"
            >
              <div class="finding-top">
                <ItemMark
                  :mark="itemRow(finding.item.id)?.icon ?? null"
                  :tag-mark="masterStore.getItemTags(finding.item.id)[0]?.icon ?? null"
                  surface="inventory"
                  :photo-item="itemRow(finding.item.id)"
                  :initial="[...primaryTagName(finding.item.id)][0]?.toUpperCase() ?? '·'"
                  :size="32"
                />
                <span class="name">
                  {{ finding.item.name }}
                  <small
                    >{{ primaryTagName(finding.item.id) }} ·
                    {{ lastUsedLabel(finding.lastUsed) }}</small
                  >
                </span>
              </div>
              <div class="acts">
                <button
                  type="button"
                  class="act danger"
                  :data-testid="`m24-retire-${finding.item.name}`"
                  @click="retire(finding.item.id, finding.item.name)"
                >
                  {{ t('cleanup.retire') }}
                </button>
                <button
                  type="button"
                  class="act quiet"
                  :data-testid="`m24-keep-${finding.item.name}`"
                  @click="keepItem(finding.item.id, finding.item.name)"
                >
                  {{ t('cleanup.keep') }}
                </button>
              </div>
            </div>
          </template>

          <!-- Tag mit nur einem Artikel: merge or keep. -->
          <template v-else-if="rule === HYGIENE_RULE_SINGLE_TAG">
            <div
              v-for="finding in report.singleTag"
              :key="finding.tag.id"
              class="finding"
              :data-testid="`m24-single-${finding.tag.name}`"
            >
              <div class="finding-top">
                <span class="tag-slot">
                  <ItemMark
                    :mark="tagsById.get(finding.tag.id)?.icon ?? null"
                    surface="plain"
                    :size="22"
                  />
                </span>
                <span class="name">
                  {{ finding.tag.name }}
                  <small>{{ t('cleanup.onlyOn', { name: finding.item.name }) }}</small>
                </span>
              </div>
              <div class="acts">
                <button
                  type="button"
                  class="act"
                  :data-testid="`m24-merge-${finding.tag.name}`"
                  @click="mergeTag(tagsById.get(finding.tag.id)!)"
                >
                  {{ t('cleanup.merge') }}
                </button>
                <button
                  type="button"
                  class="act quiet"
                  :data-testid="`m24-keep-tag-${finding.tag.name}`"
                  @click="keepTag(tagsById.get(finding.tag.id)!)"
                >
                  {{ t('cleanup.keep') }}
                </button>
              </div>
            </div>
          </template>
        </section>
      </template>

      <!-- FR-24.9's sheet: searchable, and it creates the tag it did not find. -->
      <BulkTagSheet
        :is-open="picking !== null"
        mode="give"
        :tags="masterStore.tagList"
        :counts="new Map()"
        :selected="1"
        :refile="false"
        @dismiss="picking = null"
        @pick="({ tagId }) => give(tagId, false)"
        @create="({ name }) => give(orchestrator.createTag(name), true)"
      />

      <!-- The rules this device runs (FR-24.12) — device-local, no save button. -->
      <IonModal
        :is-open="rulesOpen"
        :initial-breakpoint="0.6"
        :breakpoints="[0, 0.6]"
        data-testid="m24-rules-sheet"
        @didDismiss="rulesOpen = false"
      >
        <div class="sheet-body ion-padding">
          <h2 class="jp-sheet-title">{{ t('cleanup.rules') }}</h2>
          <p class="sheet-hint">{{ t('cleanup.rulesHint') }}</p>
          <IonList>
            <IonItem v-for="rule in HYGIENE_RULES" :key="rule" lines="full">
              <IonLabel class="ion-text-wrap">
                {{ ruleTitle(rule) }}
                <div v-if="rule === HYGIENE_RULE_UNUSED" class="months" role="group">
                  <button
                    v-for="n in UNUSED_MONTH_CHOICES"
                    :key="n"
                    type="button"
                    class="act"
                    :class="{ primary: settings.unusedMonths === n }"
                    :aria-pressed="settings.unusedMonths === n"
                    :data-testid="`m24-months-${n}`"
                    @click="cleanup.setUnusedMonths(n)"
                  >
                    {{ t('cleanup.months', { n }) }}
                  </button>
                </div>
              </IonLabel>
              <IonToggle
                slot="end"
                :checked="settings.enabled[rule]"
                :data-testid="`m24-toggle-${rule}`"
                @ionChange="cleanup.setRule(rule, $event.detail.checked)"
              />
            </IonItem>
          </IonList>
        </div>
      </IonModal>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.rule {
  margin: 12px 14px;
  padding: 0;
  overflow: hidden;
}

.rule-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 13px 14px 11px;
}

.dot {
  flex: none;
  width: 9px;
  height: 9px;
  margin-top: 7px;
  border-radius: 50%;
  background: var(--ion-color-warning);
}

.dot.done {
  background: var(--jp-done);
}

.rule-title {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.rule.quiet .rule-title strong {
  color: var(--ct-subtext0);
}

.why {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.count {
  padding: 2px 9px;
  border-radius: var(--jp-r-pill);
  background: var(--jp-surface-sunken);
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
}

.finding {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--ct-surface0);
}

.finding-top {
  display: flex;
  align-items: center;
  gap: 12px;
}

.name {
  display: flex;
  flex-direction: column;
  min-width: 0;
  color: var(--ct-text);
  overflow-wrap: anywhere;
}

.name small {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}

.tag-slot {
  display: grid;
  flex: none;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: var(--jp-r-md);
  background: var(--jp-surface-sunken);
}

.acts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-inline-start: 44px;
}

.act {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border: 1px solid var(--ct-surface1);
  border-radius: var(--jp-r-pill);
  background: none;
  color: var(--ct-subtext1);
  font-size: var(--jp-text-sm);
  cursor: pointer;
}

.act.suggest {
  border-style: dashed;
  border-color: var(--jp-done);
  color: var(--jp-done);
}

.act.primary {
  border-color: var(--jp-action);
  background: var(--jp-action);
  color: var(--ct-crust);
}

.act.danger {
  border-color: var(--ion-color-danger);
  color: var(--ion-color-danger);
}

.act.quiet {
  border-color: transparent;
  color: var(--ct-subtext0);
}

.reason {
  margin: -2px 0 0;
  padding-inline-start: 44px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.honest {
  margin: 0;
  padding: 0 14px 10px 33px;
  color: var(--ct-subtext0);
  font-size: var(--jp-text-xs);
}

.rule-foot {
  display: flex;
  justify-content: flex-end;
  padding: 10px 14px 13px;
  border-top: 1px solid var(--ct-surface0);
}

.months {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.sheet-hint {
  color: var(--ct-subtext0);
  font-size: var(--jp-text-sm);
}
</style>
