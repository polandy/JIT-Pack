// @vitest-environment jsdom
/**
 * G-6's one control at its two sizes (FR-21.25).
 *
 * The size is a class rather than a second component, and the class is the
 * seam: the stylesheet behind it is what makes the sheet's main action look
 * like one, and M5 has no visual baseline to catch it going missing. Both
 * shapes are asserted, because `large` reaches the checkbox and the stepper
 * through two different elements and one of them is easy to forget.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import QuantityStepper from '../QuantityStepper.vue'

describe('QuantityStepper — one control, two sizes (G-6, FR-21.25)', () => {
  it('is a row-sized checkbox at quantity 1 unless a screen asks for more', () => {
    const wrapper = mount(QuantityStepper, { props: { quantity: 1, packed: 0 } })

    expect(wrapper.get('[data-testid="row-check"]').classes()).not.toContain('large')
  })

  it('takes the main-action size on the checkbox shape', () => {
    const wrapper = mount(QuantityStepper, { props: { quantity: 1, packed: 0, large: true } })

    expect(wrapper.get('[data-testid="row-check"]').classes()).toContain('large')
  })

  it('takes it on the stepper shape too, which is the half easily forgotten', () => {
    const wrapper = mount(QuantityStepper, { props: { quantity: 3, packed: 1, large: true } })

    expect(wrapper.get('.stepper').classes()).toContain('large')
    expect(
      mount(QuantityStepper, { props: { quantity: 3, packed: 1 } })
        .get('.stepper')
        .classes(),
    ).not.toContain('large')
  })
})
