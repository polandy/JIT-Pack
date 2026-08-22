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
import { mount } from '@vue/test-utils'
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
    Promise.resolve({ delegation: true, mention: true, task: false }),
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
  })

  it('renders them in German once the language is German', async () => {
    setLocale('de')
    const wrapper = mountSettings()
    await vi.waitFor(() => expect(wrapper.text()).toContain('Übergaben'))

    expect(wrapper.text()).toContain('Ein Packelement wurde dir zum Packen übergeben')
    expect(wrapper.text()).toContain('Erwähnungen')
    expect(wrapper.text()).toContain('Aufgaben')
    // And the English is gone rather than merely joined by the German.
    expect(wrapper.text()).not.toContain('Delegations')
  })
})
