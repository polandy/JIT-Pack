// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import { saveTokens } from '@/auth/tokens'
import {
  MIGRATION_PENDING_KEY,
  MODE_KEY,
  SERVER_URL_KEY,
  chooseMode,
  switchToServer,
  hasCollaborativeSession,
  isValidServerUrl,
  readMode,
} from '@/mode'

/**
 * FR-19.1 — the run mode is one persisted choice, read through one module.
 */
describe('readMode', () => {
  beforeEach(() => localStorage.clear())

  it('is null before M19 has been answered', () => {
    expect(readMode()).toBeNull()
  })

  it('returns the persisted choice', () => {
    localStorage.setItem(MODE_KEY, 'local')
    expect(readMode()).toBe('local')
    localStorage.setItem(MODE_KEY, 'server')
    expect(readMode()).toBe('server')
  })

  it('treats a value that is neither mode as unanswered rather than trusting the cast', () => {
    localStorage.setItem(MODE_KEY, 'demo')
    expect(readMode()).toBeNull()
  })
})

describe('chooseMode', () => {
  beforeEach(() => localStorage.clear())

  it('persists a server choice with its URL', () => {
    chooseMode('server', 'https://packing.example.com')
    expect(readMode()).toBe('server')
    expect(localStorage.getItem(SERVER_URL_KEY)).toBe('https://packing.example.com')
  })

  it('persists a local choice and leaves the stored URL alone', () => {
    localStorage.setItem(SERVER_URL_KEY, 'https://earlier.example.com')
    chooseMode('local', null)
    expect(readMode()).toBe('local')
    expect(localStorage.getItem(SERVER_URL_KEY)).toBe('https://earlier.example.com')
  })
})

/** FR-19.8 — leaving Local Mode is the one write that also flags the restore. */
describe('switchToServer', () => {
  beforeEach(() => localStorage.clear())

  it('moves the client to Server Mode and leaves the restore pending', () => {
    localStorage.setItem(MODE_KEY, 'local')
    switchToServer('https://packing.example.com')
    expect(readMode()).toBe('server')
    expect(localStorage.getItem(SERVER_URL_KEY)).toBe('https://packing.example.com')
    expect(localStorage.getItem(MIGRATION_PENDING_KEY)).not.toBeNull()
  })

  it('is the only writer that sets the flag — M19 never does', () => {
    chooseMode('server', 'https://packing.example.com')
    expect(localStorage.getItem(MIGRATION_PENDING_KEY)).toBeNull()
  })
})

/**
 * G-8 — sharing, delegation and takeover exist only where there is a second
 * account: Server Mode with an OIDC session (FR-17.3, FR-19.3).
 */
describe('hasCollaborativeSession', () => {
  beforeEach(() => localStorage.clear())

  const session = { access_token: 'a', refresh_token: 'r', expires_in: 3600 }

  it('is false in Local Mode even with tokens lying around', () => {
    localStorage.setItem(MODE_KEY, 'local')
    saveTokens(session)
    expect(hasCollaborativeSession()).toBe(false)
  })

  it('is false on a server client with no session (Single-User Mode)', () => {
    localStorage.setItem(MODE_KEY, 'server')
    expect(hasCollaborativeSession()).toBe(false)
  })

  it('is true on a server client with a session', () => {
    localStorage.setItem(MODE_KEY, 'server')
    saveTokens(session)
    expect(hasCollaborativeSession()).toBe(true)
  })
})

/** UI-Spec M19 — the URL is validated for syntax only. */
describe('isValidServerUrl', () => {
  it.each([
    ['https://packing.example.com', true],
    ['http://192.168.1.10:8080', true],
    ['http://localhost:8080/', true],
    ['packing.example.com', false],
    ['ftp://packing.example.com', false],
    ['', false],
    ['https://', false],
  ])('%s → %s', (value, valid) => {
    expect(isValidServerUrl(value)).toBe(valid)
  })
})
