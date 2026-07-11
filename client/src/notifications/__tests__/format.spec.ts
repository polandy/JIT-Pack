/** FR-6.2/FR-6.3: toast wording and deep-link routes per notification kind. */
import { describe, it, expect } from 'vitest'

import { describeNotification, notificationRoute, type ServerNotification } from '../format'

function notif(kind: string, payload: Record<string, unknown>): ServerNotification {
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
