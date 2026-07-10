/**
 * Web Push registration (NFR-4.6): permission → service worker →
 * pushManager.subscribe with the server's VAPID key → register the
 * subscription with the server. The server API is injected so this
 * module owns only the browser dance and stays testable.
 */

export interface PushServerAPI {
  getVapidKey(): Promise<string>
  registerSubscription(sub: unknown): Promise<void>
  unregisterSubscription(endpoint: string): Promise<void>
}

/** Feature detection — false on iOS Safari without PWA install, jsdom, etc. */
export function pushSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator &&
    typeof window !== 'undefined' && 'PushManager' in window
}

/** Whether this device currently holds a push subscription. */
export async function pushRegistered(): Promise<boolean> {
  if (!pushSupported()) return false
  const reg = await navigator.serviceWorker.getRegistration()
  return !!(await reg?.pushManager.getSubscription())
}

/**
 * Register this device for push. Returns false when unsupported or the
 * user denied the permission prompt.
 */
export async function registerPush(api: PushServerAPI): Promise<boolean> {
  if (!pushSupported()) return false
  if ((await Notification.requestPermission()) !== 'granted') return false

  const reg = await navigator.serviceWorker.register('/sw.js')
  const key = await api.getVapidKey()
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    }))
  await api.registerSubscription(sub.toJSON())
  return true
}

/** M17 opt-out: drop the subscription on the server and in the browser. */
export async function unregisterPush(api: PushServerAPI): Promise<void> {
  if (!pushSupported()) return
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await api.unregisterSubscription(sub.endpoint)
  await sub.unsubscribe()
}

/** VAPID keys travel base64url-encoded; PushManager wants raw bytes (ArrayBuffer-backed per BufferSource). */
export function urlBase64ToUint8Array(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url + '='.repeat((4 - (base64url.length % 4)) % 4)
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}
