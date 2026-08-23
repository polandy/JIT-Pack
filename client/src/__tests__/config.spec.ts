// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultServerBaseUrl, serverBaseUrl } from '@/config'

/**
 * FR-19.1 — the first-launch server URL must be usable without typing.
 *
 * `import.meta.env` is stubbed per case: the production build (DEV
 * false, no VITE_API_URL) is the self-hosted deployment that has to
 * resolve to the page's own origin.
 */
describe('defaultServerBaseUrl', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('FR-19.1: uses the page origin in a production build so the field starts correct', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_API_URL', '')

    expect(defaultServerBaseUrl()).toBe(window.location.origin)
  })

  it('FR-19.1: prefers an explicit VITE_API_URL over the page origin', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_API_URL', 'https://jitpack.example.com')

    expect(defaultServerBaseUrl()).toBe('https://jitpack.example.com')
  })

  it('keeps the split-origin backend on the Vite dev server', () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_API_URL', '')

    expect(defaultServerBaseUrl()).toBe('http://localhost:8080')
  })
})

describe('serverBaseUrl', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('lets the persisted M19 choice win over the default', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_API_URL', '')
    localStorage.setItem('jitpack_server_url', 'https://chosen.example.com')

    expect(serverBaseUrl()).toBe('https://chosen.example.com')
  })

  it('falls back to the default when M19 has not been answered', () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_API_URL', '')

    expect(serverBaseUrl()).toBe(window.location.origin)
  })
})
