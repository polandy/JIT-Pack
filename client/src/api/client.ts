/** Thin HTTP client with auth header injection (Sync-API Spec §2). */

export class APIRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly apiError: { code: string; message: string; field?: string } | null,
  ) {
    super(apiError?.message ?? `HTTP ${status}`)
    this.name = 'APIRequestError'
  }
}

/** May be async: the OIDC refresher checks expiry before handing out a token. */
export type TokenProvider = () => string | null | Promise<string | null>

export class APIClient {
  private readonly baseUrl: string
  private readonly getToken: TokenProvider
  private readonly onUnauthorized?: () => Promise<string | null>

  constructor(
    baseUrl: string,
    getToken: TokenProvider,
    onUnauthorized?: () => Promise<string | null>,
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.getToken = getToken
    this.onUnauthorized = onUnauthorized
  }

  async get<T = unknown>(path: string, params?: Record<string, string>): Promise<T> {
    let url = `${this.baseUrl}${path}`
    if (params) {
      url += '?' + new URLSearchParams(params).toString()
    }
    return this.request<T>('GET', url)
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', `${this.baseUrl}${path}`, body)
  }

  async put<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', `${this.baseUrl}${path}`, body)
  }

  async delete<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('DELETE', `${this.baseUrl}${path}`, body)
  }

  /** putRaw sends a binary body (e.g. the M17 avatar JPEG). */
  async putRaw(path: string, body: Blob, contentType: string): Promise<void> {
    const resp = await this.authedFetch(
      `${this.baseUrl}${path}`,
      { method: 'PUT', body },
      {
        'Content-Type': contentType,
      },
    )
    if (!resp.ok) throw new APIRequestError(resp.status, null)
  }

  /** getBlob downloads a file with the auth header (M17 data exports). */
  async getBlob(path: string): Promise<Blob> {
    const resp = await this.authedFetch(`${this.baseUrl}${path}`, {}, {})
    if (!resp.ok) throw new APIRequestError(resp.status, null)
    return resp.blob()
  }

  /**
   * authedFetch injects the auth header and, when a refresher is wired,
   * retries exactly once with a fresh token after a 401 — the reactive
   * half of the OIDC refresh (the proactive half lives in the provider).
   */
  private async authedFetch(
    url: string,
    init: Omit<RequestInit, 'headers'>,
    headers: Record<string, string>,
  ): Promise<Response> {
    const token = await this.getToken()
    if (token) headers = { ...headers, Authorization: `Bearer ${token}` }

    const resp = await fetch(url, { ...init, headers })
    if (resp.status !== 401 || !this.onUnauthorized) return resp

    const fresh = await this.onUnauthorized()
    if (!fresh) return resp
    return fetch(url, { ...init, headers: { ...headers, Authorization: `Bearer ${fresh}` } })
  }

  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {}
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }

    const resp = await this.authedFetch(
      url,
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
      throw new APIRequestError(resp.status, apiError)
    }

    // Some endpoints (PUT avatar/display-name) answer 200 with no body.
    const text = await resp.text()
    return (text ? JSON.parse(text) : undefined) as T
  }
}
