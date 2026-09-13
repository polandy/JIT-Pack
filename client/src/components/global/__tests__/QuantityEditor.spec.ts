// @vitest-environment jsdom
/**
 * FR-25.24's control: how many of a row are meant to come along.
 *
 * The rules pinned here are the ones that make it a different control from
 * the G-6 stepper beside it — it writes the *target*, not the count, its
 * floor is 1 because zero belongs to FR-5.5's skip, and it warns before a
 * tap that would drop rows somebody has already packed.
 */
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'

import QuantityEditor from '../QuantityEditor.vue'
import { QUANTITY_MAX, quantityChoices } from '@/domain/quantityChoices'

function mountEditor(props: Partial<InstanceType<typeof QuantityEditor>['$props']> = {}) {
  return mount(QuantityEditor, {
    props: {
      quantity: 3,
      packed: 0,
      choices: quantityChoices({ durationDays: 7, travelerCount: 4, perPerson: false }),
      ...props,
    },
    global: { stubs: { IonIcon: true } },
  })
}

describe('QuantityEditor (FR-25.24)', () => {
  it('steps the amount up and down, one at a time', async () => {
    const wrapper = mountEditor()
    await wrapper.find('[data-testid="quantity-more"]').trigger('click')
    await wrapper.find('[data-testid="quantity-less"]').trigger('click')
    expect(wrapper.emitted('update')).toEqual([[4], [2]])
  })

  it('stops at 1, because zero is the skip control’s decision (FR-5.5)', async () => {
    const wrapper = mountEditor({ quantity: 1 })
    const less = wrapper.find('[data-testid="quantity-less"]')
    expect(less.attributes('disabled')).toBeDefined()
    await less.trigger('click')
    expect(wrapper.emitted('update')).toBeUndefined()
  })

  it('stops at the typo bound', async () => {
    const wrapper = mountEditor({ quantity: QUANTITY_MAX })
    const more = wrapper.find('[data-testid="quantity-more"]')
    expect(more.attributes('disabled')).toBeDefined()
    await more.trigger('click')
    expect(wrapper.emitted('update')).toBeUndefined()
  })

  it('writes a quick amount in one tap', async () => {
    const wrapper = mountEditor()
    await wrapper.find('[data-testid="quantity-choice-days-7"]').trigger('click')
    expect(wrapper.emitted('update')).toEqual([[7]])
  })

  it('says nothing when a quick amount is the amount already', async () => {
    // The row is already at 3, so the "3" chip has nothing to write — a
    // mutation per tap on the current value would fill the outbox with
    // no-ops and take a claim's clock with it.
    const wrapper = mountEditor({ quantity: 3 })
    await wrapper.find('[data-testid="quantity-choice-plain-3"]').trigger('click')
    expect(wrapper.emitted('update')).toBeUndefined()
  })

  it('names what is packed already, and only when there is some', () => {
    expect(mountEditor({ packed: 0 }).find('[data-testid="quantity-packed-hint"]').exists()).toBe(
      false,
    )
    const packed = mountEditor({ quantity: 5, packed: 2 })
    expect(packed.find('[data-testid="quantity-packed-hint"]').text()).toContain('2')
  })

  it('marks a quick amount that would drop packed rows', () => {
    const wrapper = mountEditor({ quantity: 5, packed: 4 })
    // Two is below the four already in the bag; five is not.
    expect(wrapper.find('[data-testid="quantity-choice-plain-2"]').text()).toContain('!')
    expect(wrapper.find('[data-testid="quantity-choice-plain-5"]').text()).not.toContain('!')
  })

  it('writes nothing at all while somebody else holds the row (G-3)', async () => {
    const wrapper = mountEditor({ disabled: true })
    await wrapper.find('[data-testid="quantity-more"]').trigger('click')
    await wrapper.find('[data-testid="quantity-choice-plain-5"]').trigger('click')
    expect(wrapper.emitted('update')).toBeUndefined()
  })
})
