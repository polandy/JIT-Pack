// @vitest-environment jsdom
/**
 * FR-25.21 / G-3 — the editor is frozen by a claim on **any** instance of the
 * item, not only on the row it was opened from.
 *
 * The rule is the FR's own sentence, and it is the half only this component can
 * answer: a conversion rewrites every row of the cluster, so a `locked` prop
 * derived from one row describes a lock narrower than what the editor writes.
 * FR-25.8's quick-add is what made the gap plain — its freshly minted row can
 * carry no claim at all, while its folded-name key can still pull an older,
 * claimed ad-hoc row of the same name into the same cluster.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import MembershipSheet from '../MembershipSheet.vue'
import { useTripStore } from '@/stores/tripStore'
import type { TripItem } from '@/types/domain'

const orchestratorFake = {
  lockHolder: vi.fn((_tripId: string, _item: TripItem) => null as string | null),
  setMembership: vi.fn(),
}

const TRIP = 't1'
const NAME = 'Kurze Hosen'

function row(id: string, extra: Partial<TripItem> = {}) {
  useTripStore().applyChange({
    seq: 0,
    table: 'trip_items',
    id,
    deleted: false,
    row: {
      trip_id: TRIP,
      name: NAME,
      quantity: 1,
      packed_count: 0,
      state: 'open',
      mode: 'pack',
      source_item_id: null,
      assigned_traveler_id: null,
      ...extra,
    },
  })
}

function traveler(id: string, name: string) {
  useTripStore().applyChange({
    seq: 0,
    table: 'travelers',
    id,
    deleted: false,
    row: { trip_id: TRIP, name },
  })
}

/** Two ad-hoc rows of the same name — one older, one just quick-added. */
function seed() {
  traveler('tr-a', 'Andy')
  traveler('tr-b', 'Leonardo')
  row('ti-old')
  row('ti-new')
}

/** The same two rows as an FR-25.1 cluster: one instance per traveler. */
function perPersonSeed() {
  row('ti-old', { assigned_traveler_id: 'tr-a' })
  row('ti-new', { assigned_traveler_id: 'tr-b' })
}

function mountSheet(itemId = 'ti-new') {
  return mount(MembershipSheet, {
    props: {
      tripId: TRIP,
      itemId,
      locked: false,
      participants: [
        { user_id: 'u-bob', display_name: 'Bob', avatar_url: null, role: 'editor' as const },
      ],
    },
    global: { provide: { orchestrator: orchestratorFake } },
  })
}

describe('MembershipSheet — G-3 covers the cluster, not the row', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    orchestratorFake.lockHolder.mockReturnValue(null)
    seed()
  })

  it('is operable when nothing of the item is claimed', async () => {
    const wrapper = mountSheet()

    expect(wrapper.get('[data-testid="membership-shared"]').attributes('disabled')).toBeUndefined()
    await wrapper.get('[data-testid="membership-per-person"]').trigger('click')
    await wrapper
      .get('[data-testid="membership-check-Andy"]')
      .trigger('ionChange', { detail: { checked: true } })
    expect(orchestratorFake.setMembership).toHaveBeenCalled()
  })

  it('freezes when a *sibling* row is claimed, though the opened row is free', async () => {
    // Andy's instance is claimed by somebody else; Leonardo's — the one the
    // editor is opened on — is free. Asking the opened row alone answers
    // "not locked", and the write would rewrite Andy's row anyway.
    perPersonSeed()
    orchestratorFake.lockHolder.mockImplementation((_tripId, item) =>
      item.id === 'ti-old' ? 'u-bob' : null,
    )

    const wrapper = mountSheet()

    // The tabs are plain buttons, so their disabled state is readable; an
    // Ionic control takes `disabled` as a prop and reflects no attribute,
    // which is why the assertion carrying the rule is the next one: refusing
    // the *write* is the rule, and a control fires its change regardless of
    // how it was drawn.
    expect(wrapper.get('[data-testid="membership-shared"]').attributes('disabled')).toBeDefined()
    await wrapper
      .get('[data-testid="membership-check-Andy"]')
      .trigger('ionChange', { detail: { checked: true } })
    expect(orchestratorFake.setMembership).not.toHaveBeenCalled()
  })

  it('names the holder, because the surface that would has been covered over', async () => {
    // The claim is on a sibling, so M5's own G-3 banner is absent — and the
    // editor is a modal above M5 anyway, so a frozen sheet that said nothing
    // would be a dead end with no reason on the screen.
    perPersonSeed()
    orchestratorFake.lockHolder.mockImplementation((_tripId, item) =>
      item.id === 'ti-old' ? 'u-bob' : null,
    )

    const wrapper = mountSheet()

    expect(wrapper.get('[data-testid="membership-lock"]').text()).toContain('Bob')
  })

  it('says somebody rather than nobody when the holder is not in the directory', async () => {
    // A member the trip carries and the directory does not (an account
    // removed while offline): the sheet still has to say why it is frozen.
    perPersonSeed()
    orchestratorFake.lockHolder.mockImplementation((_tripId, item) =>
      item.id === 'ti-old' ? 'u-stranger' : null,
    )

    const wrapper = mountSheet()

    const notice = wrapper.get('[data-testid="membership-lock"]').text()
    expect(notice).not.toContain('Bob')
    expect(notice.length).toBeGreaterThan(0)
  })

  it('carries no lock line while nothing is claimed', () => {
    expect(mountSheet().find('[data-testid="membership-lock"]').exists()).toBe(false)
  })
})
