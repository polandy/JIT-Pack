// @vitest-environment jsdom
/**
 * M17's API-token block (FR-23.7, ADR-039).
 *
 * A component test rather than e2e for the same reason the notification
 * section beside it is one: the block exists only on a multi-user instance
 * with a session, and the *absence* cases — Local Mode and Single-User Mode —
 * are reachable in no Playwright project at all. A surface that must not
 * appear is exactly the kind that ships appearing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import SettingsPage from '../SettingsPage.vue'

vi.mock('@/composables/useHeaderTitle', () => ({ setHeaderTitle: vi.fn() }))
vi.mock('@/composables/useHeaderActions', () => ({ setHeaderActions: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {}, params: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/notifications/push', () => ({
  pushSupported: () => false,
  pushRegistered: () => Promise.resolve(false),
  registerPush: vi.fn(),
  unregisterPush: vi.fn(),
}))

// Whether a session exists is what separates Server Mode from Single-User
// Mode on this screen, so the mock has to be switchable per test.
const session = vi.hoisted(() => ({ value: { access_token: 'a' } as { access_token: string } | null }))
vi.mock('@/auth/tokens', () => ({ loadTokens: () => session.value }))

const orchestratorFake = {
  fetchMe: vi.fn(() => Promise.resolve({ user_id: 'u1', display_name: 'Andy' })),
  fetchNotificationPrefs: vi.fn(() =>
    Promise.resolve({ delegation: true, mention: true, task: false, lock_taken: true }),
  ),
  saveNotificationPrefs: vi.fn(),
  drainAll: vi.fn(() => Promise.resolve()),
  downloadExport: vi.fn(),
  createAPIToken: vi.fn(),
}

function mountSettings() {
  return mount(SettingsPage, {
    global: {
      provide: { orchestrator: orchestratorFake },
      stubs: { AvatarCropModal: true },
    },
  })
}

const section = '[data-testid="settings-section-tokens"]'

describe('M17 API tokens', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    session.value = { access_token: 'a' }
    localStorage.setItem('jitpack_mode', 'server')
    orchestratorFake.createAPIToken.mockReset()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('offers the block on a multi-user instance with a session', async () => {
    const w = mountSettings()
    await flushPromises()

    expect(w.find(section).exists()).toBe(true)
    expect(w.find('[data-testid="token-create"]').exists()).toBe(true)
  })

  // The owner's decision, pinned: with no revocation the expiry is the only
  // thing that ever ends a token's life, so the default is not incidental.
  //
  // Asserted through what a mint is actually asked for rather than through
  // the select's `value` attribute, which Ionic does not reflect to the DOM —
  // that assertion would pass on a screen where the default had been lost.
  it('mints for ninety days when the expiry is left alone', async () => {
    orchestratorFake.createAPIToken.mockResolvedValue({ token: 'a.b.c', expires_at: '' })
    const w = mountSettings()
    await flushPromises()

    await w
      .get('[data-testid="token-name"]')
      .trigger('ionInput', { detail: { value: 'cleanup' } })
    await w.find('[data-testid="token-create"]').trigger('click')
    await flushPromises()

    expect(orchestratorFake.createAPIToken).toHaveBeenCalledWith('cleanup', '90d')
  })

  it('reveals the minted token once and hands it to nothing else', async () => {
    orchestratorFake.createAPIToken.mockResolvedValue({
      token: 'header.payload.signature',
      expires_at: '2026-11-28T12:00:00Z',
    })
    const w = mountSettings()
    await flushPromises()

    await w
      .get('[data-testid="token-name"]')
      .trigger('ionInput', { detail: { value: 'cleanup' } })
    await w.find('[data-testid="token-create"]').trigger('click')
    await flushPromises()

    const sheet = w.findComponent({ name: 'ApiTokenSheet' })
    expect(sheet.props('open')).toBe(true)
    expect(sheet.props('token')).toBe('header.payload.signature')
    // Nothing about a token is persisted — that is the whole of ADR-039.
    expect(JSON.stringify(localStorage)).not.toContain('header.payload.signature')
  })

  it('drops the token from component state when the reveal closes', async () => {
    orchestratorFake.createAPIToken.mockResolvedValue({
      token: 'header.payload.signature',
      expires_at: '',
    })
    const w = mountSettings()
    await flushPromises()
    await w
      .get('[data-testid="token-name"]')
      .trigger('ionInput', { detail: { value: 'cleanup' } })
    await w.find('[data-testid="token-create"]').trigger('click')
    await flushPromises()

    w.findComponent({ name: 'ApiTokenSheet' }).vm.$emit('close')
    await flushPromises()

    const sheet = w.findComponent({ name: 'ApiTokenSheet' })
    expect(sheet.props('open')).toBe(false)
    expect(sheet.props('token')).toBe('')
  })

  it('says so when the mint failed rather than opening an empty reveal', async () => {
    orchestratorFake.createAPIToken.mockRejectedValue(new Error('offline'))
    const w = mountSettings()
    await flushPromises()

    await w
      .get('[data-testid="token-name"]')
      .trigger('ionInput', { detail: { value: 'cleanup' } })
    await w.find('[data-testid="token-create"]').trigger('click')
    await flushPromises()

    expect(w.find('[data-testid="token-failed"]').exists()).toBe(true)
    expect(w.findComponent({ name: 'ApiTokenSheet' }).props('open')).toBe(false)
  })

  // G-8: the two modes where a token proves nothing there is anything to
  // prove. Single-User Mode bypasses authentication entirely and Local Mode
  // has no server at all.
  it('is absent in Single-User Mode', async () => {
    session.value = null
    const w = mountSettings()
    await flushPromises()

    expect(w.find(section).exists()).toBe(false)
  })

  it('is absent in Local Mode', async () => {
    localStorage.setItem('jitpack_mode', 'local')
    const w = mountSettings()
    await flushPromises()

    expect(w.find(section).exists()).toBe(false)
  })
})
