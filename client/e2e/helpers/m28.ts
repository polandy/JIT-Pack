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
  await detail
    .getByTestId('idea-picture-file')
    .setInputFiles({ name, mimeType: 'image/png', buffer })
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

/** A GPX file through the given points — latitude, longitude, height or none. */
export function gpxFile(
  points: readonly (readonly [number, number, number?])[],
  options: { name?: string; type?: string } = {},
): string {
  const head = [
    options.name ? `<name>${options.name}</name>` : '',
    options.type ? `<type>${options.type}</type>` : '',
  ].join('')
  const pts = points
    .map(([lat, lon, ele]) =>
      ele === undefined
        ? `<trkpt lat="${lat}" lon="${lon}"/>`
        : `<trkpt lat="${lat}" lon="${lon}"><ele>${ele}</ele></trkpt>`,
    )
    .join('')
  return `<?xml version="1.0"?><gpx version="1.1"><trk>${head}<trkseg>${pts}</trkseg></trk></gpx>`
}

/**
 * Add a GPX track through the open idea's hidden file input; ends once the
 * idea counts one more track — the positive signal that it was read and
 * written.
 */
export async function addTrack(detail: Locator, name: string, gpx: string): Promise<void> {
  const count = detail.getByTestId('idea-track-count')
  const before =
    (await count.count()) === 0 ? 0 : Number((await count.textContent())!.split(' ')[0])
  await detail
    .getByTestId('idea-track-file')
    .setInputFiles({ name, mimeType: 'application/gpx+xml', buffer: Buffer.from(gpx) })
  await expect(detail.getByTestId('idea-track-count')).toHaveText(new RegExp(`^${before + 1} of`))
  await expect(detail.getByTestId('idea-track-add')).toBeEnabled()
}

/** The one-pixel picture every map tile is answered with. */
const TILE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

/** Where each map source's tiles come from (FR-29.17). */
const TILE_HOSTS = { swisstopo: 'wmts.geo.admin.ch', osm: 'tile.openstreetmap.org' } as const

/**
 * Answers swisstopo's and OpenStreetMap's tiles on the device itself, so no
 * case reaches the internet.
 */
export async function stubTiles(page: Page): Promise<void> {
  for (const host of Object.values(TILE_HOSTS)) {
    await page.route(`https://${host}/**`, (route) =>
      route.fulfill({ contentType: 'image/png', body: TILE_PNG }),
    )
  }
}

/**
 * A map's tiles from one source, as drawn. What a map shows rather than what
 * it asked for: a tile the browser already holds is drawn without a request.
 */
export function tilesFrom(map: Locator, source: keyof typeof TILE_HOSTS): Locator {
  return map.locator(`img.leaflet-tile[src*="${TILE_HOSTS[source]}"]`)
}

/** The full-screen map, which Ionic lifts out to the app root. */
export function trackViewer(page: Page): Locator {
  return page.getByTestId('track-viewer')
}

/**
 * Choose one of ⋮'s actions on a track card's chosen track, and wait for the
 * sheet to go — an action that opens a prompt or a file chooser would
 * otherwise race the sheet still leaving.
 */
export async function trackAction(
  card: Locator,
  action: 'rename' | 'download' | 'replace' | 'remove',
): Promise<void> {
  const page = card.page()
  await card.getByTestId('track-more').click()
  const sheet = page.locator('ion-action-sheet')
  await expect(sheet).toBeVisible()
  await sheet.getByTestId(`track-${action}`).click()
  await expect(sheet).toHaveCount(0)
}
