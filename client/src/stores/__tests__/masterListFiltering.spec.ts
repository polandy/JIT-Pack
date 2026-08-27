/**
 * FR-24.3 / ADR-032 — which surfaces may read the *complete* master lists.
 *
 * `itemList` and `templateList` mean everything, retired rows included, and
 * the display surfaces opt in to `activeItemList` / `activeTemplateList`.
 * That split was chosen because its two failure directions are not equal: a
 * retired row in a picker is noise, while a retired row missing from
 * resolution, from an export or from the NFR-4.11 backup empties a generated
 * trip or a device's only copy.
 *
 * Read as source files, the way markRendering.spec.ts guards the mark face:
 * no rendered test of one screen can see that a *thirteenth* screen started
 * reading the complete list. ADR-032 recorded the enumeration as an accepted
 * cost of the design — this is that enumeration, executable, so a new call
 * site has to be classified rather than merely written.
 */
import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, it, expect } from 'vitest'

/**
 * The files that legitimately read the complete lists, and why each one does.
 * Everything else must read the active lists — including a file that appears
 * here for one of its reads and uses the active list for the rest.
 */
const COMPLETE_LIST_READERS: Record<string, string> = {
  'src/App.vue': 'the NFR-4.11 device backup — fidelity, not a listing',
  'src/composables/useSyncOrchestrator.ts':
    'generation, the FR-27.4 refresh, FR-27.10, clone and M21 all resolve positions that may name a retired row',
  'src/composables/sync/actions/masterData.ts':
    "FR-24.3's reference count — a position inside a retired Vorlage still keeps its item alive",
  'src/composables/sync/actions/groupRefresh.ts':
    'FR-27.4 re-resolves a trip against the Vorlagen it follows — a retired one still resolves, or the refresh proposes deleting every row it ever produced',
  'src/composables/sync/actions/tripLifecycle.ts':
    'FR-27.10 resolves the group being added — a retired Vorlage inside it still contributes the positions it always did',
  'src/composables/sync/actions/postTrip.ts':
    'M21 folds a trip into a Vorlage against every master item, retired or not — a row the trip carries must still be recognised rather than invented a second time (the group list beside it is deliberately the active one)',
  'src/composables/sync/actions/packing.ts':
    'FR-20.4 resolution looks up the item a dependency names — a retired one still has to resolve, or the companion row has no name',
  'src/domain/portableImport.ts': 'import matches against everything, or it duplicates a name',
  'src/views/import/ImportPage.vue':
    'FR-16.3 dedup — matching a retired item beats creating a twin',
  'src/views/import/PortableImportPage.vue': 'the same matching, on the portable path',
  'src/views/trips/TripWizardPage.vue':
    'generateTripItems and resolveDependencies (its scope rows use the active list)',
  'src/views/trips/ReviewPage.vue':
    'buildReviewProposals (its retarget offer uses the active list)',
  'src/views/trips/TemplateFromTripPage.vue': 'planTemplateFromTrip writes against every item',
  'src/views/templates/TemplateEditorPage.vue':
    'resolved preview lines and the quick-add name lookup (its pickers use the active list)',
  'src/components/global/QuickAddItem.vue':
    'the resolved lines of a group preview (its offers use the active list)',
  'src/components/templates/GroupPeekSheet.vue': 'FR-27.12 renders what a group resolves to',
  'src/components/trips/ItemDetailSheet.vue': 'FR-20 companion resolution on an existing row',
}

const COMPLETE_LIST = /\.(itemList|templateList)\b/

/** The file that declares all four getters is not a caller of them. */
const DEFINITION = 'src/stores/masterStore.ts'

const sources = globSync('src/**/*.{ts,vue}', { cwd: process.cwd() })
  .map((path) => path.replace(/\\/g, '/'))
  .filter((path) => !path.includes('__tests__') && path !== DEFINITION)
  .map((path) => ({ path, source: readFileSync(resolve(process.cwd(), path), 'utf8') }))

describe('FR-24.3 — the complete master lists are read on purpose (ADR-032)', () => {
  it('finds the sources to check at all', () => {
    // A glob that silently matched nothing would make everything below pass.
    expect(sources.length).toBeGreaterThan(100)
  })

  it('lets no unlisted file read the complete lists', () => {
    const offenders = sources
      .filter(({ path, source }) => COMPLETE_LIST.test(source) && !(path in COMPLETE_LIST_READERS))
      .map(({ path }) => path)
    // A display surface reading `itemList` offers rows the inventory hides;
    // classify it here with its reason, or read `activeItemList`.
    expect(offenders).toEqual([])
  })

  it('keeps no stale entry — every listed file still reads them', () => {
    const byPath = new Map(sources.map(({ path, source }) => [path, source]))
    const stale = Object.keys(COMPLETE_LIST_READERS).filter((path) => {
      const source = byPath.get(path)
      return source === undefined || !COMPLETE_LIST.test(source)
    })
    expect(stale).toEqual([])
  })

  it('keeps every mixed reader reading the active lists too', () => {
    // These four resolve *and* offer, so the rule above cannot speak for
    // them: they are on the allowlist for their resolution reads. What can
    // be pinned is that their offer reads exist at all — a wholesale revert
    // to the complete lists fails here, which is otherwise asserted nowhere.
    const mixed = [
      'src/views/templates/TemplateEditorPage.vue', // pickers + FR-27.15 folds
      'src/views/trips/TripWizardPage.vue', // scope rows + the empty hint
      'src/views/trips/ReviewPage.vue', // the FR-27.11 retarget offer
      'src/views/trips/TemplateFromTripPage.vue', // the groups M21 offers
      'src/components/global/QuickAddItem.vue', // chips, group matches, browse door
    ]
    const byPath = new Map(sources.map(({ path, source }) => [path, source]))
    for (const path of mixed) {
      const source = byPath.get(path)
      expect(source, `${path} is not in the scanned sources`).toBeDefined()
      expect(
        /\.(activeItemList|activeTemplateList)\b/.test(source!),
        `${path} reads no active list`,
      ).toBe(true)
    }
  })

  it('keeps the restore surface on the retired lists and off both others', () => {
    // M23 is the third classification ADR-032's split did not have: its
    // subject *is* the retired row. Reading the complete list would put
    // every active row on a screen that offers to restore them, and reading
    // the active list would leave it permanently empty.
    const path = 'src/views/master/RetiredMasterPage.vue'
    const source = new Map(sources.map(({ path: p, source: c }) => [p, c])).get(path)
    expect(source, `${path} is not in the scanned sources`).toBeDefined()
    expect(COMPLETE_LIST.test(source!), `${path} reads a complete master list`).toBe(false)
    expect(/\.(activeItemList|activeTemplateList)\b/.test(source!)).toBe(false)
    expect(/\.retiredItemList\b/.test(source!), `${path} does not list retired items`).toBe(true)
    expect(/\.retiredTemplateList\b/.test(source!), `${path} does not list retired Vorlagen`).toBe(
      true,
    )
  })

  it('keeps the surfaces that offer rows off the complete lists', () => {
    // Named rather than left to the rule above, because these are the screens
    // FR-24.3 is about: the inventory, the pickers, the autocomplete.
    const offerSurfaces = [
      'src/views/items/ItemInventoryPage.vue',
      'src/views/items/ItemEditorPage.vue',
      'src/views/templates/TemplateListPage.vue',
      'src/components/global/InventoryBrowseSheet.vue',
      'src/views/settings/SettingsPage.vue',
    ]
    const byPath = new Map(sources.map(({ path, source }) => [path, source]))
    for (const path of offerSurfaces) {
      const source = byPath.get(path)
      expect(source, `${path} is not in the scanned sources`).toBeDefined()
      expect(COMPLETE_LIST.test(source!), `${path} reads a complete master list`).toBe(false)
      expect(
        /\.(activeItemList|activeTemplateList)\b/.test(source!),
        `${path} reads no active list`,
      ).toBe(true)
    }
  })
})
