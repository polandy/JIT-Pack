/**
 * The client's run mode (FR-19.1) — the one module that knows where it is
 * stored and what it is called.
 *
 * `local` or `server` is chosen once on M19 and persisted on the device.
 * Single-User Mode is not a third value: it is a server-side configuration a
 * `server` client discovers by being offered no OIDC (CLAUDE.md invariant 5).
 * The storage key is named once here rather than as a literal in each
 * reader, each with its own cast (§4a).
 */
import { ref, type Ref } from 'vue'

import { clearTokens, loadTokens } from '@/auth/tokens'
import { generateDeviceId } from '@/sync/rows'

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
 * Whether a server answers: the one place a view or a route asks the mode
 * question, so no caller compares the raw `'server'` string (§4a). Defaults
 * to the stored mode; App.vue's reactive copy passes its own.
 */
export function isServerMode(mode: ClientMode | null = readMode()): boolean {
  return mode === 'server'
}

/** Whether this device runs without a server: Local Mode, once M19 has been answered. */
export function isLocalMode(mode: ClientMode | null = readMode()): boolean {
  return mode === 'local'
}

/**
 * What a mode lets a screen show (G-8), named by the surface rather than by
 * the mode, so a view asks "is there an activity log?" and the one table below
 * answers. Single-User Mode is a `server` client (invariant 5): it has every
 * server surface a lone person can use, and the views that need a session
 * ask `hasCollaborativeSession` on top.
 */
export interface Capabilities {
  /** FR-32.2: a server recorded who changed what. */
  activityLog: boolean
  /** FR-5.x conflict inbox: a second writer exists to conflict with. */
  conflictInbox: boolean
  /** G-10 / FR-4.9: others' presence and roster arrive over the socket. */
  presence: boolean
  /** FR-17.13: a server identity to hold a name and a picture. */
  profile: boolean
  /** FR-7.11: the server sends notifications and reminders. */
  notifications: boolean
  /** The server's address, its config and its update notice. */
  serverConnection: boolean
  /** FR-19.6: an outbox whose pending, parked and failed counts mean something. */
  syncQueue: boolean
  /** FR-19.8: everything lives on this device, so backup and storage status matter. */
  deviceBackup: boolean
}

const SERVER_CAPABILITIES: Capabilities = {
  activityLog: true,
  conflictInbox: true,
  presence: true,
  profile: true,
  notifications: true,
  serverConnection: true,
  syncQueue: true,
  deviceBackup: false,
}

const LOCAL_CAPABILITIES: Capabilities = {
  activityLog: false,
  conflictInbox: false,
  presence: false,
  profile: false,
  notifications: false,
  serverConnection: false,
  syncQueue: false,
  deviceBackup: true,
}

const NO_CAPABILITIES: Capabilities = {
  ...LOCAL_CAPABILITIES,
  deviceBackup: false,
}

/** The surfaces `mode` has; defaults to the stored mode, App.vue's reactive copy passes its own. */
export function capabilitiesOf(mode: ClientMode | null = readMode()): Capabilities {
  if (mode === 'server') return SERVER_CAPABILITIES
  if (mode === 'local') return LOCAL_CAPABILITIES
  return NO_CAPABILITIES
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
 * FR-19.9 — forget this device's connection and let M19 ask again.
 *
 * The session, the mode and the server URL go; everything else stays. It is
 * the only way back out of the three states a device could otherwise only be
 * repaired from through the browser's website data (and, for an installed
 * PWA, by deleting it from the home screen): a token the server no longer
 * accepts, a mode chosen by mistake, and a stored server URL that wins over
 * the page's own origin (`config.ts`) and points somewhere that has stopped
 * answering.
 *
 * What deliberately survives: this device's id, because two HLC stamps from
 * one device must never order by a fresh random id (Sync-API §3); the Local
 * Mode row store, which FR-19.8 already leaves in place; and the *migration
 * pending* flag, because the restore it stands for is still owed if the
 * person points this device at a server again.
 *
 * `reload` is a parameter for the reason `pwa/register.ts`'s is: the
 * orchestrator is built once per app start, so the choice only takes effect
 * after one — and a test cannot navigate.
 */
export function resetConnection(reload: () => void = () => window.location.reload()): void {
  clearTokens()
  localStorage.removeItem(MODE_KEY)
  localStorage.removeItem(SERVER_URL_KEY)
  reload()
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
  return isServerMode() && loadTokens() !== null
}

/**
 * Whether a typed server URL can be dialled at all: parseable, and http(s).
 * Syntax only — a reachability probe from the browser cannot tell an
 * unreachable host from a healthy one whose API sets no CORS headers, which
 * ours does not (UI-Spec M19).
 */
export function isValidServerUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
