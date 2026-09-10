// @vitest-environment jsdom
/**
 * The login screen answers one question — does this server want a login? —
 * and it has three answers, not two (Sync-API §2, ADR-007).
 *
 * `GET /auth/config` says *yes* by answering with the IdP's endpoints and
 * *no* by answering 501 `not_configured`, which is the whole of what makes a
 * Single-User instance single-user (E2E-M19-02). Anything else — a fetch
 * that never arrived, a proxy's 502, a 500 — is neither answer, and the
 * screen used to file all of them under *no*: the catch set
 * `loginRequired = false` and the template read that as "this server does
 * not require a login". A person whose server was down was told, in the same
 * breath, that it was unreachable and that they could head back to the app.
 * The reassuring half was the false one.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import LoginPage from '../LoginPage.vue'
import { installHarness } from '@/__tests__/harness'
import { t } from '@/i18n'

function answer(status: number): Response {
  return { ok: status >= 200 && status < 300, status } as Response
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  // The harness owns `fetch`; this spec answers with statuses rather than
  // with envelopes, so it overrides afterwards rather than instead.
  installHarness()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

async function render() {
  const w = mount(LoginPage)
  await flushPromises()
  return w
}

describe('LoginPage — a failure is not an answer (Sync-API §2)', () => {
  it('offers the sign-in where the server named its IdP', async () => {
    fetchMock.mockResolvedValue(answer(200))
    const w = await render()

    expect(w.find('[data-testid="login-action"]').exists()).toBe(true)
    expect(w.text()).not.toContain(t('login.notRequired'))
  })

  it('says no login is needed only on the 501 that means exactly that', async () => {
    fetchMock.mockResolvedValue(answer(501))
    const w = await render()

    expect(w.text()).toContain(t('login.notRequired'))
    expect(w.find('[data-testid="login-action"]').exists()).toBe(false)
  })

  it('does not call an unreachable server a server without a login', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const w = await render()

    expect(w.text()).toContain(t('login.serverUnreachable'))
    // The half that was a lie. The sign-in stays offered, because trying is
    // the only thing left that can find out.
    expect(w.text()).not.toContain(t('login.notRequired'))
    expect(w.find('[data-testid="login-action"]').exists()).toBe(true)
  })

  it('does not read a proxy’s 502 as a server without a login either', async () => {
    fetchMock.mockResolvedValue(answer(502))
    const w = await render()

    expect(w.text()).toContain(t('login.checkFailed'))
    expect(w.text()).not.toContain(t('login.notRequired'))
    expect(w.find('[data-testid="login-action"]').exists()).toBe(true)
  })

  it('tells the 501 from the 502 when the sign-in itself asks', async () => {
    fetchMock.mockResolvedValue(answer(200))
    const w = await render()

    fetchMock.mockResolvedValue(answer(502))
    await w.get('[data-testid="login-action"]').trigger('click')
    await flushPromises()
    expect(w.text()).toContain(t('login.checkFailed'))

    fetchMock.mockResolvedValue(answer(501))
    await w.get('[data-testid="login-action"]').trigger('click')
    await flushPromises()
    expect(w.text()).toContain(t('login.noOidc'))
  })
})
