/**
 * The FR-6.2 notification vocabulary, in one place (NFR-4.12).
 *
 * Two consumers render these sentences: the in-app toast, through `t()`, and
 * the OS notification, in `public/sw.js` — which cannot import a module and
 * so reads the finished templates out of the mirror this module describes
 * (ADR-037). What both of them share is the *text*, which lives in the
 * catalogue like every other string in the app, and the *shape* of the
 * lookup, which is the two rules below rather than a switch written twice.
 */
import type { MessageKey } from '@/i18n'
import type { NotificationEntry } from '@/api/types'

/** The kinds the server sends (Sync-API §8). */
export const NOTIFICATION_KINDS = ['delegation', 'mention', 'task', 'lock_taken'] as const

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

/**
 * The name of the body a notification renders with. A kind has two: one that
 * names the thing it is about and one for when the payload does not carry it.
 * `generic` answers a kind this client does not know — a newer server is not
 * an error, and a notification with no text at all would be.
 */
export type NotificationBodyName = `${NotificationKind}` | `${NotificationKind}Plain` | 'generic'

/** Every body name, which is also every row the mirror must carry. */
export const NOTIFICATION_BODY_NAMES: readonly NotificationBodyName[] = [
  ...NOTIFICATION_KINDS.map((kind) => kind as NotificationBodyName),
  ...NOTIFICATION_KINDS.map((kind) => `${kind}Plain` as NotificationBodyName),
  'generic',
]

/** The catalogue key each body is written under. */
export function bodyMessageKey(name: NotificationBodyName): MessageKey {
  return `notify.body.${name}` as MessageKey
}

/**
 * The detail a kind is *about*: a mention quotes the message, everything
 * else names the item. Absent detail is what picks the `Plain` body.
 */
export function notificationDetail(payload: Record<string, unknown> | null): {
  item: string
  preview: string
} {
  const str = (key: string) => {
    const value = payload?.[key]
    return typeof value === 'string' ? value : ''
  }
  return { item: str('item_name'), preview: str('preview') }
}

/**
 * Which body a notification renders with. Exported because `public/sw.js`
 * has to make the same choice and is held to this one by
 * `notifications/__tests__/workerBody.spec.ts`.
 */
export function notificationBodyName(
  kind: string,
  detail: { item: string; preview: string },
): NotificationBodyName {
  if (!(NOTIFICATION_KINDS as readonly string[]).includes(kind)) return 'generic'
  const named = kind === 'mention' ? detail.preview : detail.item
  return (named ? kind : `${kind}Plain`) as NotificationBodyName
}

/** The slots a body may name; unused ones are simply not referenced. */
export function notificationParams(
  entry: Pick<NotificationEntry, 'payload'>,
  actorFallback: string,
): Record<string, string> {
  const detail = notificationDetail(entry.payload)
  const actor = entry.payload?.['actor_name']
  return {
    actor: typeof actor === 'string' && actor ? actor : actorFallback,
    item: detail.item,
    preview: detail.preview,
  }
}
