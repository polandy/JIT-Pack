// @vitest-environment jsdom
/**
 * M1's due line calls a block by its anchor (FR-7.11, FR-30.10); only that
 * block answers, and it answers every call, not just the first.
 */
import { flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { effectScope } from 'vue'

import { callBlock, onBlockCall } from '../blockCall'

describe('callBlock', () => {
  it('reaches the block wearing the anchor, every time it is called', async () => {
    const answered: string[] = []
    const scope = effectScope()
    scope.run(() => {
      onBlockCall(
        () => 'due-tasks-t1',
        () => answered.push('tasks'),
      )
      onBlockCall(
        () => 'due-shopping-t1',
        () => answered.push('shopping'),
      )
    })

    callBlock('due-tasks-t1')
    await flushPromises()
    callBlock('due-tasks-t1')
    await flushPromises()

    expect(answered).toEqual(['tasks', 'tasks'])
    scope.stop()
  })

  it('reaches no block for an anchor nobody wears', async () => {
    const answered: string[] = []
    const scope = effectScope()
    scope.run(() =>
      onBlockCall(
        () => undefined,
        () => answered.push('anonymous'),
      ),
    )

    callBlock('due-tasks-t9')
    await flushPromises()

    expect(answered).toEqual([])
    scope.stop()
  })
})
