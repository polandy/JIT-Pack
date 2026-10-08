/**
 * What the plain-REST groups ask of the API client — and nothing else.
 *
 * Declared here at the consumer for the same reason as `TripReads`
 * (`context.ts`): a group that issues three requests had to be handed the
 * whole `APIClient`, so the only thing that could stand in for it was a
 * stubbed `fetch`. `APIClient` satisfies this structurally, so the
 * production wiring is unchanged and a fake is a plausible object literal.
 */
export interface RestClient {
  get<T = unknown>(path: string, params?: Record<string, string>): Promise<T>
  post<T = unknown>(path: string, body?: unknown): Promise<T>
  put<T = unknown>(path: string, body?: unknown): Promise<T>
  delete<T = unknown>(path: string, body?: unknown): Promise<T>
  putRaw(path: string, body: Blob, contentType: string): Promise<void>
  getBlob(path: string): Promise<Blob>
}
