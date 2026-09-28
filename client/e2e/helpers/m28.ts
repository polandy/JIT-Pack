import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'

import { fillIonic } from './ionic'
import { itemDetail, visiblePage } from './page'
import { openTripView } from './trips'

/**
 * M28 — the trip's ideas (§3.29), the planner module's board. The one
 * idea's detail is a sheet on a phone and the frame's side panel on a
 * desktop, so it is reached through `itemDetail`'s two scopes.
 */

/** The board, on the page the outlet shows. */
export function ideasBoard(page: Page): Locator {
  return visiblePage(page).getByTestId('m28-page')
}

/** One idea's card, by its title. */
export function ideaCard(page: Page, title: string): Locator {
  return ideasBoard(page)
    .locator('[data-testid^="idea-card-"][data-state]')
    .filter({ hasText: title })
}

/** The open idea, wherever the width put it. */
export function ideaDetail(page: Page): Locator {
  return itemDetail(page).getByTestId('idea-detail')
}

/** What the add sheet is asked to write. */
export interface NewIdea {
  title: string
  link?: string
  note?: string
  /** The tag chip's words, as the sheet shows them. */
  tag?: string
  rainProof?: boolean
}

/** Reach the board through the switcher, from any of the trip's views. */
export async function openIdeas(page: Page): Promise<Locator> {
  await openTripView(page, 'ideas')
  const board = ideasBoard(page)
  await expect(board.getByTestId('m28-segments')).toBeVisible()
  return board
}

/** Write an idea through the ＋ and its sheet; ends with the card on the board. */
export async function addIdea(page: Page, idea: NewIdea): Promise<void> {
  await ideasBoard(page).getByTestId('m28-fab').click()
  const sheet = page.getByTestId('idea-edit')
  await fillIonic(sheet.getByTestId('idea-edit-name'), idea.title)
  if (idea.link) await fillIonic(sheet.getByTestId('idea-edit-link'), idea.link)
  if (idea.note) {
    const note = sheet.getByTestId('idea-edit-note').locator('textarea')
    await note.fill(idea.note)
  }
  if (idea.tag) await sheet.getByRole('button', { name: idea.tag, exact: true }).click()
  if (idea.rainProof) await sheet.getByTestId('idea-edit-rain').click()
  await sheet.getByTestId('idea-edit-save').click()
  await expect(sheet.getByTestId('idea-edit-save')).toHaveCount(0)
  await expect(ideaCard(page, idea.title)).toBeVisible()
}

/** Open an idea from its card; ends with its detail on screen. */
export async function openIdea(page: Page, title: string): Promise<Locator> {
  await ideaCard(page, title).click()
  const detail = ideaDetail(page)
  await expect(detail.getByTestId('idea-detail-title')).toHaveText(title)
  return detail
}

/** Switch the board to one of its four segments. */
export async function showSegment(
  page: Page,
  state: 'idea' | 'shortlisted' | 'done' | 'dropped',
): Promise<void> {
  const button = ideasBoard(page).getByTestId(`m28-segment-${state}`)
  await button.click()
  await expect(button).toHaveClass(/segment-button-checked/)
}

/** The open idea's mosaic tile at `index`, its picture inside. */
export function mosaicPicture(detail: Locator, index: number): Locator {
  return detail.getByTestId(`idea-mosaic-tile-${index}`).locator('img')
}

/** Add a picture through the open idea's hidden file input. */
export async function addPicture(detail: Locator, name: string, buffer: Buffer): Promise<void> {
  const before = await detail.locator('[data-testid^="idea-mosaic-tile-"]').count()
  await detail.getByTestId('idea-picture-file').setInputFiles({ name, mimeType: 'image/png', buffer })
  // The add control waits out the upload; the new tile is the positive signal.
  await expect(detail.locator('[data-testid^="idea-mosaic-tile-"]')).toHaveCount(
    Math.min(before + 1, 3),
  )
  await expect(detail.getByTestId('idea-picture-add')).toBeEnabled()
}

/** The full-screen picture viewer, which Ionic lifts out to the app root. */
export function pictureViewer(page: Page): Locator {
  return page.getByTestId('idea-viewer')
}
