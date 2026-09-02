// @vitest-environment jsdom
/**
 * M17's notification section follows the language choice (NFR-4.12).
 *
 * A component test rather than e2e, and the reason is the gating: the section
 * exists only on a multi-user instance (`mode === 'server'` *and* an OIDC
 * session, FR-17.3/FR-19.3), and neither Playwright project reaches that —
 * `local` has no server and `single` has no tokens. So the one section of the
 * screen that carried its labels in a **module-level constant**, the exact
 * shape that made the nav anchors unreachable by a language switch, is
 * covered here or nowhere.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import SettingsPage from '../SettingsPage.vue'
import { LOCALE_STORAGE_KEY, setLocale } from '@/i18n'

vi.mock('@/composables/useHeaderTitle', () => ({ setHeaderTitle: vi.fn() }))
vi.mock('@/composables/useHeaderActions', () => ({ setHeaderActions: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {}, params: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
// A session is what makes the notification section exist at all.
vi.mock('@/auth/tokens', () => ({ loadTokens: () => ({ access_token: 'a' }) }))
vi.mock('@/notifications/push', () => ({
  pushSupported: () => false,
  pushRegistered: () => Promise.resolve(false),
  registerPush: vi.fn(),
  unregisterPush: vi.fn(),
}))

const orchestratorFake = {
  fetchMe: vi.fn(() => Promise.resolve({ user_id: 'u1', display_name: 'Andy' })),
  fetchNotificationPrefs: vi.fn(() =>
    Promise.resolve({ delegation: true, mention: true, task: false, lock_taken: true }),
  ),
  saveNotificationPrefs: vi.fn(),
  drainAll: vi.fn(() => Promise.resolve()),
  downloadExport: vi.fn(),
}

function mountSettings() {
  return mount(SettingsPage, {
    global: {
      provide: { orchestrator: orchestratorFake },
      stubs: { AvatarCropModal: true },
    },
  })
}

describe('M17 notification preferences (NFR-4.12)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.setItem('jitpack_mode', 'server')
  })

  afterEach(() => {
    localStorage.removeItem('jitpack_mode')
    localStorage.removeItem(LOCALE_STORAGE_KEY)
    setLocale('en')
  })

  it('renders the row labels in English by default', async () => {
    // The positive signal: without it, "the German word is there" would pass
    // on a build that rendered neither.
    const wrapper = mountSettings()
    await vi.waitFor(() => expect(wrapper.text()).toContain('Delegations'))

    expect(wrapper.text()).toContain('An item was handed to you to pack')
    expect(wrapper.text()).toContain('Mentions')
    expect(wrapper.text()).toContain('Tasks')
    // FR-5.7's kind is a row like any other: switching it off has to stop
    // the notification at the source, which needs a toggle to switch.
    expect(wrapper.text()).toContain('Items taken over')
  })

  it('renders them in German once the language is German', async () => {
    setLocale('de')
    const wrapper = mountSettings()
    await vi.waitFor(() => expect(wrapper.text()).toContain('Übergaben'))

    expect(wrapper.text()).toContain('Ein Packelement wurde dir zum Packen übergeben')
    expect(wrapper.text()).toContain('Erwähnungen')
    expect(wrapper.text()).toContain('Aufgaben')
    expect(wrapper.text()).toContain('Übernommene Artikel')
    // And the English is gone rather than merely joined by the German.
    expect(wrapper.text()).not.toContain('Delegations')
  })
})

describe('M17 profile with an OIDC session (FR-17.13)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.setItem('jitpack_mode', 'server')
  })

  afterEach(() => {
    localStorage.removeItem('jitpack_mode')
    setLocale('en')
  })

  it('offers the picture control, because no identity provider supplies a picture', async () => {
    const wrapper = mountSettings()
    await flushPromises()

    expect(wrapper.find('.avatar-upload').exists()).toBe(true)
    expect(wrapper.find('.avatar-upload input[type="file"]').exists()).toBe(true)
  })

  it('leaves the display name read-only, because that one is IdP-sourced', async () => {
    const wrapper = mountSettings()
    await flushPromises()

    // Asserted through the component's prop, not a DOM attribute: Ionic does
    // not reflect a bound boolean onto the element, so `attributes('readonly')`
    // reads undefined whether the binding is true or false and would pass
    // against an editable field.
    const nameInput = wrapper
      .findAllComponents({ name: 'IonInput' })
      .find((c) => c.attributes('data-testid') === 'settings-name-input')
    expect(nameInput?.props('readonly')).toBe(true)
    expect(wrapper.find('[data-testid="settings-name-save"]').exists()).toBe(false)
  })

  it('says which half the provider owns, rather than claiming the whole profile', async () => {
    const wrapper = mountSettings()
    await flushPromises()

    const note = wrapper.find('[data-testid="settings-name-managed"]')
    expect(note.exists()).toBe(true)
    expect(note.text()).toContain('display name')
    // The old copy said "Profile is managed by your identity provider", which
    // stopped being true the moment the picture became editable here.
    expect(note.text()).not.toMatch(/^Profile is managed/)
  })

  it('says it in German too, and says the same thing', async () => {
    setLocale('de')
    const wrapper = mountSettings()
    await flushPromises()

    const note = wrapper.find('[data-testid="settings-name-managed"]')
    // Both halves, because a catalogue entry that only carries the first
    // sentence would leave the German screen claiming the provider owns the
    // picture as well.
    expect(note.text()).toContain('Anzeigename')
    expect(note.text()).toContain('Bild')
    // Not merely joined by the German — the English must be gone.
    expect(note.text()).not.toContain('identity provider')
  })
})

/**
 * FR-19.8 / G-8 — the move off Local Mode is offered in Local Mode and
 * nowhere else. The e2e projects cannot render the absence (`local` has no
 * Server Mode M17 and `single` no Local Mode one), so it lives here.
 */
describe('M17 leaving Local Mode (FR-19.8)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    localStorage.clear()
    setLocale('en')
  })

  it('offers the three-step move in Local Mode', async () => {
    localStorage.setItem('jitpack_mode', 'local')
    const wrapper = mountSettings()
    await flushPromises()

    expect(wrapper.find('[data-testid="settings-move-card"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Move to a server')
  })

  it('offers nothing of the kind on a server client', async () => {
    localStorage.setItem('jitpack_mode', 'server')
    const wrapper = mountSettings()
    await flushPromises()

    expect(wrapper.find('[data-testid="settings-move-card"]').exists()).toBe(false)
  })
})
