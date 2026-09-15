// @vitest-environment jsdom
/**
 * FR-23.8 — M17 says whether the instance is behind its upstream releases.
 *
 * A component test rather than e2e, for the same reason the notification
 * section beside it is one: every state but `off` needs a server that
 * answers the check, and no Playwright project runs one that does. What
 * belongs here is which of the four states renders what, and the fifth
 * case — Local Mode — where nothing is even asked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

import { identityStub } from '@/composables/__tests__/identityStub'
import { installHarness } from '@/__tests__/harness'
import SettingsPage from '../SettingsPage.vue'
import { ORCHESTRATOR } from '@/composables/useOrchestrator'
import { API } from '@/api/routes'
import type { InstanceUpdateResponse } from '@/api/types'
import { setLocale } from '@/i18n'

vi.mock('@/composables/useHeaderTitle', () => ({ setHeaderTitle: vi.fn() }))
vi.mock('@/composables/useHeaderActions', () => ({ setHeaderActions: vi.fn() }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {}, params: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/auth/tokens', () => ({ loadTokens: () => null }))
vi.mock('@/notifications/push', () => ({
  pushSupported: () => false,
  pushRegistered: () => Promise.resolve(false),
  registerPush: vi.fn(),
  unregisterPush: vi.fn(),
}))

const orchestratorFake = {
  ...identityStub(),
  fetchNotificationPrefs: vi.fn(() =>
    Promise.resolve({ delegation: true, mention: true, task: true, lock_taken: true }),
  ),
  saveNotificationPrefs: vi.fn(),
  drainAll: vi.fn(() => Promise.resolve()),
  downloadExport: vi.fn(),
}

/** The shape the server sends, with only the state's own fields filled in. */
function answer(update: Partial<InstanceUpdateResponse>): InstanceUpdateResponse {
  return {
    state: 'off',
    current: 'v0.7.0',
    latest: '',
    release_url: '',
    checked_at: '',
    ...update,
  }
}

let fetchMock: ReturnType<typeof installHarness>['fetch']

/** Answer the update endpoint with `update`, and every other call with 404. */
function serveUpdate(update: InstanceUpdateResponse) {
  fetchMock.mockImplementation((url: string) =>
    String(url).endsWith(API.instanceUpdate)
      ? Promise.resolve({ ok: true, json: () => Promise.resolve(update) })
      : Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) }),
  )
}

async function mountSettings() {
  const wrapper = mount(SettingsPage, {
    global: {
      provide: { [ORCHESTRATOR]: orchestratorFake },
      stubs: { AvatarCropModal: true },
    },
  })
  await flushPromises()
  return wrapper
}

describe('M17 release check (FR-23.8)', () => {
  beforeEach(() => {
    // The harness owns pinia, `fetch` and `WebSocket`; this spec only says
    // what the one endpoint it cares about answers (T-10).
    fetchMock = installHarness().fetch
    localStorage.setItem('jitpack_mode', 'server')
    serveUpdate(answer({}))
  })

  afterEach(() => {
    localStorage.removeItem('jitpack_mode')
    vi.unstubAllGlobals()
    setLocale('en')
  })

  it('names the newer release and links to what changed', async () => {
    serveUpdate(
      answer({
        state: 'available',
        latest: 'v0.10.0',
        release_url: 'https://github.com/polandy/JIT-Pack/releases/tag/v0.10.0',
      }),
    )
    const wrapper = await mountSettings()

    const line = wrapper.find('[data-testid="settings-update-available"]')
    expect(line.exists()).toBe(true)
    // The tag carries its own `v` — the label must not add a second one
    // (the defect E2E-G9-21 was written for).
    expect(line.text()).toContain('v0.10.0 available')
    expect(line.text()).not.toContain('vv0.10.0')
    expect(wrapper.find('[data-testid="settings-update-link"]').attributes('href')).toBe(
      'https://github.com/polandy/JIT-Pack/releases/tag/v0.10.0',
    )
  })

  it('still names the release when the server passed on no link', async () => {
    // The server drops a release URL that is not an absolute https one, so
    // this state is reachable — and the version is the half worth keeping.
    serveUpdate(answer({ state: 'available', latest: 'v0.10.0', release_url: '' }))
    const wrapper = await mountSettings()

    expect(wrapper.find('[data-testid="settings-update-available"]').text()).toContain(
      'v0.10.0 available',
    )
    expect(wrapper.find('[data-testid="settings-update-link"]').exists()).toBe(false)
  })

  it('says when the confirmation that nothing is newer was obtained', async () => {
    serveUpdate(answer({ state: 'current', latest: 'v0.7.0', checked_at: '2026-09-14T04:12:00Z' }))
    const wrapper = await mountSettings()

    const line = wrapper.find('[data-testid="settings-update-current"]')
    expect(line.exists()).toBe(true)
    expect(line.text()).toContain('Up to date')
    // The moment is the point of the line: "up to date" with no age is a
    // claim nobody can judge. Asserted as a clock time rather than as a
    // rendered string — the format follows the runner's locale, and the
    // calendar day follows its timezone.
    expect(line.text()).toMatch(/\d{1,2}:\d{2}/)
    expect(wrapper.find('[data-testid="settings-update-available"]').exists()).toBe(false)
  })

  it('reports a failed check as a fact about the check, not about the build', async () => {
    serveUpdate(answer({ state: 'unreachable' }))
    const wrapper = await mountSettings()

    const line = wrapper.find('[data-testid="settings-update-unreachable"]')
    expect(line.exists()).toBe(true)
    expect(line.text()).toBe('Update check unreachable')
  })

  it('names the last answer it did get when a later check fails', async () => {
    serveUpdate(answer({ state: 'unreachable', checked_at: '2026-09-11T04:12:00Z' }))
    const wrapper = await mountSettings()

    expect(wrapper.find('[data-testid="settings-update-unreachable"]').text()).toContain(
      'last checked',
    )
  })

  it('renders nothing where the instance makes no check', async () => {
    serveUpdate(answer({ state: 'off' }))
    const wrapper = await mountSettings()

    // The positive signal: the About block itself did render, so "no update
    // line" is an absence in a block that exists rather than an unmounted
    // screen passing by default.
    expect(wrapper.find('[data-testid="settings-app-version"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="settings-update-available"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="settings-update-current"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="settings-update-unreachable"]').exists()).toBe(false)
  })

  it('asks nothing at all in Local Mode', async () => {
    localStorage.setItem('jitpack_mode', 'local')
    serveUpdate(answer({ state: 'available', latest: 'v0.10.0' }))
    await mountSettings()

    // The absence that matters is the request, not the line: a device with
    // no server must not reach for one (invariant 5, G-8). The recorded
    // calls are the positive signal — in Server Mode the same helper sees
    // this URL, which is what the cases above rely on.
    const asked = fetchMock.mock.calls.some((call) => String(call[0]).endsWith(API.instanceUpdate))
    expect(asked).toBe(false)
  })
})
