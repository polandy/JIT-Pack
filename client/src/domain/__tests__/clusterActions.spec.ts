/**
 * FR-25.26: what a per-person cluster's head may do to every instance under
 * it at once, and which of them a write actually reaches.
 *
 * The two halves are tested apart because they fail apart: the menu can be
 * right about what to offer while the fan-out writes the wrong set, and a
 * fan-out that silently skipped a locked instance would look identical to
 * one that wrote it.
 */
import { describe, it, expect } from 'vitest'

import {
  clusterFanOut,
  clusterMenuEntries,
  type ClusterInstance,
  type ClusterMenuAction,
  type ClusterMenuContext,
} from '@/domain/clusterActions'

function instance(overrides: Partial<ClusterInstance> = {}): ClusterInstance {
  return { id: 'i1', latePacker: false, lockedBy: null, ...overrides }
}

function ctx(overrides: Partial<ClusterMenuContext> = {}): ClusterMenuContext {
  return { closingPass: false, canAssign: false, ...overrides }
}

interface MenuCase {
  name: string
  instances: ClusterInstance[]
  ctx: Partial<ClusterMenuContext>
  want: ClusterMenuAction[]
}

const menuCases: MenuCase[] = [
  {
    name: 'a cluster nobody has flagged offers the flag for all of it (FR-25.26)',
    instances: [instance({ id: 'a' }), instance({ id: 'b' })],
    ctx: {},
    want: ['latePackerOn'],
  },
  {
    name: 'a cluster flagged through offers the way back off it',
    instances: [instance({ id: 'a', latePacker: true }), instance({ id: 'b', latePacker: true })],
    ctx: {},
    want: ['latePackerOff'],
  },
  {
    name: 'a half-flagged cluster offers to finish the job, not to undo it',
    instances: [instance({ id: 'a', latePacker: true }), instance({ id: 'b' })],
    ctx: {},
    want: ['latePackerOn'],
  },
  {
    name: 'the assignment is offered only where there is somebody to assign to (G-8)',
    instances: [instance({ id: 'a' }), instance({ id: 'b' })],
    ctx: { canAssign: true },
    want: ['latePackerOn', 'assignAll'],
  },
  {
    name: 'the closing pass takes the head’s menu away, exactly as it takes a row’s (FR-9.3)',
    instances: [instance({ id: 'a' }), instance({ id: 'b' })],
    ctx: { closingPass: true, canAssign: true },
    want: [],
  },
  {
    name: 'a cluster held through by other people offers nothing at all (G-3)',
    instances: [instance({ id: 'a', lockedBy: 'Sia' }), instance({ id: 'b', lockedBy: 'Sia' })],
    ctx: { canAssign: true },
    want: [],
  },
  {
    name: 'one held instance does not close the menu — the others are still writable',
    instances: [instance({ id: 'a', lockedBy: 'Sia' }), instance({ id: 'b' })],
    ctx: {},
    want: ['latePackerOn'],
  },
  {
    name: 'an empty cluster offers nothing rather than an empty sheet',
    instances: [],
    ctx: { canAssign: true },
    want: [],
  },
]

describe('clusterMenuEntries (FR-25.26, FR-9.3, G-3, G-8)', () => {
  it.each(menuCases)('$name', ({ instances, ctx: overrides, want }) => {
    expect(clusterMenuEntries(instances, ctx(overrides))).toEqual(want)
  })

  it('reads the flag over every instance, including ones a lock keeps it from writing', () => {
    // Otherwise "all flagged" would be a statement about the writable subset,
    // and the head would offer to switch on what it is already showing as on.
    const held = [
      instance({ id: 'a', latePacker: true }),
      instance({ id: 'b', latePacker: false, lockedBy: 'Sia' }),
    ]
    expect(clusterMenuEntries(held, ctx())).toEqual(['latePackerOn'])
  })
})

describe('clusterFanOut (FR-25.26, G-3)', () => {
  it('writes every instance when nobody is holding one', () => {
    const plan = clusterFanOut([instance({ id: 'a' }), instance({ id: 'b' })])
    expect(plan).toEqual({ targetIds: ['a', 'b'], blockedBy: [] })
  })

  it('leaves a held instance out and names who is holding it', () => {
    const plan = clusterFanOut([
      instance({ id: 'a' }),
      instance({ id: 'b', lockedBy: 'Sia' }),
      instance({ id: 'c' }),
    ])
    expect(plan).toEqual({ targetIds: ['a', 'c'], blockedBy: ['Sia'] })
  })

  it('names each holder once, in the order the instances stand', () => {
    const plan = clusterFanOut([
      instance({ id: 'a', lockedBy: 'Sia' }),
      instance({ id: 'b', lockedBy: 'Andy' }),
      instance({ id: 'c', lockedBy: 'Sia' }),
    ])
    expect(plan).toEqual({ targetIds: [], blockedBy: ['Sia', 'Andy'] })
  })
})
