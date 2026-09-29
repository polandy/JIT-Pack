/**
 * What a link suggests for the idea's text (FR-29.16) — pure, so the rules
 * are not only reachable through the sheet.
 *
 * Nothing a link brings reaches a field until somebody confirms it. What it
 * suggests is the page's own title and description where the page could be
 * read, and otherwise — Local Mode, a page that says nothing — the link's
 * site as a title for an idea that has none, so a pasted link is one tap
 * away from being saved in every mode.
 */
import { linkSite } from './ideas'

/** The two text fields a suggestion may fill. */
export interface FillableText {
  title: string
  note: string
}

/** A suggestion, or a page's own words: either half may be missing. */
export interface PreviewText {
  title: string | null
  description: string | null
}

/**
 * The suggestion for `link`, given what its page said (null where it was not
 * read) and what the fields hold. Null where it would change nothing.
 */
export function suggestionFor(
  link: string,
  page: PreviewText | null,
  current: FillableText,
): PreviewText | null {
  const blankTitle = current.title.trim() === ''
  const offered = page?.title ?? (blankTitle ? linkSite(link) : null)
  const title = offered && offered !== current.title ? offered : null
  const description =
    page?.description && page.description !== current.note ? page.description : null
  return title || description ? { title, description } : null
}

/** The two fields a suggestion is shown at, each with its own confirmation. */
export type SuggestedField = 'title' | 'note'

/** A suggestion after one field took its half — null once nothing is left. */
export interface AcceptedPart {
  text: FillableText
  rest: PreviewText | null
}

/**
 * One field's half of a suggestion, confirmed at that field: it replaces
 * what the field held, and the other half stays suggested.
 */
export function acceptPart(
  current: FillableText,
  suggestion: PreviewText,
  field: SuggestedField,
): AcceptedPart {
  const text =
    field === 'title'
      ? { ...current, title: suggestion.title ?? current.title }
      : { ...current, note: suggestion.description ?? current.note }
  const rest =
    field === 'title'
      ? { title: null, description: suggestion.description }
      : { title: suggestion.title, description: null }
  return { text, rest: rest.title || rest.description ? rest : null }
}
