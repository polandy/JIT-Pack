/**
 * Service-worker registration at app start (NFR-4.13).
 *
 * One worker script serves both stories: Web Push (NFR-4.6, handlers in
 * public/sw.js since the beginning) and the app shell that makes an installed
 * PWA paint without network. Registration used to live only inside
 * `registerPush()`, which meant a device that never enabled push never got a
 * service worker — and therefore no offline shell. It now happens
 * unconditionally at boot; push later re-registers the same URL, which the
 * browser treats as a no-op.
 *
 * Update policy (see ADR-019): a new worker installs in the background and
 * activates on the next launch — never an unprompted reload. The only thing
 * the running app does about it is flip `swUpdateReady`, which the G-2 detail
 * sheet reads to say "a new version is ready".
 */
import { ref, type Ref } from 'vue'

/**
 * The one worker script. Named once because two modules register it —
 * this one at boot and notifications/push.ts when push is enabled (§4a).
 */
export const SW_URL = '/sw.js'

/**
 * True once a newer build of the app is installed and waiting; it takes over
 * on the next launch. Surfaced through the G-2 detail sheet (FR-19.6).
 */
export const swUpdateReady: Ref<boolean> = ref(false)

/**
 * Registers the app service worker. Resolves without effect when the
 * environment has no service-worker support — a plain-HTTP LAN instance
 * (insecure origin, E2E-NFR-SEC-01's class) must boot exactly as today —
 * and swallows registration failures for the same reason: the shell cache
 * is an enhancement, never a boot dependency.
 */
export async function registerAppServiceWorker(
  container: ServiceWorkerContainer | undefined = typeof navigator !== 'undefined'
    ? navigator.serviceWorker
    : undefined,
): Promise<void> {
  if (!container) return
  try {
    const registration = await container.register(SW_URL)
    watchForUpdate(registration, container)
  } catch {
    // Registration can fail on exotic setups (partitioned storage, disabled
    // SW). The app works without a shell cache; nothing to surface.
  }
}

/**
 * Flips `swUpdateReady` when a *replacement* worker reaches `installed`.
 * A controller must already exist — the very first install is not an update,
 * and announcing one there would greet every new device with a restart hint.
 */
function watchForUpdate(
  registration: ServiceWorkerRegistration,
  container: ServiceWorkerContainer,
): void {
  const isUpdate = () => container.controller !== null && container.controller !== undefined
  if (registration.waiting && isUpdate()) {
    swUpdateReady.value = true
    return
  }
  registration.addEventListener('updatefound', () => {
    const installing = registration.installing
    if (!installing) return
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed' && isUpdate()) swUpdateReady.value = true
    })
  })
}
