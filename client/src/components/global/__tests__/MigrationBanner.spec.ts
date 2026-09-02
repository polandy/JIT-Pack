// @vitest-environment jsdom
/**
 * FR-19.8 — the bar that carries step three after the reload.
 *
 * Restore and skip are two different outcomes; a bar that wired them to the
 * same handler would fail here rather than on the first device that moved.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import MigrationBanner from '../MigrationBanner.vue'

function text(wrapper: ReturnType<typeof mount>, id: string): string {
  return wrapper.get(`[data-testid="${id}"]`).text()
}

describe('MigrationBanner', () => {
  it('says what is left to do and what the file is', () => {
    const wrapper = mount(MigrationBanner)

    expect(text(wrapper, 'migration-banner')).toContain('Finish the move')
    expect(text(wrapper, 'migration-banner')).toContain('backup you downloaded')
    expect(text(wrapper, 'migration-banner-restore')).toBe('Restore')
  })

  it('emits restore and skip as two different things', async () => {
    const wrapper = mount(MigrationBanner)

    await wrapper.get('[data-testid="migration-banner-restore"]').trigger('click')
    expect(wrapper.emitted('restore')).toHaveLength(1)
    expect(wrapper.emitted('skip')).toBeUndefined()

    await wrapper.get('[data-testid="migration-banner-skip"]').trigger('click')
    expect(wrapper.emitted('skip')).toHaveLength(1)
    expect(wrapper.emitted('restore')).toHaveLength(1)
  })
})
