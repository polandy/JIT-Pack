/**
 * FR-25.26: what a per-person cluster's head may do to every instance under
 * it at once, and which of them a write actually reaches. Since 2026-09-19
 * that is everything a row's own menu offers, each entry reaching the
 * instances whose row would offer it.
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
  clusterTargets,
  type ClusterInstance,
  type ClusterMenuAction,
  type ClusterMenuContext,
} from '@/domain/clusterActions'
import type { TripItem } from '@/types/domain'

interface InstanceSpec {
  id?: string
  latePacker?: boolean
  flagUnused?: boolean
  state?: TripItem['state']
  mode?: TripItem['mode']
  lockedBy?: string | null
  mine?: boolean
}

function instance(spec: InstanceSpec = {}): ClusterInstance {
  return {
    id: spec.id ?? 'i1',
    row: {
      state: spec.state ?? 'open',
      late_packer: spec.latePacker ?? false,
      flag_unused: spec.flagUnused ?? false,
      mode: spec.mode ?? 'pack',
    },
    lockedBy: spec.lockedBy ?? null,
    mine: spec.mine ?? false,
  }
}

function ctx(overrides: Partial<ClusterMenuContext> = {}): ClusterMenuContext {
  return { closingPass: false, canAssign: false, judgeable: false, ...overrides }
}

/** What an open cluster offers when the flag is still off, as a row does. */
const OPEN: ClusterMenuAction[] = [
  'quantity',
  'packingNow',
  'skip',
  'buyLocal',
  'latePackerOn',
  'remove',
]

interface MenuCase {
  name: string
  instances: ClusterInstance[]
  ctx: Partial<ClusterMenuContext>
  want: ClusterMenuAction[]
}

const menuCases: MenuCase[] = [
  {
    name: 'an open cluster offers what an open row does (FR-25.26, owner 2026-09-19)',
    instances: [instance({ id: 'a' }), instance({ id: 'b' })],
    ctx: {},
    want: OPEN,
  },
  {
    name: 'a cluster flagged through offers the way back off it',
    instances: [instance({ id: 'a', latePacker: true }), instance({ id: 'b', latePacker: true })],
    ctx: {},
    want: ['quantity', 'packingNow', 'skip', 'buyLocal', 'latePackerOff', 'remove'],
  },
  {
    name: 'a half-flagged cluster offers to finish the job, not to undo it',
    instances: [instance({ id: 'a', latePacker: true }), instance({ id: 'b' })],
    ctx: {},
    want: OPEN,
  },
  {
    name: 'the assignment is offered only where there is somebody to assign to (G-8)',
    instances: [instance({ id: 'a' }), instance({ id: 'b' })],
    ctx: { canAssign: true },
    want: ['quantity', 'packingNow', 'skip', 'buyLocal', 'latePackerOn', 'assignAll', 'remove'],
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
    want: OPEN,
  },
  {
    name: 'an empty cluster offers nothing rather than an empty sheet',
    instances: [],
    ctx: { canAssign: true },
    want: [],
  },
  {
    name: 'a skipped cluster offers the way back, as a skipped row does (FR-5.5)',
    instances: [instance({ id: 'a', state: 'skipped' }), instance({ id: 'b', state: 'skipped' })],
    ctx: {},
    want: ['unskip', 'latePackerOn', 'remove'],
  },
  {
    name: 'a half-skipped cluster offers both directions — each reaches its own rows',
    instances: [instance({ id: 'a', state: 'skipped' }), instance({ id: 'b' })],
    ctx: {},
    want: ['unskip', ...OPEN],
  },
  {
    name: 'a cluster I am packing through offers the release and the flag, as my row does (G-3)',
    instances: [instance({ id: 'a', mine: true }), instance({ id: 'b', mine: true })],
    ctx: {},
    want: ['release', 'latePackerOn'],
  },
  {
    name: 'the unused judgement is offered in its window (FR-9.3)',
    instances: [instance({ id: 'a' }), instance({ id: 'b' })],
    ctx: { judgeable: true },
    want: ['quantity', 'packingNow', 'skip', 'buyLocal', 'latePackerOn', 'flagUnused', 'remove'],
  },
  {
    name: 'a cluster judged unused through offers to take it back',
    instances: [instance({ id: 'a', flagUnused: true }), instance({ id: 'b', flagUnused: true })],
    ctx: { judgeable: true },
    want: ['quantity', 'packingNow', 'skip', 'buyLocal', 'latePackerOn', 'unflagUnused', 'remove'],
  },
  {
    name: 'a half-judged cluster offers to finish the judgement',
    instances: [instance({ id: 'a', flagUnused: true }), instance({ id: 'b' })],
    ctx: { judgeable: true },
    want: ['quantity', 'packingNow', 'skip', 'buyLocal', 'latePackerOn', 'flagUnused', 'remove'],
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
    expect(clusterMenuEntries(held, ctx())).toEqual(OPEN)
  })

  it('offers no entry that only a held instance would take', () => {
    // The skipped row is Sia's, so nothing on the head could un-skip it.
    const held = [instance({ id: 'a', state: 'skipped', lockedBy: 'Sia' }), instance({ id: 'b' })]
    expect(clusterMenuEntries(held, ctx())).toEqual(OPEN)
  })
})

describe('clusterTargets (FR-25.26, G-3)', () => {
  const mixed = [
    instance({ id: 'a' }),
    instance({ id: 'b', state: 'skipped' }),
    instance({ id: 'c', mine: true }),
    instance({ id: 'd', lockedBy: 'Sia' }),
  ]

  it('an entry reaches the instances whose own row offers it', () => {
    expect(clusterTargets('skip', mixed, ctx()).targetIds).toEqual(['a'])
    expect(clusterTargets('unskip', mixed, ctx()).targetIds).toEqual(['b'])
    expect(clusterTargets('release', mixed, ctx()).targetIds).toEqual(['c'])
    expect(clusterTargets('remove', mixed, ctx()).targetIds).toEqual(['a', 'b'])
  })

  it('names a holder only where the entry would have reached their instance', () => {
    expect(clusterTargets('skip', mixed, ctx()).blockedBy).toEqual(['Sia'])
    expect(clusterTargets('unskip', mixed, ctx()).blockedBy).toEqual([])
  })

  it('the late-packer flag and the assignment reach every instance, as before', () => {
    expect(clusterTargets('latePackerOn', mixed, ctx()).targetIds).toEqual(['a', 'b', 'c'])
    expect(clusterTargets('assignAll', mixed, ctx()).targetIds).toEqual(['a', 'b', 'c'])
  })

  it('the mode switch reaches each instance from where it stands (FR-5.9)', () => {
    const modes = [
      instance({ id: 'a' }),
      instance({ id: 'b', mode: 'buy_local' }),
      instance({ id: 'c', state: 'partial' }),
    ]
    expect(clusterMenuEntries(modes, ctx())).toEqual(
      expect.arrayContaining(['buyLocal', 'packInstead']),
    )
    expect(clusterTargets('buyLocal', modes, ctx()).targetIds).toEqual(['a'])
    expect(clusterTargets('packInstead', modes, ctx()).targetIds).toEqual(['b'])
  })

  it('an on/off pair reaches the same instances in both directions', () => {
    const judged = ctx({ judgeable: true })
    expect(clusterTargets('flagUnused', mixed, judged).targetIds).toEqual(['a', 'b', 'c'])
    expect(clusterTargets('unflagUnused', mixed, judged).targetIds).toEqual(['a', 'b', 'c'])
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
