// @vitest-environment jsdom
/**
 * C-14: the orchestrator's injection key, and what happens when a view asks
 * for it and nothing provided one.
 *
 * The 27 call sites used to assert non-null (`inject(...)!`). That assertion
 * was never checked, and `App.vue` genuinely provides `null` until a mode is
 * chosen — so the empty case has to fail with a sentence rather than at
 * whatever the view happened to call first.
 */
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'

import { ORCHESTRATOR, useOrchestrator } from '../useOrchestrator'
import type { Orchestrator } from '../useSyncOrchestrator'

/** A component that does nothing but ask for the orchestrator. */
const Asking = defineComponent({
  setup() {
    const orchestrator = useOrchestrator()
    return () => h('span', { 'data-testid': 'asked' }, String(Boolean(orchestrator)))
  },
})

/** Enough of the facade to be provided; no case calls through it. */
const fake = { updateTrip: () => {} } as unknown as Orchestrator

describe('useOrchestrator', () => {
  it('hands back the orchestrator provided under the key', () => {
    const wrapper = mount(Asking, { global: { provide: { [ORCHESTRATOR]: fake } } })

    expect(wrapper.get('[data-testid="asked"]').text()).toBe('true')
  })

  it('names what went wrong when nothing was provided', () => {
    expect(() => mount(Asking)).toThrow(/No orchestrator was provided/)
  })

  /**
   * The case the old `!` could not express. `App.vue` provides `null` for the
   * whole of M17, so "provided, but empty" is a state that actually occurs —
   * and it has to fail the same way as "not provided at all".
   */
  it('treats a provided null the same as no provider (M17, before a mode is chosen)', () => {
    expect(() => mount(Asking, { global: { provide: { [ORCHESTRATOR]: null } } })).toThrow(
      /No orchestrator was provided/,
    )
  })
})
