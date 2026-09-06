/**
 * A recording {@link RestClient} for the groups that only speak REST.
 *
 * What it replaces is a stubbed `fetch` plus a whole orchestrator: the four
 * groups under test issue requests and read the answers, and neither the
 * URL string nor the `RequestInit` was ever the promise — which verb, which
 * path and which body were. Those are what a call records.
 */
import type { RestClient } from '../restClient'

/** One request the group made, in the client's own vocabulary. */
export interface RecordedCall {
  verb: 'get' | 'post' | 'put' | 'delete' | 'putRaw' | 'getBlob'
  path: string
  /** The query params of a `get`, or the body of anything that sends one. */
  payload?: unknown
}

export interface StubClient extends RestClient {
  readonly calls: RecordedCall[]
  /** Queue what the next request resolves with. */
  answer(value: unknown): void
  /** Queue what the next request rejects with. */
  fail(error: unknown): void
  /** The paths, in order — the usual assertion. */
  paths(): string[]
}

/**
 * Answers are queued rather than mapped to a path on purpose: a group that
 * stops making a request must run out of answers rather than quietly get the
 * right one, which is what makes "did nothing in Local Mode" falsifiable.
 */
export function stubClient(): StubClient {
  const calls: RecordedCall[] = []
  const queued: { value?: unknown; error?: unknown }[] = []

  function next(verb: RecordedCall['verb'], path: string, payload?: unknown): Promise<never> {
    calls.push(payload === undefined ? { verb, path } : { verb, path, payload })
    const answer = queued.shift()
    if (!answer) return Promise.reject(new Error(`no answer queued for ${verb} ${path}`))
    if ('error' in answer) return Promise.reject(answer.error)
    return Promise.resolve(answer.value) as Promise<never>
  }

  return {
    calls,
    answer: (value) => void queued.push({ value }),
    fail: (error) => void queued.push({ error }),
    paths: () => calls.map((c) => c.path),
    get: (path, params) => next('get', path, params),
    post: (path, body) => next('post', path, body),
    put: (path, body) => next('put', path, body),
    delete: (path, body) => next('delete', path, body),
    putRaw: (path, body, contentType) => next('putRaw', path, { body, contentType }),
    getBlob: (path) => next('getBlob', path),
  }
}
