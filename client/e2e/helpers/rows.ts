import type { Locator } from '@playwright/test'

/**
 * G-13 — a word on a chip, pill or toggle is never cut, and a row that
 * scrolls sideways says so: read off the rendered row, never off its classes.
 */

/** The narrowest phone still in use and the Pixel 9 Pro's rendered width (ADR-051). */
export const CUE_PHONES = [
  { width: 360, height: 800 },
  { width: 412, height: 915 },
] as const

/** Where a sideways row rests, and on which sides it fades. */
export interface RowCue {
  /**
   * `centred` on the current item, `start`/`end` where the row is held at an
   * end because centring would pass it, otherwise how far off it rests.
   */
  rest: string
  /** The sides the computed `mask-image` fades out. */
  faded: 'none' | 'start' | 'end' | 'both'
}

/** How a sideways row rests on the item `current` matches, and where it fades. */
export function rowCue(row: Locator, current: string): Promise<RowCue> {
  return row.evaluate((el, selector): RowCue => {
    const box = el.getBoundingClientRect()
    const item = el.querySelector(selector)!.getBoundingClientRect()
    const offCentre = item.left + item.width / 2 - (box.left + box.width / 2)
    const max = el.scrollWidth - el.clientWidth
    const rest =
      Math.abs(offCentre) <= 1
        ? 'centred'
        : offCentre < 0 && el.scrollLeft === 0
          ? 'start'
          : offCentre > 0 && el.scrollLeft >= max - 1
            ? 'end'
            : `${Math.round(offCentre)} px off centre at ${el.scrollLeft} of ${max}`
    // A gradient's transparent stop computes to rgba(0, 0, 0, 0): one per faded side.
    const mask = getComputedStyle(el).maskImage
    const clear = mask.split('rgba(0, 0, 0, 0)').length - 1
    const faded =
      clear === 0 ? 'none' : clear === 2 ? 'both' : mask.includes('to left') ? 'end' : 'start'
    return { rest, faded }
  }, current)
}

/**
 * Every label in a row that is cut: an item reaching past the row's start or
 * end edge on a side the row does not fade, or a word inside it that its own
 * box clips (an ellipsis). Empty when every word stands whole or fades out.
 */
export function cutLabels(row: Locator, items: string): Promise<string[]> {
  return row.evaluate((el, selector) => {
    const box = el.getBoundingClientRect()
    const mask = getComputedStyle(el).maskImage
    const clear = mask.split('rgba(0, 0, 0, 0)').length - 1
    const fadesStart = clear === 2 || (clear === 1 && !mask.includes('to left'))
    const fadesEnd = clear === 2 || (clear === 1 && mask.includes('to left'))
    const cut: string[] = []
    for (const item of el.querySelectorAll<HTMLElement>(selector)) {
      const word = item.textContent?.trim() ?? ''
      const r = item.getBoundingClientRect()
      if (r.left < box.left - 0.5 && !fadesStart) cut.push(`${word} (start edge)`)
      if (r.right > box.right + 0.5 && !fadesEnd) cut.push(`${word} (end edge)`)
      for (const part of [item, ...item.querySelectorAll<HTMLElement>('*')]) {
        if (
          part.scrollWidth > part.clientWidth + 0.5 &&
          getComputedStyle(part).overflowX !== 'visible'
        ) {
          cut.push(`${word} (clipped in its box)`)
          break
        }
      }
    }
    return cut
  }, items)
}

/**
 * Every word in the matched labels that breaks across two lines or runs past
 * its label's box. A word is what lies between spaces and zero-width spaces —
 * the label's own break opportunities — so *Znüni/Zvieri* on two lines at its
 * slash is whole, *MORGE/N* is not. Empty when every word stands whole.
 */
export function brokenWords(labels: Locator): Promise<string[]> {
  return labels.evaluateAll((els) => {
    const broken: string[] = []
    for (const el of els) {
      const box = el.getBoundingClientRect()
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent ?? ''
        for (const match of text.matchAll(/[^\s​]+/g)) {
          const range = document.createRange()
          range.setStart(node, match.index)
          range.setEnd(node, match.index + match[0].length)
          const rects = [...range.getClientRects()].filter((r) => r.width > 0)
          const lines = new Set(rects.map((r) => Math.round(r.top)))
          const right = Math.max(...rects.map((r) => r.right))
          if (lines.size > 1) broken.push(`${match[0]} (split over ${lines.size} lines)`)
          else if (right > box.right + 0.5) broken.push(`${match[0]} (past its box)`)
        }
      }
    }
    return broken
  })
}
