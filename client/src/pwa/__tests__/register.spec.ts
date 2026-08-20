/**
 * App-start service-worker registration (NFR-4.13).
 *
 * The seam is deliberately injectable: the container is a parameter, so the
 * three situations that matter — supported, unsupported/insecure origin, and
 * a registration that fails — are stated here exactly, without a browser.
 */
import { describe, it, expect, beforeEach } from 'vitest'

import { registerAppServiceWorker, swUpdateReady, SW_URL } from '../register'

type Listener = (event?: unknown) => void

/** A hand-written ServiceWorkerRegistration fake — just what the seam reads. */
function fakeRegistration(overrides: { waiting?: object | null } = {}) {
  const listeners = new Map<string, Listener[]>()
  return {
    waiting: overrides.waiting ?? null,
    installing: null as {
      state: string
      addEventListener: (t: string, l: Listener) => void
    } | null,
    addEventListener(type: string, listener: Listener) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener])
    },
    emit(type: string) {
      for (const l of listeners.get(type) ?? []) l()
    },
  }
}

/** A hand-written ServiceWorkerContainer fake recording the registered URL. */
function fakeContainer(reg: ReturnType<typeof fakeRegistration>, controller: object | null) {
  const calls: string[] = []
  return {
    calls,
    controller,
    register(url: string) {
      calls.push(url)
      return Promise.resolve(reg)
    },
  }
}

function fakeWorker(state: string) {
  const listeners: Listener[] = []
  return {
    state,
    addEventListener(_type: string, listener: Listener) {
      listeners.push(listener)
    },
    setState(next: string) {
      this.state = next
      for (const l of listeners) l()
    },
  }
}

beforeEach(() => {
  swUpdateReady.value = false
})

describe('registerAppServiceWorker', () => {
  it('registers the one worker script at app start', async () => {
    const reg = fakeRegistration()
    const container = fakeContainer(reg, null)
    await registerAppServiceWorker(container as unknown as ServiceWorkerContainer)
    expect(container.calls).toEqual([SW_URL])
  })

  it('is a no-op without a container — a plain-HTTP LAN instance boots as today', async () => {
    // On an insecure origin navigator.serviceWorker is undefined
    // (E2E-NFR-SEC-01 guards the class); registration must simply not happen.
    await expect(registerAppServiceWorker(undefined)).resolves.toBeUndefined()
    expect(swUpdateReady.value).toBe(false)
  })

  it('swallows a failing registration — the app must still boot', async () => {
    const container = {
      controller: null,
      register: () => Promise.reject(new Error('SecurityError')),
    }
    await expect(
      registerAppServiceWorker(container as unknown as ServiceWorkerContainer),
    ).resolves.toBeUndefined()
    expect(swUpdateReady.value).toBe(false)
  })

  it('reports an update when a new worker was already waiting at launch', async () => {
    const reg = fakeRegistration({ waiting: {} })
    const container = fakeContainer(reg, {})
    await registerAppServiceWorker(container as unknown as ServiceWorkerContainer)
    expect(swUpdateReady.value).toBe(true)
  })

  it('reports an update when a new worker installs while the app is open', async () => {
    const reg = fakeRegistration()
    const container = fakeContainer(reg, {}) // controller: a worker already runs
    await registerAppServiceWorker(container as unknown as ServiceWorkerContainer)
    expect(swUpdateReady.value).toBe(false)

    const worker = fakeWorker('installing')
    reg.installing = worker
    reg.emit('updatefound')
    worker.setState('installed')
    expect(swUpdateReady.value).toBe(true)
  })

  it('stays silent on the very first install — nothing old is being replaced', async () => {
    const reg = fakeRegistration()
    const container = fakeContainer(reg, null) // no controller: first visit
    await registerAppServiceWorker(container as unknown as ServiceWorkerContainer)

    const worker = fakeWorker('installing')
    reg.installing = worker
    reg.emit('updatefound')
    worker.setState('installed')
    expect(swUpdateReady.value).toBe(false)
  })
})
