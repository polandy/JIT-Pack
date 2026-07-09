/**
 * NFR-4.6 client half: browser push registration flow against a fake
 * pushManager, and the base64url→bytes conversion PushManager needs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { pushSupported, registerPush, unregisterPush, urlBase64ToUint8Array, type PushServerAPI } from '../push'

function fakeApi(): PushServerAPI & { registered: unknown[]; unregistered: string[] } {
  const registered: unknown[] = []
  const unregistered: string[] = []
  return {
    registered,
    unregistered,
    getVapidKey: vi.fn().mockResolvedValue('BPY0zpo_1BHle-1LDXm1QSLNVsA1S7Jr8_ZFm2FCbP0'),
    registerSubscription: vi.fn(async (s: unknown) => { registered.push(s) }),
    unregisterSubscription: vi.fn(async (e: string) => { unregistered.push(e) }),
  }
}

interface FakePushManager {
  getSubscription: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
}

function fakeSubscription(endpoint = 'https://push.example/sub-1') {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  }
}

let pushManager: FakePushManager

beforeEach(() => {
  pushManager = {
    getSubscription: vi.fn().mockResolvedValue(null),
    subscribe: vi.fn().mockResolvedValue(fakeSubscription()),
  }
  const registration = { pushManager }
  vi.stubGlobal('navigator', {
    serviceWorker: {
      register: vi.fn().mockResolvedValue(registration),
      getRegistration: vi.fn().mockResolvedValue(registration),
    },
  })
  vi.stubGlobal('PushManager', function () {})
  vi.stubGlobal('Notification', { requestPermission: vi.fn().mockResolvedValue('granted') })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('registerPush', () => {
  it('subscribes with the server VAPID key and registers the subscription', async () => {
    const api = fakeApi()

    const ok = await registerPush(api)

    expect(ok).toBe(true)
    expect(pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({
      userVisibleOnly: true,
      applicationServerKey: expect.any(Uint8Array),
    }))
    expect(api.registered).toEqual([
      { endpoint: 'https://push.example/sub-1', keys: { p256dh: 'p', auth: 'a' } },
    ])
  })

  it('reuses an existing browser subscription instead of resubscribing', async () => {
    pushManager.getSubscription.mockResolvedValue(fakeSubscription('https://push.example/old'))
    const api = fakeApi()

    const ok = await registerPush(api)

    expect(ok).toBe(true)
    expect(pushManager.subscribe).not.toHaveBeenCalled()
    expect((api.registered[0] as { endpoint: string }).endpoint).toBe('https://push.example/old')
  })

  it('returns false when the user denies the permission', async () => {
    vi.stubGlobal('Notification', { requestPermission: vi.fn().mockResolvedValue('denied') })
    const api = fakeApi()

    expect(await registerPush(api)).toBe(false)
    expect(api.registered).toHaveLength(0)
  })

  it('returns false when the browser has no push support', async () => {
    vi.stubGlobal('navigator', {})

    expect(pushSupported()).toBe(false)
    expect(await registerPush(fakeApi())).toBe(false)
  })
})

describe('unregisterPush', () => {
  it('removes the subscription on the server and in the browser', async () => {
    const sub = fakeSubscription()
    pushManager.getSubscription.mockResolvedValue(sub)
    const api = fakeApi()

    await unregisterPush(api)

    expect(api.unregistered).toEqual(['https://push.example/sub-1'])
    expect(sub.unsubscribe).toHaveBeenCalled()
  })

  it('is a no-op without a subscription', async () => {
    const api = fakeApi()

    await unregisterPush(api)

    expect(api.unregistered).toHaveLength(0)
  })
})

describe('urlBase64ToUint8Array', () => {
  it('decodes base64url including - and _ and missing padding', () => {
    // "?>" is 0x3f 0x3e — base64url "Pz4" exercises unpadded input;
    // '-' and '_' map to '+' and '/'.
    expect(Array.from(urlBase64ToUint8Array('Pz4'))).toEqual([0x3f, 0x3e])
    expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([0xfb, 0xff])
  })
})
