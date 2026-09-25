/**
 * The lines a trip-note thread says about itself (FR-7.13) — who wrote an
 * entry and when, whether it was edited, and how much a collapsed thread
 * holds.
 *
 * `lib/` rather than `domain/`, for `taskFacts.ts`'s reason: these read the
 * catalogue, and a domain module must not import the i18n layer. A missing
 * name is silence, not a placeholder (Local and Single-User Mode, G-8).
 */
import { relativeStamp } from '@/domain/stamp'
import type { NoteThread } from '@/domain/tripNotes'
import { currentLocale, t } from '@/i18n'
import type { ItemComment } from '@/types/domain'
import { stampText, type NameOf } from './rowFacts'

function when(at: string | null, now: Date): string {
  return at ? stampText(relativeStamp(at, now, currentLocale())) : ''
}

function joined(parts: readonly string[]): string {
  return parts.filter((part) => part !== '').join(' · ')
}

/** „Ben · heute 14:32 · bearbeitet" — an entry's own line. */
export function noteEntryMeta(entry: ItemComment, nameOf: NameOf, now: Date = new Date()): string {
  return joined([
    nameOf(entry.author_id) ?? '',
    when(entry.created_at, now),
    entry.edited_at ? t('notes.edited') : '',
  ])
}

/**
 * A collapsed thread's line: how many replies and when the last thing
 * happened — or, with no reply yet, who wrote it, which is then the one fact
 * a count would hide.
 */
export function noteThreadMeta(thread: NoteThread, nameOf: NameOf, now: Date = new Date()): string {
  const n = thread.replies.length
  const lead = n > 0 ? t('notes.replies', { n }) : (nameOf(thread.root.author_id) ?? '')
  return joined([lead, when(thread.lastActivity || null, now)])
}
