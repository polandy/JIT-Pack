/**
 * What a link does to the idea's text (FR-29.16) — pure, so the rules are
 * not only reachable through the sheet.
 *
 * Two different things. As soon as a link rests in the field, a blank title
 * takes the link's site, so a pasted link alone is an idea that can be saved
 * — in every mode, preview or none. What the page says about itself, on the
 * other hand, is only a **suggestion**: nothing of it reaches a field until
 * somebody confirms it.
 */
import { linkSite } from './ideas'

/** The two text fields a link may fill. */
export interface FillableText {
  title: string
  note: string
}

/** A page's own words, either of which may be missing. */
export interface PreviewText {
  title: string | null
  description: string | null
}

/** The text after the site name was placed, and the title it placed, if any. */
export interface LinkFill {
  text: FillableText
  placeholder: string | null
}

export function fillFromLink(current: FillableText, link: string): LinkFill {
  if (current.title.trim() !== '') return { text: current, placeholder: null }
  const site = linkSite(link)
  return { text: { ...current, title: site }, placeholder: site }
}

/**
 * The suggestion a page makes: its words where they would change a field,
 * or null where they would change nothing — nothing to confirm.
 */
export function suggestionFrom(page: PreviewText, current: FillableText): PreviewText | null {
  const title = page.title && page.title !== current.title ? page.title : null
  const description =
    page.description && page.description !== current.note ? page.description : null
  return title || description ? { title, description } : null
}

/** A confirmed suggestion: what it has replaces what was there. */
export function acceptSuggestion(current: FillableText, suggestion: PreviewText): FillableText {
  return {
    title: suggestion.title ?? current.title,
    note: suggestion.description ?? current.note,
  }
}
