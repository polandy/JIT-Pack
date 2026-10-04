// @vitest-environment jsdom
/**
 * The token's expiry, as the person set it (FR-23 API tokens): in the app's
 * language and the device's region (NFR-4.12) — the specs run in Zurich, so
 * an English sheet writes the day before the month.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { setLocale } from '@/i18n'
import ApiTokenSheet from '../ApiTokenSheet.vue'

function mountSheet(expiresAt: string) {
  return mount(ApiTokenSheet, {
    props: { open: true, token: 'jp_secret', expiresAt },
    global: { stubs: { SheetModal: { template: '<div><slot /></div>' } } },
  })
}

describe('ApiTokenSheet — the expiry', () => {
  it('names the day in the device’s region, not the language’s', () => {
    setLocale('en')
    expect(mountSheet('2026-10-04T12:00:00Z').text()).toContain('Expires 4 Oct 2026.')
  })

  it('says a token without an expiry never expires', () => {
    setLocale('en')
    expect(mountSheet('').text()).toContain('It does not expire.')
  })
})
