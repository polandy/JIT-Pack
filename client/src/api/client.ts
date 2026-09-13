/** Thin HTTP client with auth header injection (Sync-API Spec §2). */
import { endSession } from '@/auth/refresh'
import { defaultNowMs, type NowMs } from '@/lib/clock'

import { ERROR_CODE, type APIErrorBody } from './types'

export class APIRequestError extends Error {
  constructor(
    public readonly status: number,
    // The generated body, so a caller that branches on `code` is checked
    // against the server's vocabulary rather than against a re-typed string
    // (NFR-4.14).
    public readonly apiError: APIErrorBody | null,
  ) {
    super(apiError?.message ?? `HTTP ${status}`)
    this.name = 'APIRequestError'
  }
}

/** May be async: the OIDC refresher checks expiry before handing out a token. */
export type TokenProvider = () => string | null | Promise<string | null>

/**
 * One request that did not succeed, in the only terms a person holding the
 * device can read back to whoever maintains the instance (FR-19.6).
 *
 * The instance keeps no request log, so a device that can only say *offline*
 * leaves nobody — not its user, not the maintainer — able to tell a 401 from
 * a 500 from a dead radio. Reported from the transport rather than from the
 * callers, because every caller swallows its failure on purpose and the last
 * one to fail is not necessarily the one the user was waiting for.
 */
export interface RequestFailure {
  /** HTTP method, as sent. */
  method: string
  /** The API path, with its query — never the full URL: the origin is known. */
  path: string
  /** The status answered, or null when nothing answered at all. */
  status: number | null
  /** When it failed, on the injected clock. */
  at: number
}

/** Optional wiring; without any of it the client behaves exactly as before. */
export interface APIClientOptions {
  /**
   * Invoked on a 401 so the caller can refresh and have the request retried
   * once — the reactive half of the OIDC refresh (Sync-API §2).
   */
  onUnauthorized?: () => Promise<string | null>
  /** Invoked for every request that ends in a failure (see {@link RequestFailure}). */
  onFailure?: (failure: RequestFailure) => void
  /** The clock the failure is stamped with (`lib/clock.ts`). */
  now?: NowMs
}

export class APIClient {
  private readonly baseUrl: string
  private readonly getToken: TokenProvider
  private readonly onUnauthorized?: () => Promise<string | null>
  private readonly onFailure?: (failure: RequestFailure) => void
  private readonly now: NowMs

  constructor(baseUrl: string, getToken: TokenProvider, options: APIClientOptions = {}) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.getToken = getToken
    this.onUnauthorized = options.onUnauthorized
    this.onFailure = options.onFailure
    this.now = options.now ?? defaultNowMs
  }

  async get<T = unknown>(path: string, params?: Record<string, string>): Promise<T> {
    const query = params ? '?' + new URLSearchParams(params).toString() : ''
    return this.request<T>('GET', `${path}${query}`)
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body)
  }

  async put<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, body)
  }

  async delete<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('DELETE', path, body)
  }

  /** putRaw sends a binary body (e.g. the M17 avatar JPEG). */
  async putRaw(path: string, body: Blob, contentType: string): Promise<void> {
    const resp = await this.authedFetch(
      path,
      { method: 'PUT', body },
      {
        'Content-Type': contentType,
      },
    )
    if (!resp.ok) throw new APIRequestError(resp.status, null)
  }

  /** getBlob downloads a file with the auth header (M17 data exports). */
  async getBlob(path: string): Promise<Blob> {
    const resp = await this.authedFetch(path, {}, {})
    if (!resp.ok) throw new APIRequestError(resp.status, null)
    return resp.blob()
  }

  /**
   * authedFetch injects the auth header and, when a refresher is wired,
   * retries exactly once with a fresh token after a 401 — the reactive
   * half of the OIDC refresh (the proactive half lives in the provider).
   */
  private async authedFetch(
    path: string,
    init: Omit<RequestInit, 'headers'>,
    headers: Record<string, string>,
  ): Promise<Response> {
    const url = `${this.baseUrl}${path}`
    const method = init.method ?? 'GET'
    const token = await this.getToken()
    if (token) headers = { ...headers, Authorization: `Bearer ${token}` }

    const resp = await this.send(method, path, url, { ...init, headers })
    if (resp.status !== 401 || !this.onUnauthorized) return this.reported(method, path, resp)

    const fresh = await this.onUnauthorized()
    if (!fresh) return this.reported(method, path, resp)
    return this.reported(
      method,
      path,
      await this.send(method, path, url, {
        ...init,
        headers: { ...headers, Authorization: `Bearer ${fresh}` },
      }),
    )
  }

  /**
   * One `fetch`, with a request that never arrived reported as a failure of
   * its own. A rejected fetch is the dead-radio case, and it is the one
   * failure that carries no status at all.
   */
  private async send(method: string, path: string, url: string, init: RequestInit) {
    try {
      return await fetch(url, init)
    } catch (err) {
      this.onFailure?.({ method, path, status: null, at: this.now() })
      throw err
    }
  }

  /**
   * Passes a response through, reporting it first if it failed. The 401 that
   * a refresh repairs is deliberately not reported from here: it is reported
   * only once the retry has also failed, because a session that renewed
   * itself was never a failure anybody should be shown.
   */
  private reported(method: string, path: string, resp: Response): Response {
    if (!resp.ok) this.onFailure?.({ method, path, status: resp.status, at: this.now() })
    return resp
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {}
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }

    const resp = await this.authedFetch(
      path,
      {
        method,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      },
      headers,
    )

    if (!resp.ok) {
      let apiError = null
      try {
        const json = await resp.json()
        apiError = json.error ?? null
      } catch {
        // non-JSON error body
      }
      // FR-23.3: an account deactivated mid-session keeps tokens that
      // still look valid, so nothing would ever expire them and every
      // request from here on would 403 in silence. Narrow on the code
      // rather than on the status: a 403 is also how the server refuses a
      // non-admin the M20 endpoints, and logging that person out would be
      // a worse bug than the one being fixed.
      //
      // Imported rather than injected beside `onUnauthorized`, at the cost
      // of the transport knowing the auth module: a hook has to be wired at
      // every construction site, and behaviour lost by a missed wiring is
      // the exact failure this branch exists to end.
      if (resp.status === 403 && apiError?.code === ERROR_CODE.account_deactivated) {
        endSession()
      }
      throw new APIRequestError(resp.status, apiError)
    }

    // Some endpoints (PUT avatar/display-name) answer 200 with no body.
    const text = await resp.text()
    return (text ? JSON.parse(text) : undefined) as T
  }
}
