import { expect, type Locator, type Page } from '@playwright/test'

import { visiblePage } from './page'

/** The two screens whose composer is `ListComposer` (FR-21.24). */
export type ComposerScreen = 'm6' | 'm25'

const COMPOSER: Record<ComposerScreen, { composer: string; fab: string }> = {
  m6: { composer: 'm6-composer', fab: 'm6-fab' },
  m25: { composer: 'm25-composer', fab: 'm25-fab' },
}

/**
 * The screen has its rows: M6 says *loading* until they are there, and M25
 * draws its phase sections only then. Until this holds, an empty-looking list
 * may still be about to open the composer by itself.
 */
async function settled(page: Page, screen: ComposerScreen): Promise<void> {
  const live = visiblePage(page)
  if (screen === 'm6') {
    const { composer, fab } = COMPOSER.m6
    // The FAB stays mounted while the composer is open (hidden, an anchor for
    // the toasts), so both match then; the composer comes first.
    await expect(live.getByTestId(composer).or(live.getByTestId(fab)).first()).toBeVisible()
    await expect(live.getByTestId('m6-list-loading')).toHaveCount(0)
    return
  }
  await expect(
    live.getByTestId('m25-before').or(live.getByTestId('m25-during')).first(),
  ).toBeVisible()
}

/**
 * FR-21.24: M6's and M25's composer stands behind the ＋ FAB, and is open at
 * rest only on a list with nothing on it. Opens it through the FAB where it is
 * closed — for a caller whose subject is what the composer writes, not
 * whether it was open. The door itself is E2E-M6-43's and E2E-M25-21's.
 */
export async function openListComposer(page: Page, screen: ComposerScreen): Promise<Locator> {
  const live = visiblePage(page)
  const composer = live.getByTestId(COMPOSER[screen].composer)
  await settled(page, screen)
  if (!(await composer.isVisible())) await live.getByTestId(COMPOSER[screen].fab).click()
  await expect(composer).toBeVisible()
  return composer
}
