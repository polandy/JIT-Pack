/**
 * HTTP statuses this client has to classify, named once.
 *
 * Two places ask the same question about a 4xx and must not answer it
 * differently: the outbox deciding whether a refused push can be retried
 * (Sync-API §5) and the OIDC refresher deciding whether a session is over
 * (§2). A 4xx normally means the request itself was wrong, and a request
 * that was wrong once is wrong every time — except for the handful below,
 * whose cause is a moment rather than the request.
 */

/**
 * 4xx statuses whose cause can pass, so the very same request can succeed
 * later: the server timed out waiting for the body, refused an early one,
 * or is rate-limiting this client.
 */
const TRANSIENT_CLIENT_STATUSES = new Set([408, 425, 429])

/** Whether a 4xx is one of those moments rather than a verdict on the request. */
export function isTransientClientStatus(status: number): boolean {
  return TRANSIENT_CLIENT_STATUSES.has(status)
}

/** Whether `status` is in the 4xx range at all. */
export function isClientError(status: number): boolean {
  return status >= 400 && status < 500
}
