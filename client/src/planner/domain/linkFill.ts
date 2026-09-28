/**
 * What a link fills in (FR-29.16) — pure, so the rule is not only
 * reachable through the sheet.
 *
 * Two steps. As soon as a link rests in the field, a blank title takes the
 * link's site, so a pasted link alone is an idea that can be saved — in
 * every mode, preview or none. Then, where the page is read, its own words
 * fill what is still blank; the site name placed in the first step counts
 * as blank, since nobody typed it. What somebody typed is theirs and stays.
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

/** The text after the first step, and the title it placed, if any. */
export interface LinkFill {
  text: FillableText
  placeholder: string | null
}

export function fillFromLink(current: FillableText, link: string): LinkFill {
  if (current.title.trim() !== '') return { text: current, placeholder: null }
  const site = linkSite(link)
  return { text: { ...current, title: site }, placeholder: site }
}

export function fillFromPreview(
  current: FillableText,
  preview: PreviewText,
  placeholder: string | null,
): FillableText {
  const titleIsBlank = current.title.trim() === '' || current.title === placeholder
  return {
    title: titleIsBlank && preview.title ? preview.title : current.title,
    note: current.note.trim() === '' && preview.description ? preview.description : current.note,
  }
}
