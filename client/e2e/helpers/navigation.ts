import type { Page } from '@playwright/test'

/**
 * The page's own `goto`/`reload`, before the fixture wrapped them to wait for
 * the device's writes (see `fixtures.ts`).
 *
 * A `WeakMap` rather than a property on the page: the wrapper is the rule, and
 * a rule with a public back door on the object it guards is an invitation. The
 * one way past it is `navigateWhileWriting` below, which a case has to name.
 */
export const unwrappedNavigation = new WeakMap<
  Page,
  { goto: Page['goto']; reload: Page['reload'] }
>()

/**
 * Navigate **without** waiting for the outbox — for a case whose subject is
 * what happens to a write that a reload interrupts.
 *
 * There is no such case today, and that is the point of the function existing
 * here rather than as an option on the wrapper: if one is written, it says so
 * in one word at the call site, and every other navigation keeps the guarantee.
 */
export async function navigateWhileWriting(page: Page, url?: string): Promise<void> {
  const original = unwrappedNavigation.get(page)
  if (!original) {
    throw new Error('navigateWhileWriting: this page did not come from the test fixture')
  }
  if (url === undefined) await original.reload()
  else await original.goto(url)
}
