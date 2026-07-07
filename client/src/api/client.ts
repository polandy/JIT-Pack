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

export class APIClient {
  private readonly baseUrl: string
  private readonly getToken: () => string | null

  constructor(baseUrl: string, getToken: () => string | null) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.getToken = getToken
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

  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {}
    const token = this.getToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
    }

    const resp = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

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

    return resp.json() as Promise<T>
  }
}
