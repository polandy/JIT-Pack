/** Fallback for the Vite dev server, where the SPA and the API split origins. */
const DEV_API_URL = 'http://localhost:8080'

/**
 * Server URL to offer before M19 has been answered.
 *
 * A self-hosted instance serves the SPA and the API from one origin —
 * the API sets no CORS headers, so same-origin is a hard requirement
 * (ADR-043: one process serves both). The page's own origin is therefore the right
 * answer for every real deployment, and pre-filling it means the
 * first-launch screen needs no typing (FR-19.1).
 *
 * Two cases still differ: an explicit build-time `VITE_API_URL` wins,
 * and the Vite dev server runs on its own port with the backend
 * elsewhere.
 */
export function defaultServerBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL as string | undefined
  if (configured) return configured
  if (import.meta.env.DEV) return DEV_API_URL
  return window.location.origin
}

/** Server base URL: the M19 choice wins over the build-time default. */
export function serverBaseUrl(): string {
  return localStorage.getItem('jitpack_server_url') ?? defaultServerBaseUrl()
}
