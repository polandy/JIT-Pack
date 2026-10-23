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
import {
  NOTIFICATION_DUE,
  NOTIFICATION_KIND,
  NOTIFICATION_PAYLOAD_KEY,
  type NotificationEntry,
  type NotificationKind,
} from '@/api/types'

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
const SHOPPING_DUE_TOMORROW = 'shopping_dueTomorrow'
const EXCURSION_DUE_TOMORROW = 'excursion_dueTomorrow'
/** FR-7.18: a task's day-before sentence when it has a time, and its push at that time. */
const TASK_DUE_TOMORROW_AT = 'task_dueTomorrowAt'
const TASK_DUE_NOW = 'task_dueNow'
type TomorrowBody =
  typeof TASK_DUE_TOMORROW | typeof SHOPPING_DUE_TOMORROW | typeof EXCURSION_DUE_TOMORROW
type TimedBody = typeof TASK_DUE_TOMORROW_AT | typeof TASK_DUE_NOW
type BodyKind = NotificationKind | TomorrowBody | TimedBody

/**
 * How each kind's sentence is chosen: whether it quotes the body's preview
 * rather than naming an item (a mention, FR-7.9's note, FR-7.13's reply), and
 * a reminder's tomorrow sentence (FR-7.11, FR-30.10, FR-31.9) — and for a
 * task with a time, the tomorrow sentence naming it and the one sent at it
 * (FR-7.18). A record over the generated kinds, so a kind the server adds
 * fails the type check here.
 */
const KIND_BODIES: Readonly<
  Record<
    NotificationKind,
    {
      quotes: boolean
      tomorrow?: TomorrowBody
      tomorrowAt?: typeof TASK_DUE_TOMORROW_AT
      now?: typeof TASK_DUE_NOW
    }
  >
> = {
  [NOTIFICATION_KIND.delegation]: { quotes: false },
  [NOTIFICATION_KIND.mention]: { quotes: true },
  [NOTIFICATION_KIND.task]: { quotes: false },
  [NOTIFICATION_KIND.lock_taken]: { quotes: false },
  [NOTIFICATION_KIND.note]: { quotes: true },
  [NOTIFICATION_KIND.note_reply]: { quotes: true },
  [NOTIFICATION_KIND.task_due]: {
    quotes: false,
    tomorrow: TASK_DUE_TOMORROW,
    tomorrowAt: TASK_DUE_TOMORROW_AT,
    now: TASK_DUE_NOW,
  },
  [NOTIFICATION_KIND.shopping_due]: { quotes: false, tomorrow: SHOPPING_DUE_TOMORROW },
  [NOTIFICATION_KIND.excursion_due]: { quotes: false, tomorrow: EXCURSION_DUE_TOMORROW },
  [NOTIFICATION_KIND.idea]: { quotes: false },
  [NOTIFICATION_KIND.idea_comment]: { quotes: false },
  [NOTIFICATION_KIND.idea_shortlisted]: { quotes: false },
}

/** The kinds the server sends (Sync-API §8). */
const NOTIFICATION_KINDS = Object.values(NOTIFICATION_KIND)

const BODY_KINDS: readonly BodyKind[] = [
  ...NOTIFICATION_KINDS,
  TASK_DUE_TOMORROW,
  SHOPPING_DUE_TOMORROW,
  EXCURSION_DUE_TOMORROW,
  TASK_DUE_TOMORROW_AT,
  TASK_DUE_NOW,
]

function isKind(kind: string): kind is NotificationKind {
  return Object.hasOwn(KIND_BODIES, kind)
}

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
  /** FR-7.11: which day a reminder names — `today`, `tomorrow` or `now` (FR-7.18). */
  due: string
  /** FR-7.18: the time a task's reminder names, `HH:MM`, or empty. */
  time: string
} {
  const str = (key: string) => {
    const value = payload?.[key]
    return typeof value === 'string' ? value : ''
  }
  return {
    item: str(NOTIFICATION_PAYLOAD_KEY.item_name),
    preview: str(NOTIFICATION_PAYLOAD_KEY.preview),
    due: str(NOTIFICATION_PAYLOAD_KEY.due),
    time: str(NOTIFICATION_PAYLOAD_KEY.time),
  }
}

/**
 * Which body a notification renders with. Exported because `public/sw.js`
 * has to make the same choice and is held to this one by
 * `notifications/__tests__/workerBody.spec.ts`.
 */
export function notificationBodyName(
  kind: string,
  detail: { item: string; preview: string; due?: string; time?: string },
): NotificationBodyName {
  if (!isKind(kind)) return 'generic'
  const { quotes, tomorrow, tomorrowAt, now } = KIND_BODIES[kind]
  const named = quotes ? detail.preview : detail.item
  const body =
    (detail.due === NOTIFICATION_DUE.now && detail.time && now) ||
    (detail.due === NOTIFICATION_DUE.tomorrow && detail.time && tomorrowAt) ||
    (detail.due === NOTIFICATION_DUE.tomorrow && tomorrow) ||
    kind
  return (named ? body : `${body}Plain`) as NotificationBodyName
}

/** The slots a body may name; unused ones are simply not referenced. */
export function notificationParams(
  entry: Pick<NotificationEntry, 'payload'>,
  actorFallback: string,
): Record<string, string> {
  const detail = notificationDetail(entry.payload)
  const actor = entry.payload?.[NOTIFICATION_PAYLOAD_KEY.actor_name]
  const thread = entry.payload?.[NOTIFICATION_PAYLOAD_KEY.thread]
  return {
    actor: typeof actor === 'string' && actor ? actor : actorFallback,
    item: detail.item,
    preview: detail.preview,
    // FR-7.13: what the thread a reply answers is called.
    thread: typeof thread === 'string' ? thread : '',
    // FR-7.18: the time a task's reminder names.
    time: detail.time,
  }
}
