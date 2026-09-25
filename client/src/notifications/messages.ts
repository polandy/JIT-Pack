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

/** FR-7.11's reminder — the one kind whose body depends on its payload's day, and whose link is M25. */
export const NOTIFY_TASK_DUE = 'task_due'

/** FR-7.9's new note and FR-7.13's reply — the two kinds whose link is a thread on M26. */
export const NOTIFY_NOTE = 'note'
export const NOTIFY_NOTE_REPLY = 'note_reply'

/** The kinds the server sends (Sync-API §8). */
export const NOTIFICATION_KINDS = [
  'delegation',
  'mention',
  'task',
  'lock_taken',
  NOTIFY_NOTE,
  NOTIFY_NOTE_REPLY,
  NOTIFY_TASK_DUE,
] as const

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

/**
 * The name of the body a notification renders with. A kind has two: one that
 * names the thing it is about and one for when the payload does not carry it.
 * `generic` answers a kind this client does not know — a newer server is not
 * an error, and a notification with no text at all would be.
 */
export type NotificationBodyName = `${BodyKind}` | `${BodyKind}Plain` | 'generic'

/**
 * FR-7.11: what a body is chosen by — the kind, and for a reminder also the
 * day it names, because „due tomorrow" and „due today" are two sentences
 * rather than one with a word filled in (the word would have to be
 * translated in the worker, which holds no words of its own).
 */
const TASK_DUE_TOMORROW = 'task_dueTomorrow'
type BodyKind = NotificationKind | typeof TASK_DUE_TOMORROW
const BODY_KINDS: readonly BodyKind[] = [...NOTIFICATION_KINDS, TASK_DUE_TOMORROW]

/** The kinds whose sentence quotes the body rather than naming an item. */
const PREVIEW_KINDS: readonly string[] = ['mention', NOTIFY_NOTE, NOTIFY_NOTE_REPLY]

/** The payload's `due` value that picks the tomorrow sentence (FR-7.11). */
export const DUE_TOMORROW = 'tomorrow'

/** Every body name, which is also every row the mirror must carry. */
export const NOTIFICATION_BODY_NAMES: readonly NotificationBodyName[] = [
  ...BODY_KINDS.map((kind) => kind as NotificationBodyName),
  ...BODY_KINDS.map((kind) => `${kind}Plain` as NotificationBodyName),
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
  /** FR-7.11: which day a reminder names — `today` or `tomorrow`. */
  due: string
} {
  const str = (key: string) => {
    const value = payload?.[key]
    return typeof value === 'string' ? value : ''
  }
  return { item: str('item_name'), preview: str('preview'), due: str('due') }
}

/**
 * Which body a notification renders with. Exported because `public/sw.js`
 * has to make the same choice and is held to this one by
 * `notifications/__tests__/workerBody.spec.ts`.
 */
export function notificationBodyName(
  kind: string,
  detail: { item: string; preview: string; due?: string },
): NotificationBodyName {
  if (!(NOTIFICATION_KINDS as readonly string[]).includes(kind)) return 'generic'
  // FR-7.9/FR-7.13: a note and a reply are about their own words, like a
  // mention — they name no item, only the body's preview.
  const named = PREVIEW_KINDS.includes(kind) ? detail.preview : detail.item
  const body = kind === NOTIFY_TASK_DUE && detail.due === DUE_TOMORROW ? TASK_DUE_TOMORROW : kind
  return (named ? body : `${body}Plain`) as NotificationBodyName
}

/** The slots a body may name; unused ones are simply not referenced. */
export function notificationParams(
  entry: Pick<NotificationEntry, 'payload'>,
  actorFallback: string,
): Record<string, string> {
  const detail = notificationDetail(entry.payload)
  const actor = entry.payload?.['actor_name']
  const thread = entry.payload?.['thread']
  return {
    actor: typeof actor === 'string' && actor ? actor : actorFallback,
    item: detail.item,
    preview: detail.preview,
    // FR-7.13: what the thread a reply answers is called.
    thread: typeof thread === 'string' ? thread : '',
  }
}
