/**
 * What a link's preview fills in (FR-29.16) — pure, so the rule is not
 * only reachable through the sheet.
 *
 * A preview only ever fills a blank: what somebody typed, before or while
 * the page was being read, is theirs and stays.
 */

/** The two text fields a preview may fill. */
export interface FillableText {
  title: string
  note: string
}

/** A page's own words, either of which may be missing. */
export interface PreviewText {
  title: string | null
  description: string | null
}

export function fillFromPreview(current: FillableText, preview: PreviewText): FillableText {
  return {
    title: current.title.trim() === '' && preview.title ? preview.title : current.title,
    note: current.note.trim() === '' && preview.description ? preview.description : current.note,
  }
}
