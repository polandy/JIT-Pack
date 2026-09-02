/**
 * App-start service-worker registration (NFR-4.13).
 *
 * The seam is deliberately injectable: the container is a parameter, so the
 * three situations that matter — supported, unsupported/insecure origin, and
 * a registration that fails — are stated here exactly, without a browser.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, it, expect, beforeEach } from 'vitest'

import {
  applyUpdate,
  registerAppServiceWorker,
  swUpdateApplying,
  swUpdateDismissed,
  swUpdateReady,
  SW_SKIP_WAITING,
  SW_URL,
} from '../register'

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
  swUpdateApplying.value = false
  swUpdateDismissed.value = false
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

/**
 * A container fake that also carries the `controllerchange` listeners
 * `applyUpdate` waits on, plus a waiting worker recording what it was sent.
 */
function fakeUpdateSeam(hasWaiting = true) {
  const listeners = new Map<string, Listener[]>()
  const posted: unknown[] = []
  const waiting = {
    postMessage(message: unknown) {
      posted.push(message)
    },
  }
  const container = {
    controller: {},
    register: () => Promise.resolve(null as never),
    addEventListener(type: string, listener: Listener) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener])
    },
    removeEventListener(type: string, listener: Listener) {
      listeners.set(
        type,
        (listeners.get(type) ?? []).filter((l) => l !== listener),
      )
    },
    emit(type: string) {
      // Snapshot the list: a listener removes itself, and removeEventListener
      // replaces the array rather than mutating this one.
      const current = listeners.get(type) ?? []
      for (const l of current) l()
    },
    listenerCount: (type: string) => (listeners.get(type) ?? []).length,
  }
  const registration = { waiting: hasWaiting ? waiting : null }
  return { container, registration, posted }
}

describe('applyUpdate — FR-19.7, applying a waiting version now (ADR-044)', () => {
  it('wakes the waiting worker and reloads only once it controls the page', async () => {
    const { container, registration, posted } = fakeUpdateSeam()
    let reloads = 0
    const done = applyUpdate(registration as never, container as never, () => {
      reloads += 1
    })

    // The message went out — and nothing reloaded yet. The reload is the
    // *consequence* of the takeover, never a guess about how long it takes.
    expect(posted).toEqual([{ type: SW_SKIP_WAITING }])
    expect(reloads).toBe(0)

    container.emit('controllerchange')
    await done
    expect(reloads).toBe(1)
    // The one-shot listener is gone, so a later takeover cannot reload again.
    expect(container.listenerCount('controllerchange')).toBe(0)
  })

  it('reloads straight away when no worker is waiting any more', async () => {
    const { container, registration, posted } = fakeUpdateSeam(false)
    let reloads = 0
    await applyUpdate(registration as never, container as never, () => {
      reloads += 1
    })
    // A reload lands on whatever is current, which is what was asked for.
    expect(reloads).toBe(1)
    expect(posted).toEqual([])
  })

  it('ignores a second press while the first is still in flight', async () => {
    const { container, registration, posted } = fakeUpdateSeam()
    let reloads = 0
    const reload = () => {
      reloads += 1
    }
    const first = applyUpdate(registration as never, container as never, reload)
    await applyUpdate(registration as never, container as never, reload)

    expect(swUpdateApplying.value).toBe(true)
    expect(posted).toHaveLength(1)
    expect(reloads).toBe(0)

    container.emit('controllerchange')
    await first
    expect(reloads).toBe(1)
  })

  it('names the same message the worker listens for', () => {
    // The worker cannot import this module (§4a), so the two literals are
    // held equal here rather than by the type system.
    const source = readFileSync(
      fileURLToPath(new URL('../../../public/sw.js', import.meta.url)),
      'utf8',
    )
    expect(source).toContain(`const MSG_SKIP_WAITING = '${SW_SKIP_WAITING}'`)

    const install = source.slice(source.indexOf("addEventListener('install'"))
    const message = source.slice(source.indexOf("addEventListener('message'"))
    // The message is answered — a constant both sides agree on says nothing
    // about a handler that was deleted, and only E2E-PWA-05 would see that.
    expect(message).toContain('MSG_SKIP_WAITING')
    expect(message).toContain('self.skipWaiting()')
    // And it stays out of `install`: an unprompted takeover is exactly what
    // ADR-019 refuses and ADR-044 kept refusing.
    expect(install.slice(0, install.indexOf("addEventListener('message'"))).not.toContain(
      'self.skipWaiting()',
    )
  })
})
