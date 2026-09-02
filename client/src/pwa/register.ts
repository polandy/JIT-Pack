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
 * Update policy (ADR-019, amended by ADR-044): a new worker installs in the
 * background and activates on the next launch — never an *unprompted* reload.
 * The running app flips `swUpdateReady`, which the G-2 detail sheet and the
 * FR-19.7 banner read; `applyUpdate()` is the only thing that shortens the
 * wait, and it runs from a press.
 */
import { ref, type Ref } from 'vue'

/**
 * The one worker script. Named once because two modules register it —
 * this one at boot and notifications/push.ts when push is enabled (§4a).
 */
export const SW_URL = '/sw.js'

/**
 * The one message the app sends the worker (FR-19.7). Its twin is
 * `MSG_SKIP_WAITING` in public/sw.js, which cannot import this module;
 * `register.spec.ts` reads the worker source and holds the two equal.
 */
export const SW_SKIP_WAITING = 'SKIP_WAITING'

/**
 * True once a newer build of the app is installed and waiting; it takes over
 * on the next launch. Surfaced through the G-2 detail sheet (FR-19.6).
 */
export const swUpdateReady: Ref<boolean> = ref(false)

/**
 * True from the moment `applyUpdate()` is pressed until the page is gone.
 * The surfaces read it to stop offering a second press (FR-19.7).
 */
export const swUpdateApplying: Ref<boolean> = ref(false)

/**
 * True while the running app has hidden the FR-19.7 banner for this load
 * ("Später"). Deliberately in memory and not in storage: the next full load
 * is the launch the waiting version takes over on anyway, so a stored
 * dismissal could only ever hide an announcement that is no longer true.
 */
export const swUpdateDismissed: Ref<boolean> = ref(false)

/** The registration whose `waiting` worker `applyUpdate()` wakes. */
let appRegistration: ServiceWorkerRegistration | null = null

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
    appRegistration = registration
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

/**
 * Applies the waiting version now (FR-19.7, ADR-044): the waiting worker is
 * told to take over, and the page reloads onto it.
 *
 * The reload is driven by `controllerchange` — the event that says the new
 * worker actually controls this page — and never by a timer, so the e2e case
 * asserts an outcome instead of racing one. A worker that is no longer
 * waiting (it activated meanwhile, or registration failed at boot) still
 * reloads: a reload lands on whatever is current, which is what was asked
 * for.
 *
 * Every parameter is injected so the unit test drives it without a browser.
 */
export async function applyUpdate(
  registration: ServiceWorkerRegistration | null = appRegistration,
  container: ServiceWorkerContainer | undefined = typeof navigator !== 'undefined'
    ? navigator.serviceWorker
    : undefined,
  reload: () => void = () => window.location.reload(),
): Promise<void> {
  if (swUpdateApplying.value) return
  swUpdateApplying.value = true
  const waiting = registration?.waiting
  if (waiting && container) {
    await new Promise<void>((resolve) => {
      const onControllerChange = () => {
        container.removeEventListener('controllerchange', onControllerChange)
        resolve()
      }
      container.addEventListener('controllerchange', onControllerChange)
      waiting.postMessage({ type: SW_SKIP_WAITING })
    })
  }
  reload()
}
