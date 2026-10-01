// @vitest-environment jsdom
/**
 * M30 (FR-32.2): the log as a reader sees it — one line per run, names only
 * where there are people to tell apart, the older pages on request, and an
 * empty log said only once it was read. The reachable path is E2E-M30-01.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import { identityStub } from '@/composables/__tests__/identityStub'
import ActivityLogPage from '../ActivityLogPage.vue'
import type { ActivityEntry, ActivityListResponse } from '@/api/types'
import { setLocale, t } from '@/i18n'
import { ORCHESTRATOR } from '@/composables/useOrchestrator'

vi.mock('@/composables/useHeaderTitle', () => ({ setHeaderTitle: vi.fn() }))

let collaborative = true
vi.mock('@/mode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/mode')>()),
  hasCollaborativeSession: () => collaborative,
}))

let nextId = 50
function packed(label: string, over: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: nextId--,
    entity_table: 'trip_items',
    entity_id: `row-${label}`,
    op: 'update',
    label,
    changes: { state: ['open', 'packed'] },
    actor_user_id: 'u-andy',
    created_at: new Date().toISOString(),
    ...over,
  }
}

const page = (entries: ActivityEntry[], before = 0): ActivityListResponse => ({ entries, before })

const orchestrator = {
  ...identityStub(),
  fetchTripActivity: vi.fn<(tripId: string, before?: number) => Promise<ActivityListResponse>>(),
  fetchInventoryActivity: vi.fn<(before?: number) => Promise<ActivityListResponse>>(),
  fetchUsers: vi.fn(() =>
    Promise.resolve([
      { user_id: 'u-andy', display_name: 'Andy' },
      { user_id: 'u-stella', display_name: 'Stella' },
    ]),
  ),
}

beforeEach(() => {
  setActivePinia(createPinia())
  setLocale('en')
  vi.clearAllMocks()
  collaborative = true
  orchestrator.fetchTripActivity.mockResolvedValue(page([]))
  orchestrator.fetchInventoryActivity.mockResolvedValue(page([]))
})

async function mountPage(props: { tripId?: string } = { tripId: 'trip-1' }) {
  const wrapper = mount(ActivityLogPage, {
    props,
    global: { provide: { [ORCHESTRATOR]: orchestrator } },
  })
  await flushPromises()
  return wrapper
}

describe('ActivityLogPage (M30)', () => {
  it('folds a run of packs into one line that names who and opens to its parts', async () => {
    orchestrator.fetchTripActivity.mockResolvedValue(
      page([packed('Socken'), packed('Zahnbürste'), packed('Badehose'), packed('Sonnenhut')]),
    )
    const wrapper = await mountPage()

    const rows = wrapper.findAll('[data-testid="activity-row"]')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.find('[data-testid="activity-title"]').text()).toBe(
      'Socken, Zahnbürste, Badehose +1',
    )
    expect(rows[0]!.find('[data-testid="activity-what"]').text()).toContain('4× packed')
    expect(rows[0]!.find('[data-testid="activity-meta"]').text()).toContain('Andy')

    expect(wrapper.findAll('[data-testid="activity-member"]')).toHaveLength(0)
    await rows[0]!.trigger('click')
    expect(wrapper.findAll('[data-testid="activity-member"]')).toHaveLength(4)
  })

  it('names nobody in Single-User, where there is one person', async () => {
    collaborative = false
    orchestrator.fetchTripActivity.mockResolvedValue(page([packed('Socken')]))
    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="activity-meta"]').text()).not.toContain('Andy')
    expect(orchestrator.fetchUsers).not.toHaveBeenCalled()
  })

  it('says what a change changed', async () => {
    orchestrator.fetchTripActivity.mockResolvedValue(
      page([packed('Socken', { changes: { quantity: [2, 3] } })]),
    )
    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="activity-detail"]').text()).toBe(
      `${t('fieldLabel.quantity')}: 2 → 3`,
    )
  })

  it('reads the older page below the cursor, and offers no more once at the start', async () => {
    orchestrator.fetchTripActivity
      .mockResolvedValueOnce(page([packed('Socken')], 7))
      .mockResolvedValueOnce(page([packed('Zelt', { actor_user_id: 'u-stella' })]))
    const wrapper = await mountPage()

    await wrapper.find('[data-testid="activity-more"]').trigger('click')
    await flushPromises()

    expect(orchestrator.fetchTripActivity).toHaveBeenLastCalledWith('trip-1', 7)
    expect(wrapper.findAll('[data-testid="activity-row"]')).toHaveLength(2)
    expect(wrapper.find('[data-testid="activity-more"]').exists()).toBe(false)
  })

  it('reads the inventory log without a trip', async () => {
    orchestrator.fetchInventoryActivity.mockResolvedValue(
      page([packed('Stirnlampe', { entity_table: 'items', op: 'insert', changes: {} })]),
    )
    const wrapper = await mountPage({})

    expect(orchestrator.fetchTripActivity).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="activity-what"]').text()).toContain(t('items.title'))
  })

  it('says the log is empty only once it was read, and unavailable when it could not be', async () => {
    let resolve!: (p: ActivityListResponse) => void
    orchestrator.fetchTripActivity.mockReturnValue(new Promise((r) => (resolve = r)))
    const wrapper = mount(ActivityLogPage, {
      props: { tripId: 'trip-1' },
      global: { provide: { [ORCHESTRATOR]: orchestrator } },
    })
    await flushPromises()
    expect(wrapper.find('[data-testid="activity-loading"]').exists()).toBe(true)
    resolve(page([]))
    await flushPromises()
    expect(wrapper.find('[data-testid="activity-empty"]').text()).toContain(t('activity.empty'))

    orchestrator.fetchTripActivity.mockRejectedValue(new Error('offline'))
    const failed = await mountPage()
    expect(failed.find('[data-testid="activity-empty"]').text()).toContain(
      t('activity.unavailable'),
    )
  })
})
