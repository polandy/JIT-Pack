// @vitest-environment jsdom
/**
 * FR-5.10: the closed packing's stamp — when it was closed — in the device's
 * region (NFR-4.12): an English card in Zurich keeps the 24-hour clock. The
 * clock is set, never the real one.
 */
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'

import { setLocale } from '@/i18n'
import PackingClosedCard from '../PackingClosedCard.vue'

const NOW = new Date(2026, 9, 4, 18, 0).getTime()

beforeEach(() => setLocale('en'))

describe('PackingClosedCard — the stamp', () => {
  it('says when the packing was closed, in the region’s clock', () => {
    const wrapper = mount(PackingClosedCard, {
      props: { at: '2026-10-04T14:32:00', skipped: 0, now: NOW },
    })
    expect(wrapper.get('[data-testid="m4-packing-closed-stamp"]').text()).toContain('today 14:32')
  })
})
