// @vitest-environment jsdom
/**
 * M22 — ADR-033. This screen carried the conflation in its own words: „No
 * roster synced for this trip yet", under a comment that named both states it
 * could mean (*roster not synced yet, or a pre-sync trip*) and gave the reader
 * no way to tell which. Membership rows travel in the master partition, so the
 * guard is `masterDataLoaded`, and the G-7 sentence now says the one thing it
 * is left to say once the rows are here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import TripMembersPage from '../TripMembersPage.vue'
import { useTripStore } from '@/stores/tripStore'
import { TABLE } from '@/types/tables'
import { t } from '@/i18n'

import { identityStub } from '@/composables/__tests__/identityStub'
import { masterDataStub } from '@/composables/__tests__/masterDataStub'
import { ORCHESTRATOR } from '@/composables/useOrchestrator'

vi.mock('@/composables/useHeaderTitle', () => ({ setHeaderTitle: vi.fn() }))

const master = masterDataStub()
const orchestratorFake = {
  ...identityStub(),
  ...master,
  addTripMember: vi.fn(),
  setTripMemberRole: vi.fn(),
  removeTripMember: vi.fn(),
}

function mountPage() {
  return mount(TripMembersPage, {
    props: { tripId: 't1' },
    global: { provide: { [ORCHESTRATOR]: orchestratorFake } },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  master.masterLoaded.value = true
})

describe('M22 members — an absence it has not read yet (ADR-033, G-7)', () => {
  it('says the roster is loading rather than saying it is not synced', async () => {
    master.masterLoaded.value = false

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="m22-list-loading"]').exists()).toBe(true)
    expect(page.find('[data-testid="m22-empty"]').exists()).toBe(false)
    expect(page.text()).toContain(t('members.listUnknown'))

    master.masterLoaded.value = true
    await flushPromises()

    expect(page.find('[data-testid="m22-list-loading"]').exists()).toBe(false)
    expect(page.find('[data-testid="m22-empty"]').exists()).toBe(true)
  })

  it('shows neither state once a membership row is on the device', async () => {
    useTripStore().applyChange({
      seq: 0,
      table: TABLE.tripMembers,
      id: 'm1',
      deleted: false,
      row: { trip_id: 't1', user_id: 'u1', role: 'owner' },
    })

    const page = mountPage()
    await flushPromises()

    expect(page.find('[data-testid="m22-list-loading"]').exists()).toBe(false)
    expect(page.find('[data-testid="m22-empty"]').exists()).toBe(false)
    // `identityStub`'s directory is empty, so the row falls back to the user
    // id — a poor name, and the one `buildRosterView` is specified to use.
    expect(page.find('[data-testid="member-row-u1"]').exists()).toBe(true)
  })
})
