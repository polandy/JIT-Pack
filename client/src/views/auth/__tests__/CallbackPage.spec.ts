// @vitest-environment jsdom
/**
 * The OIDC redirect target (Sync-API §2) has one way in and four ways out.
 *
 * In: the state the login stored matches the one the IdP sent back, and the
 * broker exchanges the code with the stored PKCE verifier for a token set the
 * page keeps. Out without a session: the state does not match (an
 * interrupted or forged return — nothing is sent), the broker refuses the
 * code, the broker refuses the *account* (FR-23.3), or the broker cannot be
 * reached. Each of those names its own sentence and keeps no token.
 *
 * The full-page `location.replace` to the dashboard is not observable under
 * jsdom; the server e2e cases log in through this page (`loginAs`), and the
 * dashboard they land on is that half.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import CallbackPage from '../CallbackPage.vue'
import { API } from '@/api/routes'
import { ERROR_CODE, type SessionTokens } from '@/api/types'
import { installHarness } from '@/__tests__/harness'
import { loadTokens } from '@/auth/tokens'
import { serverBaseUrl } from '@/config'
import { t } from '@/i18n'

const replaced: string[] = []
vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: (path: string) => replaced.push(path) }),
}))

/** The instant the exchange lands, which the stored expiry is counted from. */
const AT = Date.parse('2026-03-14T09:00:00.000Z')

const TOKENS: SessionTokens = {
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  expires_in: 900,
}

function answer(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  replaced.length = 0
  localStorage.clear()
  sessionStorage.clear()
  // The harness owns `fetch`; this spec answers the token endpoint itself,
  // so it overrides afterwards rather than instead.
  installHarness()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  // The page stamps the token set with the default clock, so the machine
  // clock is set rather than read: the expiry is then one exact instant.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AT)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Arrive back from the IdP with `query`, the login having stored `stored`. */
async function arrive(query: string, stored = { state: 'st-1', verifier: 'ver-1' }) {
  sessionStorage.setItem('jitpack_pkce_state', stored.state)
  sessionStorage.setItem('jitpack_pkce_verifier', stored.verifier)
  window.history.replaceState(null, '', `/auth/callback?${query}`)
  const w = mount(CallbackPage)
  await flushPromises()
  return w
}

describe('CallbackPage — the way in (Sync-API §2)', () => {
  it('exchanges the code with the stored verifier and keeps the token set', async () => {
    fetchMock.mockResolvedValue(answer(200, TOKENS))
    const w = await arrive('code=c-1&state=st-1')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${serverBaseUrl()}${API.authToken}`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      code: 'c-1',
      code_verifier: 'ver-1',
      redirect_uri: `${window.location.origin}/auth/callback`,
    })
    expect(loadTokens()).toEqual({
      access_token: 'access-1',
      refresh_token: 'refresh-1',
      expires_at: AT + 900 * 1000,
    })
    expect(w.find('[data-testid="login-error"]').exists()).toBe(false)
  })

  it('spends the stored state and verifier on the one return', async () => {
    fetchMock.mockResolvedValue(answer(200, TOKENS))
    await arrive('code=c-1&state=st-1')

    expect(sessionStorage.getItem('jitpack_pkce_state')).toBeNull()
    expect(sessionStorage.getItem('jitpack_pkce_verifier')).toBeNull()
  })
})

describe('CallbackPage — the ways out', () => {
  it('sends nothing when the returned state is not the stored one', async () => {
    const w = await arrive('code=c-1&state=forged')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(w.get('[data-testid="login-error"]').text()).toBe(t('login.interrupted'))
    expect(loadTokens()).toBeNull()
    // Spent even so: a second try must start from a fresh login.
    expect(sessionStorage.getItem('jitpack_pkce_verifier')).toBeNull()
  })

  it('sends nothing when the IdP returned no code', async () => {
    const w = await arrive('state=st-1')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(w.get('[data-testid="login-error"]').text()).toBe(t('login.interrupted'))
  })

  it('says the login was rejected when the broker refuses the code', async () => {
    fetchMock.mockResolvedValue(
      answer(400, { error: { code: 'invalid_grant', message: 'code expired' } }),
    )
    const w = await arrive('code=c-1&state=st-1')

    expect(w.get('[data-testid="login-error"]').text()).toBe(t('login.rejected'))
    expect(loadTokens()).toBeNull()
  })

  it('names a deactivated account rather than a rejected login (FR-23.3)', async () => {
    fetchMock.mockResolvedValue(
      answer(403, { error: { code: ERROR_CODE.account_deactivated, message: 'deactivated' } }),
    )
    const w = await arrive('code=c-1&state=st-1')

    expect(w.get('[data-testid="login-error"]').text()).toBe(t('login.deactivated'))
    expect(loadTokens()).toBeNull()
  })

  it('says the login failed when the broker cannot be reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const w = await arrive('code=c-1&state=st-1')

    expect(w.get('[data-testid="login-error"]').text()).toBe(t('login.failed'))
    expect(loadTokens()).toBeNull()
  })

  it('leads back to the login from a refusal', async () => {
    const w = await arrive('code=c-1&state=forged')

    await w.get('ion-button').trigger('click')

    expect(replaced).toEqual(['/login'])
  })
})
