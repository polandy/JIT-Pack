/**
 * An idea's links (FR-29.22) — pure, so Local Mode keeps the order and a
 * spec needs no sheet to reach it.
 *
 * The idea's own link (`ideas.link`) stands at position 0; its further links
 * are `idea_links` rows at any integer, so a link moved before the own one
 * goes negative and the idea is not rewritten (ADR-107). Every screen reads
 * the one list `ideaLinks` makes of the two.
 */
import type { Idea, IdeaLink } from '../types'
import { linkSite } from './ideas'

/** Where a link of an idea comes from — and so where a save writes it. */
export type LinkKind = 'own' | 'row' | 'new'
/** The idea's own link, `ideas.link`. */
export const LINK_OWN = 'own' as const satisfies LinkKind
/** A further link, an `idea_links` row. */
export const LINK_ROW = 'row' as const satisfies LinkKind
/** A link added in the sheet, not yet written. */
export const LINK_NEW = 'new' as const satisfies LinkKind

/** The own link's place among the further ones. */
const OWN_POSITION = 0

/** What of an idea its links are read from — its own, and whose they are. */
type LinkedIdea = Pick<Idea, 'id' | 'trip_id' | 'link' | 'link_label'>

/** One link of an idea, as the screens draw it. */
export interface IdeaLinkEntry {
  kind: typeof LINK_OWN | typeof LINK_ROW
  /** The row's id; the idea's for its own link. */
  id: string
  url: string
  label: string | null
  position: number
}

/** One idea's links in their order. A tie goes to the own link, then the id. */
export function ideaLinks(idea: LinkedIdea, links: readonly IdeaLink[]): IdeaLinkEntry[] {
  const entries: IdeaLinkEntry[] = links
    .filter((link) => link.idea_id === idea.id)
    .map((link) => ({
      kind: LINK_ROW,
      id: link.id,
      url: link.url,
      label: link.label,
      position: link.position,
    }))
  if (idea.link !== null) {
    entries.push({
      kind: LINK_OWN,
      id: idea.id,
      url: idea.link,
      label: idea.link_label,
      position: OWN_POSITION,
    })
  }
  return entries.sort(
    (a, b) =>
      a.position - b.position ||
      Number(b.kind === LINK_OWN) - Number(a.kind === LINK_OWN) ||
      a.id.localeCompare(b.id),
  )
}

/** What a link is called: its label, else its page's title, else its site. */
export function linkName(
  link: { url: string; label: string | null },
  pageTitle: string | null,
): string {
  return blankToNull(link.label) ?? blankToNull(pageTitle) ?? linkSite(link.url)
}

/** One link as the sheet edits it, in the sheet's order. */
export interface LinkDraft {
  kind: LinkKind
  /** The row's id, the idea's for its own link, a fresh one for a new link. */
  id: string
  url: string
  label: string | null
}

/** The sheet's starting drafts: the idea's links as they stand. */
export function linkDrafts(idea: LinkedIdea, links: readonly IdeaLink[]): LinkDraft[] {
  return ideaLinks(idea, links).map(({ kind, id, url, label }) => ({ kind, id, url, label }))
}

/** What a save writes: the idea's own fields, and its rows. */
export interface LinkWrites {
  own: { link?: string | null; link_label?: string | null }
  inserts: IdeaLink[]
  updates: { id: string; fields: Partial<Pick<IdeaLink, 'url' | 'label' | 'position'>> }[]
  deletes: string[]
}

/**
 * The writes that turn an idea's links into the drafts. Only what changed is
 * written, so a save overwrites no one else's link or label; positions stand
 * unless the order needs new ones. A draft left blank is no link. With the own
 * link removed, the first new link takes its place, as a one-link idea's
 * link always was the idea's; with no new one, the idea has no own link.
 */
export function linkWrites(
  idea: LinkedIdea,
  links: readonly IdeaLink[],
  drafts: readonly LinkDraft[],
): LinkWrites {
  const kept = drafts
    .map((d) => ({ ...d, url: d.url.trim(), label: blankToNull(d.label) }))
    .filter((d) => d.url !== '')
  const ownIndex = (() => {
    const own = kept.findIndex((d) => d.kind === LINK_OWN)
    return own >= 0 ? own : kept.findIndex((d) => d.kind === LINK_NEW)
  })()
  const rows = new Map(links.filter((l) => l.idea_id === idea.id).map((l) => [l.id, l]))
  const positions =
    keptPositions(kept, rows, ownIndex) ??
    kept.map((_, i) => (ownIndex >= 0 ? i - ownIndex : i + 1))

  const writes: LinkWrites = { own: {}, inserts: [], updates: [], deletes: [] }
  const own = kept[ownIndex]
  const ownLink = own?.url ?? null
  const ownLabel = own?.label ?? null
  if (ownLink !== idea.link) writes.own.link = ownLink
  if (ownLabel !== idea.link_label) writes.own.link_label = ownLabel

  kept.forEach((d, i) => {
    if (i === ownIndex) return
    const position = positions[i]!
    const existing = d.kind === LINK_ROW ? rows.get(d.id) : undefined
    if (!existing) {
      writes.inserts.push({
        id: d.id,
        trip_id: idea.trip_id,
        idea_id: idea.id,
        url: d.url,
        label: d.label,
        position,
      })
      return
    }
    const fields: LinkWrites['updates'][number]['fields'] = {}
    if (d.url !== existing.url) fields.url = d.url
    if (d.label !== existing.label) fields.label = d.label
    if (position !== existing.position) fields.position = position
    if (Object.keys(fields).length > 0) writes.updates.push({ id: d.id, fields })
  })
  const still = new Set(kept.filter((d) => d.kind === LINK_ROW).map((d) => d.id))
  writes.deletes = [...rows.keys()].filter((id) => !still.has(id))
  return writes
}

/**
 * The drafts' positions if every kept link may keep its own: the order still
 * rises through them, and each new link fits one past the link before it.
 * Null when it does not, and the links are numbered afresh around the own one.
 */
function keptPositions(
  drafts: readonly LinkDraft[],
  rows: ReadonlyMap<string, IdeaLink>,
  ownIndex: number,
): number[] | null {
  const positions: number[] = []
  let previous: number | null = null
  for (const [i, d] of drafts.entries()) {
    const existing = d.kind === LINK_ROW ? rows.get(d.id) : undefined
    const position: number | null =
      i === ownIndex
        ? OWN_POSITION
        : (existing?.position ?? (previous === null ? null : previous + 1))
    if (position === null || (previous !== null && position <= previous)) return null
    positions.push(position)
    previous = position
  }
  return positions
}

function blankToNull(text: string | null): string | null {
  const trimmed = text?.trim() ?? ''
  return trimmed === '' ? null : trimmed
}
