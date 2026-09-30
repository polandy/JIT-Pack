import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

/**
 * Lifts a row by its grip and lets it go in the gap above or below another
 * row (FR-30.13, FR-7.17) — the gap flips at a row's midpoint, so a quarter
 * of the way in is unambiguously the one asked for. `host` is the element
 * carrying `data-drag`: the case waits for `idle`, which the gesture reaches
 * only once the write has resolved.
 */
export async function dropBeside(
  page: Page,
  host: Locator,
  grip: Locator,
  row: Locator,
  where: 'above' | 'below',
): Promise<void> {
  // `hover` waits for the grip to stand still: a page still sliding in hands
  // back a box the pointer then misses.
  await grip.hover()
  const g = (await grip.boundingBox())!
  const r = (await row.boundingBox())!
  const y = where === 'above' ? r.y + r.height / 4 : r.y + (r.height * 3) / 4
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
  await page.mouse.down()
  await expect(host).toHaveAttribute('data-drag', 'dragging')
  await page.mouse.move(r.x + r.width / 2, y, { steps: 8 })
  // The insert line says where it will land before it lands.
  await expect(row).toHaveAttribute('data-drop-gap', where === 'above' ? 'before' : 'after')
  await page.mouse.up()
  await expect(host).toHaveAttribute('data-drag', 'idle')
}
