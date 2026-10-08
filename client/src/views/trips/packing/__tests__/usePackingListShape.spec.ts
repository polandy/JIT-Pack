// @vitest-environment jsdom
/**
 * The list's shape — folds, clusters, filter panel, reset — is one slice that
 * M4 and an excursion's list (FR-31.6) both run. What a list tells it is
 * which reveal switches it has and which grouping it cannot draw.
 */
import { describe, expect, it } from 'vitest'
import { computed, ref } from 'vue'

import { usePackingFilter } from '@/composables/usePackingFilter'
import { buildPackingView } from '@/domain/packingView'
import { SWITCH_KEYS } from '@/lib/packingFilterPanel'
import type { TripItem } from '@/types/domain'

import { usePackingListShape, type RevealKey } from '../usePackingListShape'

function item(id: string, category: string): TripItem {
  return {
    id,
    trip_id: 't1',
    source_item_id: null,
    source_template_id: null,
    name: id,
    weight_grams: null,
    value_cents: null,
    category_name: category,
    quantity: 1,
    packed_count: 0,
    state: 'open',
    mode: 'pack',
    late_packer: false,
    assigned_traveler_id: null,
    packer_user_id: null,
    packed_by_user_id: null,
    packed_at: null,
    container_id: null,
    packing_now_by: null,
    packing_now_at: null,
    bought_from: null,
    bought_at: null,
    bought_by_user_id: null,
    flag_unused: false,
    flag_missing: false,
    updated_hlc: '1',
  }
}

let seq = 0

function setup(reveals: readonly RevealKey[], withoutGrouping?: 'container') {
  seq += 1
  const filter = usePackingFilter(`shape-spec-${seq}`)
  const term = ref('')
  const isOpen = ref(false)
  let menuUp = false
  const shape = usePackingListShape({
    filter,
    search: { term, isOpen },
    view: () => view.value,
    reveals,
    withoutGrouping,
    menuActive: () => menuUp,
  })
  const view = computed(() =>
    buildPackingView({
      items: [item('Zelt', 'Camping'), item('Jacke', 'Kleidung')],
      travelers: [],
      containers: [],
      participants: [],
      groupBy: shape.groupBy.value,
      showDone: filter.showDone.value,
      facets: filter.facets.value,
      search: term.value,
      currentUserId: null,
      showOthers: true,
      showLate: true,
      collapsedGroups: shape.collapsedGroups.value,
      expandedClusters: shape.expandedClusters.value,
      itemsWithOpenPrep: [],
    }),
  )
  return { shape, filter, term, isOpen, setMenu: (up: boolean) => (menuUp = up) }
}

describe('usePackingListShape (FR-25.11, FR-25.16, FR-31.6)', () => {
  it('folds every group with fold-all, and opens them all again', () => {
    const { shape } = setup([SWITCH_KEYS.done])
    expect(shape.allFolded.value).toBe(false)
    shape.toggleFoldAll()
    expect(shape.allFolded.value).toBe(true)
    shape.toggleFoldAll()
    expect(shape.collapsedGroups.value).toEqual([])
  })

  it('offers only the reveal switches the list has', () => {
    expect(setup([SWITCH_KEYS.done]).shape.filterSwitches.value.map((s) => s.key)).toEqual([
      SWITCH_KEYS.done,
    ])
    expect(
      setup([SWITCH_KEYS.done, SWITCH_KEYS.others, SWITCH_KEYS.late]).shape.filterSwitches.value
        .length,
    ).toBe(3)
  })

  it('reads a grouping the list cannot draw as the default, and does not offer it', () => {
    const { shape, filter } = setup([SWITCH_KEYS.done], 'container')
    filter.groupBy.value = 'container'
    expect(shape.groupBy.value).toBe('category')
    expect(shape.grouping.value.options.map((o) => o.value)).not.toContain('container')
  })

  it('resets search, facets and the others switch on M4, and leaves a switch the list lacks', () => {
    const m4 = setup([SWITCH_KEYS.done, SWITCH_KEYS.others, SWITCH_KEYS.late])
    m4.term.value = 'Zelt'
    m4.isOpen.value = true
    m4.shape.resetNarrowing()
    expect([m4.term.value, m4.isOpen.value, m4.filter.showOthers.value]).toEqual(['', false, true])

    const excursion = setup([SWITCH_KEYS.done])
    excursion.shape.resetNarrowing()
    expect(excursion.filter.showOthers.value).toBe(false)
  })

  it('does not fold a cluster while a row menu is up — the hold released onto the overlay', () => {
    const { shape, setMenu } = setup([SWITCH_KEYS.done])
    setMenu(true)
    shape.toggleCluster('k')
    expect(shape.expandedClusters.value).toEqual([])
    setMenu(false)
    shape.toggleCluster('k')
    expect(shape.expandedClusters.value).toEqual(['k'])
  })
})
