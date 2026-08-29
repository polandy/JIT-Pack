// @vitest-environment jsdom
// The subject reads the catalogue, and switching language sets
// `document.documentElement.lang` — a `node` run would assert against the
// throw instead of the translation.
/** FR-6.2/FR-6.3: toast wording and deep-link routes per notification kind. */
import { describe, it, expect, afterEach } from 'vitest'

import { describeNotification, notificationRoute, type ServerNotification } from '../format'
import { DEFAULT_LOCALE, setLocale } from '@/i18n'

function notif(kind: string, payload: Record<string, unknown> | null): ServerNotification {
  return { id: 'n1', kind, payload, created_at: '2026-07-09T12:00:00Z' }
}

describe('describeNotification', () => {
  const cases: { name: string; n: ServerNotification; want: string }[] = [
    {
      name: 'delegation with item',
      n: notif('delegation', { actor_name: 'Andy', item_name: 'Zelt' }),
      want: 'Andy delegated “Zelt” to you',
    },
    {
      name: 'delegation without item name',
      n: notif('delegation', { actor_name: 'Andy' }),
      want: 'Andy delegated an item to you',
    },
    {
      name: 'mention with preview',
      n: notif('mention', { actor_name: 'Sarah', preview: 'check @andy please' }),
      want: 'Sarah mentioned you: check @andy please',
    },
    {
      name: 'task on item',
      n: notif('task', { actor_name: 'Sarah', item_name: 'Kocher' }),
      want: 'Sarah opened a task on “Kocher”',
    },
    {
      // FR-5.7: the one kind the recipient did not set in motion, so the
      // wording has to say what happened rather than only who did it.
      name: 'a claim taken over',
      n: notif('lock_taken', { actor_name: 'Sarah', item_name: 'Zelt' }),
      want: 'Sarah took “Zelt” over from you',
    },
    {
      name: 'a claim taken over, item unnamed',
      n: notif('lock_taken', { actor_name: 'Sarah' }),
      want: 'Sarah took an item over from you',
    },
    {
      name: 'unknown kind falls back gracefully',
      n: notif('shiny_new_kind', { actor_name: 'Andy' }),
      want: 'Andy sent you a notification',
    },
    {
      name: 'missing actor',
      n: notif('mention', {}),
      want: 'Someone mentioned you',
    },
  ]

  it.each(cases)('$name', ({ n, want }) => {
    expect(describeNotification(n)).toBe(want)
  })
})

describe('notificationRoute (G-4)', () => {
  it('routes to the item context when the payload has one', () => {
    expect(notificationRoute(notif('delegation', { trip_id: 't1', item_id: 'i1' }))).toBe(
      '/trips/t1/items/i1',
    )
  })

  it('routes to the trip without an item', () => {
    expect(notificationRoute(notif('mention', { trip_id: 't1' }))).toBe('/trips/t1')
  })

  it('appends the comment id so M5 can flash the message', () => {
    expect(
      notificationRoute(notif('mention', { trip_id: 't1', item_id: 'i1', comment_id: 'c9' })),
    ).toBe('/trips/t1/items/i1?comment=c9')
  })

  it('returns null without a trip', () => {
    expect(notificationRoute(notif('mention', {}))).toBeNull()
  })
})

/**
 * The wire's payload is nullable — a nil map marshals to `null` — which the
 * client's hand-written copy of this type denied until the contract generated
 * it (NFR-4.14). Reading a key off null throws, so both readers are asserted
 * against one rather than left to a type that says it cannot happen.
 */
describe('a notification whose payload is null', () => {
  it('still describes the kind', () => {
    expect(describeNotification(notif('delegation', null))).toBe('Someone delegated an item to you')
  })

  it('routes nowhere rather than to a route built from nothing', () => {
    expect(notificationRoute(notif('delegation', null))).toBeNull()
  })
})

/**
 * NFR-4.12: the notification body was the last surface still written as an
 * English literal. It comes off the catalogue now, which is only worth
 * asserting in the *other* language — an English expectation would pass
 * against the literals this replaced.
 */
describe('the body speaks the app’s language', () => {
  afterEach(() => setLocale(DEFAULT_LOCALE))

  it.each([
    ['delegation', { actor_name: 'Andy', item_name: 'Zelt' }, 'Andy hat dir „Zelt“ zugewiesen'],
    ['mention', { actor_name: 'Sarah' }, 'Sarah hat dich erwähnt'],
    [
      'lock_taken',
      { actor_name: 'Sarah', item_name: 'Zelt' },
      'Sarah hat „Zelt“ von dir übernommen',
    ],
    ['shiny_new_kind', { actor_name: 'Andy' }, 'Andy hat dir eine Benachrichtigung geschickt'],
    // The actor fallback is a word, so it is translated too — „Someone
    // mentioned you" in a German sentence is the half-translation the NFR
    // exists to prevent.
    ['mention', {}, 'Jemand hat dich erwähnt'],
  ])('%s', (kind, payload, want) => {
    setLocale('de')

    expect(describeNotification(notif(kind, payload))).toBe(want)
  })
})
