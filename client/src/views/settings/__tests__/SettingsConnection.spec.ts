// @vitest-environment jsdom
/**
 * M17's connection block (FR-19.9).
 *
 * A component test for the reason the API-token block beside it is one: what
 * matters most is which modes the block appears in, and Local Mode and
 * Single-User Mode are reachable in no Playwright project. The defect it was
 * written for is the opposite of a broken button — `clearTokens` was called
 * from no view at all, so a device with a token its instance no longer
 * accepted could only be repaired through the browser's website data.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import SettingsPage from '../SettingsPage.vue'

import { identityStub } from '@/composables/__tests__/identityStub'
import { ORCHESTRATOR } from '@/composables/useOrchestrator'

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

/** Server Mode with and without an OIDC session is one mock away. */
const session = vi.hoisted(() => ({
  value: { access_token: 'a' } as { access_token: string } | null,
}))
vi.mock('@/auth/tokens', () => ({ loadTokens: () => session.value }))

/** The answer the confirmation gives, decided per case. */
const confirmed = vi.hoisted(() => ({ value: true }))
vi.mock('@/lib/confirm', () => ({
  confirmAction: () => Promise.resolve(confirmed.value),
  confirmDestructive: () => Promise.resolve(confirmed.value),
}))

const endSession = vi.hoisted(() => vi.fn())
vi.mock('@/auth/refresh', () => ({ endSession }))

const resetConnection = vi.hoisted(() => vi.fn())
vi.mock('@/mode', async (original) => ({
  ...(await original<typeof import('@/mode')>()),
  resetConnection,
}))

const orchestratorFake = {
  ...identityStub(),
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
      provide: { [ORCHESTRATOR]: orchestratorFake },
      stubs: { AvatarCropModal: true },
    },
  })
}

const SECTION = '[data-testid="settings-section-connection"]'
const LOGOUT = '[data-testid="settings-logout"]'
const RESET = '[data-testid="settings-reset-connection"]'

describe('M17 connection (FR-19.9)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    session.value = { access_token: 'a' }
    confirmed.value = true
    endSession.mockReset()
    resetConnection.mockReset()
    localStorage.setItem('jitpack_mode', 'server')
    localStorage.setItem('jitpack_server_url', 'https://jitpack.example.com')
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('names the instance this device is connected to', async () => {
    const w = mountSettings()
    await flushPromises()

    expect(w.get('[data-testid="settings-server-url"]').text()).toBe('https://jitpack.example.com')
  })

  it('offers both ways off the device with an OIDC session', async () => {
    const w = mountSettings()
    await flushPromises()

    expect(w.find(SECTION).exists()).toBe(true)
    expect(w.find(LOGOUT).exists()).toBe(true)
    expect(w.find(RESET).exists()).toBe(true)
  })

  it('offers no logout in Single-User Mode, where there is no session to end', async () => {
    session.value = null
    const w = mountSettings()
    await flushPromises()

    expect(w.find(LOGOUT).exists()).toBe(false)
    // The positive signal: the block itself is there, so the absence above is
    // the rule and not a section that failed to render.
    expect(w.find(RESET).exists()).toBe(true)
  })

  it('offers neither in Local Mode, which has no connection (G-8)', async () => {
    localStorage.setItem('jitpack_mode', 'local')
    const w = mountSettings()
    await flushPromises()

    expect(w.find(SECTION).exists()).toBe(false)
    // Positive signal: the Local Mode half of the screen did render.
    expect(w.find('[data-testid="settings-move-card"]').exists()).toBe(true)
  })

  it('ends the session once the logout is confirmed', async () => {
    const w = mountSettings()
    await flushPromises()

    await w.get(LOGOUT).trigger('click')
    await flushPromises()

    expect(endSession).toHaveBeenCalledOnce()
  })

  it('ends nothing when the logout is declined', async () => {
    confirmed.value = false
    const w = mountSettings()
    await flushPromises()

    await w.get(LOGOUT).trigger('click')
    await flushPromises()

    expect(endSession).not.toHaveBeenCalled()
  })

  it('forgets the connection once the reset is confirmed', async () => {
    const w = mountSettings()
    await flushPromises()

    await w.get(RESET).trigger('click')
    await flushPromises()

    expect(resetConnection).toHaveBeenCalledOnce()
  })

  it('forgets nothing when the reset is declined', async () => {
    confirmed.value = false
    const w = mountSettings()
    await flushPromises()

    await w.get(RESET).trigger('click')
    await flushPromises()

    expect(resetConnection).not.toHaveBeenCalled()
  })
})
