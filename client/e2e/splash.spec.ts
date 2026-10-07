import { expect, test } from './fixtures'
import { PATH } from './routes'
import {
  SPLASH_FLIGHT_AT_MS,
  SPLASH_LEAVE_MS,
  SPLASH_REDUCED_AT_MS,
  SPLASH_REDUCED_LEAVE_MS,
  SPLASH_TARGET_ATTR,
} from '../src/lib/splash'

/**
 * G-22 / FR-21.29 — the start animation.
 *
 * The greeting's phases run on timers, so the clock is paused before the
 * first navigation and every phase is reached by `runFor`: a case reads the
 * greeting at a moment it chose, never at whatever moment a loaded runner
 * happened to give it.
 */

const BOOT = new Date('2026-10-08T08:00:00+02:00')

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: BOOT })
  await page.clock.pauseAt(new Date(BOOT.getTime() + 1))
})

test.describe('G-22 start animation', () => {
  test('E2E-G22-01 a cold start packs the mark and lands it on the app bar logo', async ({
    page,
    seedMode,
  }) => {
    await seedMode({ mode: 'local', splash: true })
    await page.goto(PATH.dashboard)

    const splash = page.getByTestId('splash')
    const landing = page.getByTestId('header-logo').locator(`[${SPLASH_TARGET_ATTR}]`)
    await expect(splash).toHaveAttribute('data-phase', 'intro')
    // The app is already there underneath; only its logo waits for the flight.
    await expect(page.getByTestId('header-logo')).toBeAttached()
    await expect(landing).toBeHidden()

    await page.clock.runFor(SPLASH_FLIGHT_AT_MS)
    await expect(splash).toHaveAttribute('data-phase', 'flight')

    await page.clock.runFor(SPLASH_LEAVE_MS)
    await expect(splash).toHaveCount(0)
    await expect(landing).toBeVisible()
  })

  test('E2E-G22-02 a tap ends the greeting at once', async ({ page, seedMode }) => {
    await seedMode({ mode: 'local', splash: true })
    await page.goto(PATH.dashboard)

    const splash = page.getByTestId('splash')
    await expect(splash).toHaveAttribute('data-phase', 'intro')
    await splash.click()

    await expect(splash).toHaveCount(0)
    await expect(page.getByTestId('header-logo').locator(`[${SPLASH_TARGET_ATTR}]`)).toBeVisible()
  })

  test('E2E-G22-03 on the first launch it lands on M19’s mark', async ({ page, seedMode }) => {
    await seedMode({ splash: true })
    await page.goto('/')

    const splash = page.getByTestId('splash')
    await expect(splash).toHaveAttribute('data-phase', 'intro')
    await page.clock.runFor(SPLASH_FLIGHT_AT_MS)
    await expect(splash).toHaveAttribute('data-phase', 'flight')

    await page.clock.runFor(SPLASH_LEAVE_MS)
    await expect(splash).toHaveCount(0)
    await expect(
      page.getByTestId('mode-selection').locator(`[${SPLASH_TARGET_ATTR}]`),
    ).toBeVisible()
  })

  test('E2E-G22-04 a cold start into a drill-down has no logo to land on and fades', async ({
    page,
    seedMode,
  }) => {
    await seedMode({ mode: 'local', splash: true })
    await page.goto(PATH.settings)

    const splash = page.getByTestId('splash')
    await expect(splash).toHaveAttribute('data-phase', 'intro')
    await expect(page.getByTestId('settings-splash')).toBeAttached()

    await page.clock.runFor(SPLASH_FLIGHT_AT_MS)
    await expect(splash).toHaveAttribute('data-phase', 'fade')
    await page.clock.runFor(SPLASH_LEAVE_MS)
    await expect(splash).toHaveCount(0)
  })

  test('E2E-G22-05 switched off in M17, the next start opens straight into the app', async ({
    page,
    seedMode,
  }) => {
    await seedMode({ mode: 'local', splash: true })
    await page.goto(PATH.settings)
    await page.getByTestId('splash').click()

    const toggle = page.getByTestId('settings-splash')
    await expect(toggle).toHaveJSProperty('checked', true)
    await toggle.click()
    await expect(toggle).toHaveJSProperty('checked', false)

    // The next start is a new tab: a reload of this one is still the same start (E2E-G22-07).
    const next = await page.context().newPage()
    await next.goto(PATH.dashboard)
    // The greeting mounts with the app; once the app bar is there, so would it be.
    await expect(next.getByTestId('header-logo').locator(`[${SPLASH_TARGET_ATTR}]`)).toBeVisible()
    await expect(next.getByTestId('splash')).toHaveCount(0)
  })

  test('E2E-G22-07 a reload the app makes of itself does not greet again', async ({
    page,
    seedMode,
  }) => {
    await seedMode({ mode: 'local', splash: true })
    await page.goto(PATH.dashboard)
    await page.getByTestId('splash').click()
    await expect(page.getByTestId('splash')).toHaveCount(0)

    // As the M19 choice, the login round trip and an update do: same tab, same start.
    await page.reload()
    await expect(page.getByTestId('header-logo').locator(`[${SPLASH_TARGET_ATTR}]`)).toBeVisible()
    await expect(page.getByTestId('splash')).toHaveCount(0)
  })
})

test.describe('G-22 start animation under reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('E2E-G22-06 the mark stands still and the greeting fades, never flies', async ({
    page,
    seedMode,
  }) => {
    await seedMode({ mode: 'local', splash: true })
    await page.goto(PATH.dashboard)

    const splash = page.getByTestId('splash')
    await expect(splash).toHaveAttribute('data-phase', 'intro')
    // Nothing is in flight, so nothing has to stay hidden for it.
    await expect(page.getByTestId('header-logo').locator(`[${SPLASH_TARGET_ATTR}]`)).toBeVisible()

    await page.clock.runFor(SPLASH_REDUCED_AT_MS)
    await expect(splash).toHaveAttribute('data-phase', 'fade')
    await page.clock.runFor(SPLASH_REDUCED_LEAVE_MS)
    await expect(splash).toHaveCount(0)
  })
})
