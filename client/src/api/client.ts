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

  async put<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', `${this.baseUrl}${path}`, body)
  }

  /** putRaw sends a binary body (e.g. the M17 avatar JPEG). */
  async putRaw(path: string, body: Blob, contentType: string): Promise<void> {
    const headers: Record<string, string> = { 'Content-Type': contentType }
    const token = this.getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
    const resp = await fetch(`${this.baseUrl}${path}`, { method: 'PUT', headers, body })
    if (!resp.ok) throw new APIRequestError(resp.status, null)
  }

  /** getBlob downloads a file with the auth header (M17 data exports). */
  async getBlob(path: string): Promise<Blob> {
    const headers: Record<string, string> = {}
    const token = this.getToken()
    if (token) headers['Authorization'] = `Bearer ${token}`
    const resp = await fetch(`${this.baseUrl}${path}`, { headers })
    if (!resp.ok) throw new APIRequestError(resp.status, null)
    return resp.blob()
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

    // Some endpoints (PUT avatar/display-name) answer 200 with no body.
    const text = await resp.text()
    return (text ? JSON.parse(text) : undefined) as T
  }
}
