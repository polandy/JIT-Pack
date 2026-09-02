/**
 * The client's run mode (FR-19.1) — the one module that knows where it is
 * stored and what it is called.
 *
 * `local` or `server` is chosen once on M19 and persisted on the device.
 * Single-User Mode is not a third value: it is a server-side configuration a
 * `server` client discovers by being offered no OIDC (CLAUDE.md invariant 5).
 * Before this module the key was a literal in six files, each with its own
 * cast; §4a wants it named once.
 */
import { ref, type Ref } from 'vue'

import { loadTokens } from '@/auth/tokens'
import { generateDeviceId } from '@/composables/sync/rows'

/** The two modes a client can be in. */
export type ClientMode = 'local' | 'server'

/** `localStorage` key holding the M19 choice. */
export const MODE_KEY = 'jitpack_mode'

/** `localStorage` key holding the server URL a `server` client talks to. */
export const SERVER_URL_KEY = 'jitpack_server_url'

/**
 * `localStorage` key holding this device's sync identity — the `deviceId`
 * half of every HLC stamp (NFR-4.2a).
 */
export const DEVICE_ID_KEY = 'jitpack_device_id'

/**
 * `localStorage` key set by FR-19.8's switch and cleared once the backup has
 * been restored (or the person declined to). Durable on purpose: the restore
 * is a task the reload must not forget (ADR-045).
 */
export const MIGRATION_PENDING_KEY = 'jitpack_migration_pending'

/** The persisted mode, or `null` before M19 has been answered. */
export function readMode(): ClientMode | null {
  const raw = localStorage.getItem(MODE_KEY)
  return raw === 'local' || raw === 'server' ? raw : null
}

/**
 * Persists the M19 choice. A `server` choice carries its URL; a `local` one
 * leaves whatever URL was stored, since nothing reads it in Local Mode. The
 * caller reloads afterwards — the orchestrator is built once per app start.
 */
export function chooseMode(mode: ClientMode, serverUrl: string | null): void {
  localStorage.setItem(MODE_KEY, mode)
  if (serverUrl) localStorage.setItem(SERVER_URL_KEY, serverUrl)
}

/**
 * FR-19.8's switch: the second writer of the mode, and the only one that
 * leaves Local Mode. Sets the pending flag with it; the caller reloads.
 */
export function switchToServer(serverUrl: string): void {
  chooseMode('server', serverUrl)
  localStorage.setItem(MIGRATION_PENDING_KEY, '1')
  migrationPending.value = true
}

/**
 * True while FR-19.8's restore is still owed. Reactive so the bar follows it
 * within a page load; `loadMigrationPending()` reads the stored flag at boot,
 * because this module is imported by code that runs where there is no
 * storage at all.
 */
export const migrationPending: Ref<boolean> = ref(false)

/** Reads the stored flag into `migrationPending` and returns it. */
export function loadMigrationPending(): boolean {
  migrationPending.value = localStorage.getItem(MIGRATION_PENDING_KEY) !== null
  return migrationPending.value
}

/** The restore was done, or declined: the bar has nothing left to say. */
export function clearMigrationPending(): void {
  localStorage.removeItem(MIGRATION_PENDING_KEY)
  migrationPending.value = false
}

/**
 * This device's sync identity, minted on first call and kept from then on.
 * It has to survive a reload: two HLC stamps from one device must never
 * order by a fresh random id (Sync-API §3).
 */
export function deviceId(): string {
  const stored = localStorage.getItem(DEVICE_ID_KEY)
  if (stored) return stored
  const minted = generateDeviceId()
  localStorage.setItem(DEVICE_ID_KEY, minted)
  return minted
}

/**
 * True when there is a second account to collaborate with: Server Mode
 * *and* an OIDC session. Single-User Mode is a `server` client with no
 * tokens, and Local Mode has no server at all — both hide sharing,
 * delegation and takeover per G-8 (FR-17.3, FR-19.3).
 */
export function hasCollaborativeSession(): boolean {
  return readMode() === 'server' && loadTokens() !== null
}

/**
 * Whether a typed server URL can be dialled at all: parseable, and http(s).
 * Syntax only — a reachability probe from the browser cannot tell an
 * unreachable host from a healthy one whose API sets no CORS headers, which
 * ours does not (UI-Spec M19, struck 2026-08-31).
 */
export function isValidServerUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
