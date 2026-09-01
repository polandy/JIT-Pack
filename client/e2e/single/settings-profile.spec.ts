import { test, expect, visiblePage } from '../fixtures'
import { bootPage, uniq } from '../serverMode'

/**
 * E2E-M17-04 (FR-17.13): the editable Single-User profile, driven against a
 * real jitpackd so the round trip proves the server accepts the same names
 * the client does.
 *
 * The rule this pins down is the 2026-08-26 revision: 1–50 printable
 * characters, no leading or trailing whitespace. The old `[A-Za-z0-9._-]`
 * charset rejected the server's own seeded default ("Demo User") and every
 * human name with a space or a diacritic — the untouched screen opened with
 * a standing red error (UX review 2026-08-25, UX-3).
 */
test('E2E-M17-04: a human display name is accepted, and the rule only speaks when touched', async ({
  browser,
}) => {
  const context = await browser.newContext()
  const page = await bootPage(context, '/tabs/settings')
  const screen = visiblePage(page)

  // Untouched, the field carries whatever the server handed out and the
  // rule note stays silent — whatever that name looks like.
  const input = screen.getByTestId('settings-name-input')
  await expect(input).toBeVisible()
  await expect(screen.getByTestId('settings-name-rule')).toHaveCount(0)

  // FR-23.4a: this account never uploaded a picture, and the avatar
  // endpoint answers 404 for such an account — which used to leave a 64 px
  // hole here, with the placeholder written for the case sitting behind a
  // condition that is never false. The circle carries initials and no
  // `<img>`. Asserted on *this* screen and not only on M20, because the
  // same defect was written into two templates.
  const face = screen.getByTestId('user-avatar')
  await expect(face).toBeVisible()
  await expect(face.getByTestId('user-avatar-picture')).toHaveCount(0)

  // Emptying the field is the first touch, and only now the rule speaks.
  await input.locator('input').fill('')
  await expect(screen.getByTestId('settings-name-rule')).toBeVisible()

  // A name with a space and a diacritic — the shape the old rule refused —
  // saves, and the server keeps it across a reload.
  const name = `Béatrice Müller ${uniq()}`
  await input.locator('input').fill(name)
  await expect(screen.getByTestId('settings-name-rule')).toHaveCount(0)
  await screen.getByTestId('settings-name-save').click()

  await page.reload()
  await expect(
    visiblePage(page).getByTestId('settings-name-input').locator('input'),
  ).toHaveValue(name)
  // …and the circle is initialled from that name, so the two halves of the
  // profile cannot drift apart.
  await expect(visiblePage(page).getByTestId('user-avatar')).toHaveText('BM')

  await context.close()
})

/**
 * E2E-M17-12 (FR-17.13): the picked photo is positioned on the crop stage and
 * saved as the profile picture.
 *
 * The entry stood open with a reason that was wrong in both halves: that no
 * Playwright project can drive a modal behind a file dialog, and that the
 * canvas offers nothing settled to assert against. `setInputFiles` fills a
 * hidden `<input type=file>` with no dialog at all, and the upload's own
 * result — the picture on the profile row, where there had been initials — is
 * as settled a signal as any. The component spec's header carries the same
 * wrong premise; both are corrected with this case.
 *
 * It is also the only layer that can see the defect it was written against
 * (owner report 2026-09-01): Ionic's global reset caps every `img` at
 * `max-width: 100%`, so the stage clamped the picture to its own 260 px while
 * `sourceRect()` went on cropping at the real scale — zooming moved the photo
 * instead of scaling it, and what was saved was not what was shown. Both the
 * geometry unit and the component spec stayed green throughout: the latter
 * asserts the inline `width: 520px` that the browser then refused to apply
 * (invariant 9b — only a rendered pixel says).
 */
const SOURCE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAIAAAA8r+mnAAAAQklEQVR4nBXLQRHAMBDDQEE5KIYSKIJyUAwlUNrouTMCHAweFBeLFyFOTDzRuLHxRtB54vG1Wr3/TJ2aevpsa+utH/m+KgHg2F2DAAAAAElFTkSuQmCC'

/** The stage is 260 CSS pixels square, and the output 256 (AvatarCropModal). */
const STAGE = 260
const OUTPUT = 256

/** What the browser paints, and what the crop math believes it painted — the
 * two numbers whose disagreement is the defect. */
async function stage(page: import('@playwright/test').Page) {
  return page.getByTestId('avatar-crop-image').evaluate((el) => ({
    painted: el.getBoundingClientRect().width,
    intended: parseFloat((el as HTMLElement).style.width),
  }))
}

test('E2E-M17-12: the crop stage zooms, and it saves the scale it shows', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await bootPage(context, '/tabs/settings')
  const screen = visiblePage(page)

  // Before: initials, no picture — so the assertion at the end cannot pass on
  // a screen that had one all along.
  await expect(screen.getByTestId('user-avatar-picture')).toHaveCount(0)

  await screen.locator('input[type=file]').setInputFiles({
    name: 'source.png',
    mimeType: 'image/png',
    buffer: Buffer.from(SOURCE_PNG, 'base64'),
  })

  const image = page.getByTestId('avatar-crop-image')
  await expect(image).toBeVisible()

  // Cover scale places the 8x4 source at 520x260: the shorter edge fills the
  // stage and the longer one overhangs it. A letterboxed 260 here means the
  // picture never covered the circle it is being cropped through.
  const atRest = await stage(page)
  expect(atRest.painted).toBeCloseTo(520, 0)
  expect(atRest.painted).toBeGreaterThan(STAGE)

  // Drive the range by its knob's own keyboard interface — deterministic,
  // where a mouse drag would depend on where the track happens to be.
  const knob = page.getByTestId('avatar-crop-zoom').getByRole('slider')
  await knob.focus()
  for (let i = 0; i < 20; i++) await knob.press('ArrowRight')

  // Zooming in makes the picture bigger. Nothing else on this screen can:
  // panning moves it and leaves the width alone, which is exactly what the
  // defect made every zoom look like.
  const zoomed = await stage(page)
  expect(zoomed.painted).toBeGreaterThan(atRest.painted)

  // ...and the scale on screen is the scale `sourceRect()` crops with, so the
  // saved square is the visible circle rather than some other rectangle.
  expect(zoomed.painted).toBeCloseTo(zoomed.intended, 0)
  expect(atRest.painted).toBeCloseTo(atRest.intended, 0)

  await page.getByTestId('avatar-crop-confirm').click()

  // The profile row now carries the picture, and the server kept a 256x256
  // one — the size FR-17.13 names, read back off the endpoint that serves it.
  const picture = screen.getByTestId('user-avatar-picture')
  await expect(picture).toBeVisible()
  const saved = await picture.evaluate(
    (el) =>
      new Promise<{ width: number; height: number }>((resolve, reject) => {
        const probe = new Image()
        probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight })
        probe.onerror = () => reject(new Error('the avatar endpoint served nothing'))
        probe.src = (el as HTMLImageElement).src
      }),
  )
  expect(saved).toEqual({ width: OUTPUT, height: OUTPUT })

  await context.close()
})
