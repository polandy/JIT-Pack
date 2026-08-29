// @vitest-environment jsdom
/**
 * FR-25.8 — the quick-add's *Pro Person* mode.
 *
 * The composer is shared with M8 (§3.25 consistency directive), and a
 * template has no travelers to distribute over, so the mode is opt-in per
 * caller. What is pinned here is the three things the mode is: absent unless
 * offered (G-8), carried on the `add` event rather than acted on here — the
 * composer knows nothing about rows — and reset when the run ends, because
 * *Gesamt* is the default the FR keeps for the common case.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

import QuickAddItem from '../QuickAddItem.vue'

const NAME = 'Sonnenhut'

function open(props: Record<string, unknown> = {}) {
  const wrapper = mount(QuickAddItem, { props })
  return wrapper
}

async function expand(wrapper: ReturnType<typeof open>) {
  await wrapper.find('[data-testid="quick-add-open"]').trigger('click')
}

async function type(wrapper: ReturnType<typeof open>, name: string) {
  await wrapper.findComponent({ name: 'IonInput' }).vm.$emit('update:modelValue', name)
}

async function confirm(wrapper: ReturnType<typeof open>) {
  await wrapper.find('[data-testid="quick-add-confirm"]').trigger('click')
}

describe('QuickAddItem — FR-25.8 per-person mode', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('offers no mode switch where there is nobody to distribute over (G-8)', async () => {
    const wrapper = open()
    await expand(wrapper)

    expect(wrapper.find('[data-testid="quick-add-mode-per-person"]').exists()).toBe(false)
  })

  it('adds gemeinsam by default, and per person only after the mode is chosen', async () => {
    const wrapper = open({ offerPerPerson: true })
    await expand(wrapper)

    await type(wrapper, NAME)
    await confirm(wrapper)

    await wrapper.find('[data-testid="quick-add-mode-per-person"]').trigger('click')
    await type(wrapper, NAME)
    await confirm(wrapper)

    const added = wrapper.emitted('add') ?? []
    expect(added).toHaveLength(2)
    expect((added[0]![0] as { perPerson: boolean }).perPerson).toBe(false)
    expect((added[1]![0] as { perPerson: boolean }).perPerson).toBe(true)
  })

  it('forgets the mode when the composer closes, so a run does not outlive itself', async () => {
    const wrapper = open({ offerPerPerson: true })
    await expand(wrapper)
    await wrapper.find('[data-testid="quick-add-mode-per-person"]').trigger('click')

    await wrapper.find('[data-testid="quick-add-close"]').trigger('click')
    await expand(wrapper)
    await type(wrapper, NAME)
    await confirm(wrapper)

    const added = wrapper.emitted('add') ?? []
    expect((added[0]![0] as { perPerson: boolean }).perPerson).toBe(false)
  })
})
