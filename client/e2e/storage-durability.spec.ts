import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

/**
 * NFR-4.11 — the app asks the browser to keep its storage, and says so when
 * the answer is no (E2E-NFR-03).
 *
 * Local Mode is the whole scope of the requirement, and the reason is that
 * there is no server copy: an eviction there is the data, not a cache. The
 * three *rendered* states of the storage block are unit-covered
 * (`SyncDetailSheet.spec.ts`); what nothing asserted is the half the sheet
 * cannot show — that `navigator.storage.persist()` is called at all. It is
 * reached from one line in the orchestrator's Local Mode boot, so a refactor
 * that moves the boot loses the request with no screen changing.
 *
 * The Storage API is replaced rather than driven, because a browser's real
 * answer is a policy decision (Chromium grants or refuses by engagement
 * heuristics) and a case that reads it would assert whatever the profile
 * happened to be. Replacing it makes both branches reachable and neither of
 * them a race.
 */

interface StorageStub {
  granted: boolean
}

/** Install a Storage API whose answer is decided here, and count the asks. */
async function stubStorage(page: Page, { granted }: StorageStub) {
  await page.addInitScript((persisted: boolean) => {
    const counter = window as unknown as { __persistAsks: number }
    counter.__persistAsks = 0
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        persisted: () => Promise.resolve(persisted),
        persist: () => {
          counter.__persistAsks += 1
          return Promise.resolve(persisted)
        },
        estimate: () => Promise.resolve({ usage: 12_000_000, quota: 980_000_000 }),
      },
    })
  }, granted)
}

const asksSeen = (page: Page) =>
  page.evaluate(() => (window as unknown as { __persistAsks: number }).__persistAsks)

async function openStorageDetail(page: Page) {
  await page.goto('/tabs/dashboard')
  await page.getByTestId('sync-indicator').click()
  await expect(page.getByTestId('sync-detail-sheet')).toBeVisible()
  await expect(page.getByTestId('sync-detail-storage')).toBeVisible()
}

test.describe('storage durability (NFR-4.11)', () => {
  test('E2E-NFR-03: a refused request is asked for, and warned about', async ({
    page,
    seedMode,
  }) => {
    await stubStorage(page, { granted: false })
    await seedMode({ mode: 'local' })
    await openStorageDetail(page)

    // The requirement's first clause: the browser was *asked*. Asserted on a
    // counter the stub keeps, because a refusal looks the same on screen
    // whether the app asked and lost or never asked at all.
    expect(await asksSeen(page)).toBeGreaterThan(0)

    // …and its second: the refusal is visible and non-blocking. The sheet is
    // open around it, so this is a line on a screen the user can keep using.
    await expect(page.getByTestId('sync-detail-eviction')).toBeVisible()
    await expect(page.getByTestId('sync-detail-persistent')).toHaveCount(0)
  })

  test('E2E-NFR-03b: a granted origin is told so, and not asked twice', async ({
    page,
    seedMode,
  }) => {
    await stubStorage(page, { granted: true })
    await seedMode({ mode: 'local' })
    await openStorageDetail(page)

    // The positive half of the pair, and the reason the warning above means
    // something: the same screen, the same stub, one different answer.
    await expect(page.getByTestId('sync-detail-persistent')).toBeVisible()
    await expect(page.getByTestId('sync-detail-eviction')).toHaveCount(0)

    // An origin that already has persistence is not asked again — the guard
    // in `requestDurability`, and the one branch of it a screen never shows.
    expect(await asksSeen(page)).toBe(0)
  })
})
