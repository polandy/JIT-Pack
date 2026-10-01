import { test, expect, createTripViaWizard } from '../fixtures'
import {
  addIdea,
  addTrack,
  dragHandle,
  gpxFile,
  openIdea,
  openIdeas,
  routeEditor,
  routeSettled,
  stubRouting,
  stubTiles,
  tapBetween,
  tapMap,
  trackAction,
  trackViewer,
} from '../helpers/m28'

/**
 * M28 — editing a track's route and drawing one (UI-Test-Spec §28,
 * FR-29.19, ADR-087). Local Mode: the device asks the router itself in every
 * mode, and here the file is kept on it too.
 *
 * BRouter and swisstopo's heights are answered on the device
 * (`stubRouting`), like the tiles (`stubTiles`), so no case reaches the
 * internet; what they were asked is the signal a leg was fetched.
 */

const TRIP = { name: 'Oberland Routen', endDate: '2026-12-31', travelers: ['Andy'] }

/** 3.3 km due north, 300 m up — four points, so four handles. */
const CLIMB = gpxFile(
  [
    [46.5, 7.7, 1000],
    [46.51, 7.7, 1100],
    [46.52, 7.7, 1200],
    [46.53, 7.7, 1300],
  ],
  { name: 'Aufstieg zur Alp' },
)

/** Up 2.2 km and back down the same way: every point between is passed twice. */
const OUT_AND_BACK = gpxFile(
  [
    [46.5, 7.7, 1000],
    [46.51, 7.7, 1100],
    [46.52, 7.7, 1200],
    [46.51, 7.7, 1100],
    [46.5, 7.7, 1000],
  ],
  { name: 'Hin und zurück' },
)

test.describe('M28 route editing @local @planner', () => {
  test.beforeEach(async ({ seedMode, page }) => {
    await seedMode({ mode: 'local' })
    await stubTiles(page)
    await createTripViaWizard(page, TRIP)
  })

  /**
   * E2E-M28-16: a track's route is edited from ⋮ — the file's line kept
   * with its figures until a handle moves; the two stretches beside it are
   * found along paths, drawn in their own colour over the original's
   * dotted line, and the figures say what changed. Saved as a new track it
   * stands beside the original with its *Mit Kind* and pauses. Arrows show
   * the direction on the card's map and in the editor.
   */
  test('E2E-M28-16: a moved point re-routes its stretches, shows the change, and saves as a variant', async ({
    page,
  }) => {
    const asked = await stubRouting(page)
    await openIdeas(page)
    await addIdea(page, { title: 'Alp' })
    const detail = await openIdea(page, 'Alp')
    await addTrack(detail, 'aufstieg.gpx', CLIMB)
    const card = detail.getByTestId('track-card')
    await expect(card.getByTestId('track-map').locator('.jp-route-arrow')).not.toHaveCount(0)
    await card.getByTestId('track-kid').click()
    await card.getByTestId('track-pause-more').click()
    await expect(card.getByTestId('track-pause')).toHaveText('0 h 15')

    await trackAction(card, 'edit')
    const editor = routeEditor(page)
    await routeSettled(editor, 4)
    await expect(editor.getByTestId('route-distance')).toHaveText('3.3 km')
    await expect(editor.getByTestId('route-ascent')).toHaveText('↑ 300 m')
    await expect(editor.getByTestId('route-before')).toHaveText('Before 3.3 km · 2 h 05')
    await expect(editor.getByTestId('route-legend')).toHaveCount(0)
    await expect(editor.getByTestId('route-done')).toBeDisabled()
    await expect(editor.getByTestId('route-map').locator('.jp-route-arrow')).not.toHaveCount(0)
    expect(asked.paths).toHaveLength(0)

    await dragHandle(editor, 1, 80, 0)
    await routeSettled(editor, 4)
    expect(asked.paths.map((path) => path.profile)).toEqual(['hiking-mountain', 'hiking-mountain'])
    await expect(editor.getByTestId('route-legend')).toBeVisible()
    await expect(
      editor.getByTestId('route-map').locator('.jp-route-leg.jp-track-alpenrose'),
    ).toHaveCount(2)
    await expect(editor.getByTestId('route-map').locator('.jp-route-original')).toHaveCount(1)
    await expect(editor.getByTestId('route-distance')).not.toHaveText('3.3 km')
    await expect(editor.getByTestId('route-delta')).toHaveText(/^\+\d/)

    await editor.getByTestId('route-done').click()
    const save = editor.getByTestId('route-save')
    await expect(save.getByTestId('route-save-name')).toHaveValue('Aufstieg zur Alp (variant)')
    await save.getByTestId('route-save-new').click()
    await expect(editor).toBeHidden()

    await expect(card.locator('[data-testid^="track-tab-"]')).toHaveText([
      'Aufstieg zur Alp',
      'Aufstieg zur Alp (variant)',
    ])
    await expect(detail.getByTestId('idea-track-count')).toHaveText('2 of 5')
    await expect(card.getByTestId('track-file')).toHaveText(/^aufstieg-zur-alp-variant\.gpx · /)
    await expect(card.getByTestId('track-kid')).toHaveAttribute('aria-pressed', 'true')
    await expect(card.getByTestId('track-pause')).toHaveText('0 h 15')
  })

  /**
   * E2E-M28-17: where the route runs twice, a tap on the line asks which
   * pass the new point splits — *Hinweg* or *Rückweg*, each with how far
   * along it lies — and a split changes no figure. *Hier enden* shortens
   * the route there. Replacing the original keeps its name and settings,
   * and the toast's undo puts the old file back.
   */
  test('E2E-M28-17: a tap on a doubled path asks for the pass, a point ends the route, and a replacement undoes', async ({
    page,
  }) => {
    await stubRouting(page)
    await openIdeas(page)
    await addIdea(page, { title: 'Hin und zurück' })
    const detail = await openIdea(page, 'Hin und zurück')
    await addTrack(detail, 'hin-und-zurueck.gpx', OUT_AND_BACK)
    const card = detail.getByTestId('track-card')
    await expect(card.getByTestId('track-distance')).toHaveText('4.4 km')

    await trackAction(card, 'edit')
    const editor = routeEditor(page)
    await routeSettled(editor, 5)

    await tapBetween(editor, 0, 1)
    const passes = editor.getByTestId('route-passes')
    await expect(passes.getByTestId('route-pass-0')).toHaveText(/Way out\s*at 0\.6 km/)
    await expect(passes.getByTestId('route-pass-1')).toHaveText(/Way back\s*at 3\.\d km/)
    await passes.getByTestId('route-pass-1').click()
    await expect(passes).toHaveCount(0)
    await routeSettled(editor, 6)
    await expect(editor.getByTestId('route-point')).toHaveText(/Point 5\s*· at 3\.\d km/)
    await expect(editor.getByTestId('route-distance')).toHaveText('4.4 km')

    await editor.getByTestId('route-end-here').click()
    await routeSettled(editor, 5)
    await expect(editor.getByTestId('route-distance')).toHaveText(/^3\.\d km$/)
    await expect(editor.getByTestId('route-delta')).toHaveText(/^−0\.\d km/)

    await editor.getByTestId('route-done').click()
    await editor.getByTestId('route-save-replace').click()
    await expect(editor).toBeHidden()
    await expect(card.getByTestId('track-distance')).toHaveText(/^3\.\d km$/)
    await expect(card.locator('[data-testid^="track-tab-"]')).toHaveText('Hin und zurück')
    await expect(card.getByTestId('track-file')).toHaveText(/^hin-und-zuruck\.gpx · /)

    await page.locator('ion-toast').getByRole('button', { name: 'Undo' }).click()
    await expect(card.getByTestId('track-distance')).toHaveText('4.4 km')
    await expect(card.getByTestId('track-file')).toHaveText('hin-und-zurueck.gpx · 5 points')
  })

  /**
   * E2E-M28-18: a route is drawn from nothing. The first tap sets the
   * start, the next is reached along paths — asked for the kind chosen —
   * or, with *Luftlinie*, straight with swisstopo's heights. Undo and redo
   * step through it, leaving asks first, and saving adds a track of that
   * kind.
   */
  test('E2E-M28-18: a route drawn from nothing follows paths for its kind, undoes, and saves as a track', async ({
    page,
  }) => {
    const asked = await stubRouting(page)
    await openIdeas(page)
    await addIdea(page, { title: 'Velotour' })
    const detail = await openIdea(page, 'Velotour')
    await detail.getByTestId('idea-track-draw').click()
    const editor = routeEditor(page)
    await expect(editor.getByTestId('route-hint')).toHaveText('Tap the starting point.')
    await expect(editor.getByTestId('route-done')).toBeDisabled()

    await editor.getByTestId('route-kind-bike').click()
    await tapMap(editor, 0.3, 0.3)
    await routeSettled(editor, 1)
    await tapMap(editor, 0.6, 0.5)
    await routeSettled(editor, 2)
    expect(asked.paths.map((path) => path.profile)).toEqual(['trekking'])
    await expect(editor.getByTestId('route-ascent')).toHaveText('↑ 150 m')
    await expect(editor.getByTestId('route-descent')).toHaveText('↓ 50 m')

    await editor.getByTestId('route-follow-line').click()
    await tapMap(editor, 0.4, 0.7)
    await routeSettled(editor, 3)
    expect(asked.heights).toBe(1)
    expect(asked.paths).toHaveLength(1)

    await editor.getByTestId('route-undo').click()
    await routeSettled(editor, 2)
    await editor.getByTestId('route-redo').click()
    await routeSettled(editor, 3)
    expect(asked.heights).toBe(1)

    await editor.getByTestId('route-cancel').click()
    const confirm = page.getByTestId('route-discard-confirm')
    await confirm.getByRole('button', { name: 'Cancel' }).click()
    await expect(confirm).toHaveCount(0)
    await routeSettled(editor, 3)

    await editor.getByTestId('route-done').click()
    const save = editor.getByTestId('route-save')
    await expect(save.getByTestId('route-save-replace')).toHaveCount(0)
    await expect(save.getByTestId('route-save-name')).toHaveValue('Bike tour')
    await save.getByTestId('route-save-new').click()
    await expect(editor).toBeHidden()

    const card = detail.getByTestId('track-card')
    await expect(card.locator('[data-testid^="track-tab-"]')).toHaveText('Bike tour')
    await expect(card.getByTestId('track-kind-bike')).toHaveAttribute('aria-pressed', 'true')
    await expect(card.getByTestId('track-ascent')).not.toHaveText('–')
  })

  /**
   * E2E-M28-19: without a map no point can be set — offline, *Route
   * zeichnen*, ⋮'s *Route bearbeiten* and the full-screen map's
   * *Bearbeiten* are off, and back online they are on again. Leaving an
   * edited route asks first, and discarding keeps the track as it was.
   */
  test('E2E-M28-19: editing waits for the map, and leaving an edit asks first', async ({
    page,
    context,
  }) => {
    await stubRouting(page)
    await openIdeas(page)
    await addIdea(page, { title: 'Offline' })
    const detail = await openIdea(page, 'Offline')
    await addTrack(detail, 'aufstieg.gpx', CLIMB)
    const card = detail.getByTestId('track-card')

    await context.setOffline(true)
    await expect(card.getByTestId('track-map')).toHaveAttribute('data-tiles', 'offline')
    await expect(detail.getByTestId('idea-track-draw')).toHaveAttribute('aria-disabled', 'true')
    await card.getByTestId('track-more').click()
    const sheet = page.locator('ion-action-sheet')
    await expect(sheet.getByTestId('track-edit')).toBeDisabled()
    await sheet.getByRole('button', { name: 'Cancel' }).click()
    await expect(sheet).toHaveCount(0)
    await card.getByTestId('track-map-open').click()
    await expect(trackViewer(page).getByTestId('track-viewer-edit')).toBeDisabled()

    await context.setOffline(false)
    await expect(trackViewer(page).getByTestId('track-viewer-edit')).toBeEnabled()
    await trackViewer(page).getByTestId('track-viewer-edit').click()
    await expect(trackViewer(page)).toBeHidden()
    const editor = routeEditor(page)
    await routeSettled(editor, 4)

    await editor.getByTestId('route-reverse').click()
    await routeSettled(editor, 4)
    await editor.getByTestId('route-cancel').click()
    const confirm = page.getByTestId('route-discard-confirm')
    await confirm.getByRole('button', { name: 'Discard' }).click()
    await expect(editor).toBeHidden()
    await expect(card.locator('[data-testid^="track-tab-"]')).toHaveText('Aufstieg zur Alp')
    await expect(detail.getByTestId('idea-track-draw')).not.toHaveAttribute('aria-disabled', 'true')
  })
})
