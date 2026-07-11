import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/**
 * Shared E2E fixtures for JIT-Pack (docs/UI_Test_Spec_v1.0.md §2.4).
 *
 * Run modes are selected by seeding the same localStorage keys the app
 * itself writes (see src/config.ts, src/App.vue) *before* the first
 * navigation, via `addInitScript`. Playwright gives each test an
 * isolated browser context, so there is no storage bleed between tests
 * and no manual clearing is needed.
 *
 * Backend-backed helpers (starting jitpackd, a mock IdP, seeding
 * OIDC tokens for the `server` multi-client cases) will extend this
 * file in later milestones; the scaffold ships only the backend-free
 * seeding used by the smoke path.
 */

export type Mode = 'local' | 'server'

export interface SeedOptions {
  /** Persisted `jitpack_mode`. Omit to leave first-launch (M19) showing. */
  mode?: Mode
  /** `jitpack_server_url` for Server / Single-User mode. */
  serverUrl?: string
  /** Device-local theme preference (`jitpack_theme`). */
  theme?: 'dark' | 'light'
}

/** Seed the app's localStorage before it boots. Call before `page.goto`. */
export async function seed(page: Page, opts: SeedOptions): Promise<void> {
  await page.addInitScript((o: SeedOptions) => {
    if (o.mode) localStorage.setItem('jitpack_mode', o.mode)
    if (o.serverUrl) localStorage.setItem('jitpack_server_url', o.serverUrl)
    if (o.theme) localStorage.setItem('jitpack_theme', o.theme)
  }, opts)
}

interface Fixtures {
  /** Seed run-mode localStorage for the current test's page. */
  seedMode: (opts: SeedOptions) => Promise<void>
}

export const test = base.extend<Fixtures>({
  seedMode: async ({ page }, use) => {
    await use((opts: SeedOptions) => seed(page, opts))
  },
})

export { expect }
