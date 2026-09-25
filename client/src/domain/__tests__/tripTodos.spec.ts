import { describe, expect, it } from 'vitest'

import {
  dashboardTasks,
  filedTagOf,
  groupAccepts,
  packingWindowTasks,
  tagForGroup,
  taskGroups,
  taskPhaseOf,
  tasksToMove,
  tasksToRetag,
  tasksInPhase,
  tasksOfAssignee,
  tripTasks,
  tripTodoPercent,
  tripTodoProgress,
  tripTodoStatus,
  tripTodosUnfolded,
  type TripTask,
} from '../tripTodos'
import type { ItemTodo, TaskPhase, TodoState, TripTodo } from '@/types/domain'
import { TASK_PHASE_BEFORE, TASK_PHASE_DURING } from '@/types/domain'

/** FR-7.11: the day every due rule below is read against. */
const TODAY = '2026-07-08'

describe('tripTodoProgress (FR-7.4)', () => {
  it.each([
    { name: 'no todos', states: [], want: { open: 0, done: 0, total: 0 } },
    { name: 'all open', states: ['open', 'open'], want: { open: 2, done: 0, total: 2 } },
    {
      name: 'mixed',
      states: ['open', 'resolved', 'resolved'],
      want: { open: 1, done: 2, total: 3 },
    },
    { name: 'all done', states: ['resolved'], want: { open: 0, done: 1, total: 1 } },
  ] as const)('counts $name', ({ states, want }) => {
    expect(tripTodoProgress(states.map((task_state) => ({ task_state })))).toEqual(want)
  })
})

describe('tripTodoStatus (FR-7.4)', () => {
  it('is silent about a trip with no todos, rather than calling it done', () => {
    expect(tripTodoStatus({ open: 0, done: 0, total: 0 })).toBe('none')
  })
  it('is open while any todo is', () => {
    expect(tripTodoStatus({ open: 1, done: 2, total: 3 })).toBe('open')
  })
  it('is all done once none is open', () => {
    expect(tripTodoStatus({ open: 0, done: 2, total: 2 })).toBe('allDone')
  })
})

describe('tripTodoPercent (FR-7.4)', () => {
  it.each([
    { name: 'none done', progress: { open: 4, done: 0, total: 4 }, want: 0 },
    { name: 'one of four', progress: { open: 3, done: 1, total: 4 }, want: 25 },
    { name: 'all done', progress: { open: 0, done: 2, total: 2 }, want: 100 },
    { name: 'no todos, not a division by zero', progress: { open: 0, done: 0, total: 0 }, want: 0 },
  ])('is $want for $name', ({ progress, want }) => {
    expect(tripTodoPercent(progress)).toBe(want)
  })
})

describe('tripTodosUnfolded (FR-7.4): M4 opens the section on what is still owed', () => {
  it('is open while a todo is open, and nobody folded it', () => {
    expect(tripTodosUnfolded('open', null)).toBe(true)
  })
  it('folds to its one line once every todo is done', () => {
    expect(tripTodosUnfolded('allDone', null)).toBe(false)
  })
  it('stays shut on a trip with no todo, where it is only the way to the first one', () => {
    expect(tripTodosUnfolded('none', null)).toBe(false)
  })
  it.each([
    { status: 'open', fold: false, want: false },
    { status: 'allDone', fold: true, want: true },
    { status: 'none', fold: true, want: true },
  ] as const)(
    'follows the user over the default ($status, folded open: $fold)',
    ({ status, fold, want }) => {
      expect(tripTodosUnfolded(status, fold)).toBe(want)
    },
  )
})

describe('tripTasks (FR-7.6): one list, two kinds of task', () => {
  const row = (id: string, name: string, icon: string | null = null) => ({ id, name, icon })

  const tripTodo = (
    id: string,
    body: string,
    state: TodoState = 'open',
    assignee: string | null = null,
  ) =>
    ({
      id,
      trip_id: 'trip',
      author_id: 'someone',
      body,
      task_state: state,
      assignee_user_id: assignee,
    }) as TripTodo

  const itemTodo = (
    id: string,
    itemId: string,
    body: string,
    state: TodoState = 'open',
    assignee: string | null = null,
  ) =>
    ({
      id,
      trip_id: 'trip',
      trip_item_id: itemId,
      author_id: 'someone',
      body,
      task_state: state,
      assignee_user_id: assignee,
    }) as ItemTodo

  it('names the row a preparation prepares, and nothing for the trip’s own', () => {
    const tasks = tripTasks(
      [tripTodo('t1', 'Water the plants')],
      [itemTodo('p1', 'i1', 'Charge the batteries')],
      [row('i1', 'Camera', '📷')],
    )
    expect(
      tasks.map((task) => [task.body, task.item?.name ?? null, task.item?.icon ?? null]),
    ).toEqual([
      ['Water the plants', null, null],
      ['Charge the batteries', 'Camera', '📷'],
    ])
  })

  it('carries the row id, so the chip can lead back to it', () => {
    const tasks = tripTasks(
      [],
      [itemTodo('p1', 'i1', 'Charge the batteries')],
      [row('i1', 'Camera')],
    )
    expect(tasks[0]?.item?.id).toBe('i1')
  })

  /*
   * FR-7.5 gave a preparation no assignee on the grounds that its row already
   * names somebody. FR-7.7 reverses that on the owner's request of
   * 2026-09-20: a task is handed over like a pack item, and a preparation is
   * a task. The row's `packer_user_id` still says who is packing it — the two
   * are different questions, and a battery can be Sia's to charge on a camera
   * Andy is packing.
   */
  it('keeps a preparation’s own assignee (FR-7.7, reversing FR-7.5)', () => {
    const tasks = tripTasks(
      [],
      [itemTodo('p1', 'i1', 'Charge', 'open', 'user-2')],
      [row('i1', 'Camera')],
    )
    expect(tasks[0]?.assignee_user_id).toBe('user-2')
  })

  it('keeps the trip todo’s assignee (FR-7.5)', () => {
    const tasks = tripTasks([tripTodo('t1', 'Water', 'open', 'user-1')], [], [])
    expect(tasks[0]?.assignee_user_id).toBe('user-1')
  })

  /**
   * FR-7.6's cascade, read from the view side: a preparation whose row the
   * trip no longer carries is not a task of the trip any more. The server
   * cascades the delete; this is what makes the list agree with it on a
   * device that has not pulled yet.
   */
  it('drops a preparation whose row the trip no longer carries', () => {
    const tasks = tripTasks(
      [tripTodo('t1', 'Water the plants')],
      [itemTodo('p1', 'gone', 'Charge the batteries'), itemTodo('p2', 'i1', 'Wash it')],
      [row('i1', 'Jacket')],
    )
    expect(tasks.map((task) => task.body)).toEqual(['Water the plants', 'Wash it'])
  })

  it('orders open before done, the trip’s own before a row’s, then by row and text', () => {
    const tasks = tripTasks(
      [tripTodo('t1', 'Water the plants'), tripTodo('t2', 'Empty the fridge', 'resolved')],
      [
        itemTodo('p1', 'i2', 'Wash it'),
        itemTodo('p2', 'i1', 'Format the card'),
        itemTodo('p3', 'i1', 'Charge the batteries'),
        itemTodo('p4', 'i1', 'Clean the lens', 'resolved'),
      ],
      [row('i1', 'Camera'), row('i2', 'Jacket')],
    )
    expect(tasks.map((task) => task.body)).toEqual([
      'Water the plants',
      'Charge the batteries',
      'Format the card',
      'Wash it',
      'Empty the fridge',
      'Clean the lens',
    ])
  })

  it('counts both kinds in the one check the figure states', () => {
    const tasks = tripTasks(
      [tripTodo('t1', 'Water the plants', 'resolved')],
      [itemTodo('p1', 'i1', 'Charge the batteries')],
      [row('i1', 'Camera')],
    )
    expect(tripTodoProgress(tasks)).toEqual({ open: 1, done: 1, total: 2 })
  })

  it('is empty for a trip with neither kind', () => {
    expect(tripTasks([], [], [row('i1', 'Camera')])).toEqual([])
  })
})

describe('taskPhaseOf (FR-7.7): when a task is due', () => {
  /*
   * The null is not a gap to be filled but a reading to be made: a task
   * nobody has said anything about is one you meant to do before you left,
   * which is what every task meant until FR-7.7. Writing the column onto the
   * old rows would have claimed a statement nobody made.
   */
  it('reads a task without a phase as one for before the trip', () => {
    expect(taskPhaseOf({ phase: null })).toBe(TASK_PHASE_BEFORE)
  })

  it.each([TASK_PHASE_BEFORE, TASK_PHASE_DURING] as const)('keeps a stated %s', (phase) => {
    expect(taskPhaseOf({ phase })).toBe(phase)
  })
})

describe('the two windows on one list (FR-7.7)', () => {
  const task = (
    id: string,
    opts: {
      item?: { id: string; name: string; icon: string | null } | null
      phase?: TaskPhase
      assignee?: string | null
      state?: TodoState
      due?: string | null
    } = {},
  ) => ({
    id,
    body: id,
    task_state: opts.state ?? ('open' as TodoState),
    item: opts.item ?? null,
    assignee_user_id: opts.assignee ?? null,
    phase: opts.phase ?? TASK_PHASE_BEFORE,
    author_id: 'someone',
    created_at: null,
    resolved_at: null,
    resolved_by_user_id: null,
    task_tag_id: null,
    due_date: opts.due ?? null,
  })

  const camera = { id: 'i1', name: 'Camera', icon: null }

  /*
   * M4's window is the whole reason nothing is filed twice: the packing list
   * shows what you do *as part of packing*, and M25 shows all of it. So a
   * task moved to *during* leaves the packing list, which is what moving it
   * means — and a trip's own task was never on it to begin with.
   */
  it('keeps only a row’s preparation that is still due before the trip', () => {
    const tasks = [
      task('prep-before', { item: camera }),
      task('prep-during', { item: camera, phase: TASK_PHASE_DURING }),
      task('own-before'),
      task('own-during', { phase: TASK_PHASE_DURING }),
    ]
    expect(packingWindowTasks(tasks, TODAY).map((t) => t.id)).toEqual(['prep-before'])
  })

  it('FR-7.11: leads with what is due', () => {
    const tasks = [
      task('undated', { item: camera }),
      task('tomorrow', { item: camera, due: '2026-07-09' }),
      task('overdue', { item: camera, due: '2026-07-01' }),
    ]
    expect(packingWindowTasks(tasks, TODAY).map((t) => t.id)).toEqual([
      'overdue',
      'tomorrow',
      'undated',
    ])
  })

  it('splits M25 by phase, both kinds together', () => {
    const tasks = [
      task('prep-before', { item: camera }),
      task('own-during', { phase: TASK_PHASE_DURING }),
      task('prep-during', { item: camera, phase: TASK_PHASE_DURING }),
    ]
    expect(tasksInPhase(tasks, TASK_PHASE_BEFORE).map((t) => t.id)).toEqual(['prep-before'])
    expect(tasksInPhase(tasks, TASK_PHASE_DURING).map((t) => t.id)).toEqual([
      'own-during',
      'prep-during',
    ])
  })

  it('filters to one person’s tasks, both kinds', () => {
    const tasks = [
      task('mine-own', { assignee: 'user-1' }),
      task('mine-prep', { item: camera, assignee: 'user-1' }),
      task('theirs', { assignee: 'user-2' }),
      task('nobody’s'),
    ]
    expect(tasksOfAssignee(tasks, 'user-1').map((t) => t.id)).toEqual(['mine-own', 'mine-prep'])
  })

  /*
   * Nobody signed in means nobody to filter by, and an unassigned task is not
   * „mine" — in Local Mode that reading would turn the whole list into it.
   */
  it('answers with nothing where nobody is signed in', () => {
    expect(tasksOfAssignee([task('a'), task('b', { assignee: 'user-1' })], null)).toEqual([])
  })
})

describe('taskGroups (FR-7.8): one tag, and the headings it makes', () => {
  const tag = (id: string, name: string, sort = 0) => ({ id, name, sort_order: sort, icon: null })
  const t = (
    id: string,
    over: {
      tag?: string | null
      item?: { id: string; name: string; icon: string | null } | null
      due?: string | null
    } = {},
  ) =>
    ({
      id,
      body: id,
      task_state: 'open' as TodoState,
      item: over.item ?? null,
      assignee_user_id: null,
      phase: TASK_PHASE_BEFORE,
      author_id: 'someone',
      created_at: null,
      resolved_at: null,
      resolved_by_user_id: null,
      task_tag_id: over.tag ?? null,
      due_date: over.due ?? null,
    }) as TripTask

  const camera = { id: 'i1', name: 'Kamera', icon: null }
  const tags = [tag('apo', 'Apotheke', 0), tag('haus', 'Haus', 1)]

  it('files each task under its tag, in the order the tags carry', () => {
    const groups = taskGroups([t('a', { tag: 'haus' }), t('b', { tag: 'apo' })], tags, TODAY)
    expect(groups.map((g) => [g.key, g.tasks.map((x) => x.id)])).toEqual([
      ['apo', ['b']],
      ['haus', ['a']],
    ])
  })

  /*
   * „Aus Packliste" is not a tag — it is what the *untagged* group is called
   * when the task came from a packing row (owner, 2026-09-21). Both kinds are
   * `task_tag_id === null` in the data, and only the heading differs, so
   * nothing has to create the row, nobody can rename it, and it cannot end up
   * describing a task it is not true of.
   */
  it('splits the untagged ones by where they came from', () => {
    const groups = taskGroups([t('prep', { item: camera }), t('own')], tags, TODAY)
    expect(groups.map((g) => [g.key, g.origin, g.tasks.map((x) => x.id)])).toEqual([
      ['prep', 'prep', ['prep']],
      ['trip', 'trip', ['own']],
    ])
  })

  /*
   * An empty heading says nothing while reading — and because it is not drawn
   * it is not a drop target either, which is what keeps the list from growing
   * under a finger that has just lifted something (ADR-060). Losing a tag is
   * the sheet's job instead.
   */
  it('draws no heading for a group with nothing in it', () => {
    expect(taskGroups([t('a', { tag: 'apo' })], tags, TODAY).map((g) => g.key)).toEqual(['apo'])
  })

  it('refuses a task the heading would not be true of', () => {
    expect(groupAccepts({ origin: 'prep' }, t('x', { item: camera }))).toBe(true)
    expect(groupAccepts({ origin: 'prep' }, t('y'))).toBe(false)
    expect(groupAccepts({ origin: 'trip' }, t('y'))).toBe(true)
    expect(groupAccepts({ origin: 'trip' }, t('x', { item: camera }))).toBe(false)
    // A real tag takes either kind: what a task is *about* has nothing to do
    // with whether a packing row owes it.
    expect(groupAccepts({ origin: null }, t('x', { item: camera }))).toBe(true)
  })

  /*
   * A task can name a tag this device has no row for, and it is not an exotic
   * state: the master and trip partitions arrive through separate feeds, so a
   * task written elsewhere can land before the tag it names — and a deleted
   * tag sets the column to NULL on the server without passing the change log,
   * so a device that never saw the delete keeps the old id for good.
   *
   * Whatever the cause, a task nobody can file is still a task. Before this
   * rule it fell through both passes — not its tag's group, because no such
   * group is built, and not the untagged one, because its column is not NULL
   * — and disappeared from the screen while sitting in the data.
   */
  it('files a task whose tag this device does not know as an untagged one', () => {
    const groups = taskGroups(
      [t('stranger', { tag: 'gone' }), t('prep', { tag: 'gone', item: camera })],
      tags,
      TODAY,
    )
    expect(groups.map((g) => [g.key, g.tasks.map((x) => x.id)])).toEqual([
      ['prep', ['prep']],
      ['trip', ['stranger']],
    ])
  })

  it('FR-7.11: a group with something overdue or soon moves up, and inside a group the dated lead', () => {
    const groups = taskGroups(
      [
        t('apo-undated', { tag: 'apo' }),
        t('haus-undated', { tag: 'haus' }),
        t('haus-later', { tag: 'haus', due: '2026-07-30' }),
        t('haus-soon', { tag: 'haus', due: '2026-07-10' }),
      ],
      tags,
      TODAY,
    )
    expect(groups.map((g) => [g.key, g.tasks.map((x) => x.id)])).toEqual([
      ['haus', ['haus-soon', 'haus-later', 'haus-undated']],
      ['apo', ['apo-undated']],
    ])
  })

  it('names the tag a task is filed under, which is not always the one it carries', () => {
    expect(filedTagOf({ task_tag_id: 'apo' }, tags)).toBe('apo')
    expect(filedTagOf({ task_tag_id: null }, tags)).toBeNull()
    // The one that matters: an id with no tag behind it reads as „none".
    expect(filedTagOf({ task_tag_id: 'gone' }, tags)).toBeNull()
  })

  it('reads a drop on an origin group as “no tag”', () => {
    expect(tagForGroup('apo')).toBe('apo')
    expect(tagForGroup('prep')).toBeNull()
    expect(tagForGroup('trip')).toBeNull()
  })
})

describe('dashboardTasks (FR-7.10): what the hero lists of a trip’s tasks', () => {
  const task = (
    id: string,
    opts: {
      phase?: TaskPhase
      assignee?: string | null
      state?: TodoState
      due?: string | null
    } = {},
  ): TripTask => ({
    id,
    body: id,
    task_state: opts.state ?? 'open',
    item: null,
    assignee_user_id: opts.assignee ?? null,
    phase: opts.phase ?? TASK_PHASE_BEFORE,
    author_id: 'someone',
    created_at: null,
    resolved_at: null,
    resolved_by_user_id: null,
    task_tag_id: null,
    due_date: opts.due ?? null,
  })
  const ids = (list: TripTask[]) => list.map((entry) => entry.id)

  it('lists only open tasks and counts them all, whatever the limit', () => {
    const got = dashboardTasks(
      [task('a'), task('b', { state: 'resolved' }), task('c'), task('d'), task('e')],
      { phaseInFront: TASK_PHASE_BEFORE, myUserId: null, limit: 2, today: TODAY },
    )
    expect(ids(got.rows)).toEqual(['a', 'c'])
    expect(got.open).toBe(4)
    expect(got.rest).toBe(2)
  })

  it('puts the phase the trip is in first, and keeps FR-7.6’s order inside each group', () => {
    const got = dashboardTasks(
      [
        task('before-1'),
        task('during-1', { phase: TASK_PHASE_DURING }),
        task('before-2'),
        task('during-2', { phase: TASK_PHASE_DURING }),
      ],
      { phaseInFront: TASK_PHASE_DURING, myUserId: null, limit: 10, today: TODAY },
    )
    expect(ids(got.rows)).toEqual(['during-1', 'during-2', 'before-1', 'before-2'])
  })

  it('puts mine before the rest inside a phase, but never ahead of the phase in front', () => {
    const got = dashboardTasks(
      [
        task('other-during', { phase: TASK_PHASE_DURING }),
        task('mine-before', { assignee: 'me' }),
        task('mine-during', { phase: TASK_PHASE_DURING, assignee: 'me' }),
        task('other-before'),
      ],
      { phaseInFront: TASK_PHASE_DURING, myUserId: 'me', limit: 10, today: TODAY },
    )
    expect(ids(got.rows)).toEqual(['mine-during', 'other-during', 'mine-before', 'other-before'])
  })

  it('has no “mine” without a signed-in person, so an unassigned task is not one', () => {
    const got = dashboardTasks([task('a'), task('b', { assignee: 'someone' })], {
      phaseInFront: TASK_PHASE_BEFORE,
      myUserId: null,
      limit: 10,
      today: TODAY,
    })
    expect(ids(got.rows)).toEqual(['a', 'b'])
  })

  it('FR-7.11: leads with what is due — overdue, today, soon — ahead of phase and of mine', () => {
    const got = dashboardTasks(
      [
        task('mine-during', { phase: TASK_PHASE_DURING, assignee: 'me' }),
        task('later', { phase: TASK_PHASE_BEFORE, due: '2026-07-30' }),
        task('soon', { phase: TASK_PHASE_BEFORE, due: '2026-07-10' }),
        task('long-overdue', { phase: TASK_PHASE_BEFORE, due: '2025-01-01' }),
        task('today', { phase: TASK_PHASE_DURING, due: TODAY }),
      ],
      { phaseInFront: TASK_PHASE_DURING, myUserId: 'me', limit: 10, today: TODAY },
    )
    expect(ids(got.rows)).toEqual(['long-overdue', 'today', 'soon', 'mine-during', 'later'])
  })

  it('says nothing is left when nothing is open', () => {
    expect(
      dashboardTasks([task('a', { state: 'resolved' })], {
        phaseInFront: TASK_PHASE_BEFORE,
        myUserId: null,
        limit: 4,
        today: TODAY,
      }),
    ).toEqual({ rows: [], open: 0, rest: 0 })
  })
})

describe('a batch of tasks (FR-7.8): only what changes is written', () => {
  const task = (id: string, over: { tag?: string | null; phase?: TaskPhase } = {}): TripTask => ({
    id,
    body: id,
    task_state: 'open',
    item: null,
    assignee_user_id: null,
    phase: over.phase ?? TASK_PHASE_BEFORE,
    author_id: 'someone',
    created_at: null,
    resolved_at: null,
    resolved_by_user_id: null,
    task_tag_id: over.tag ?? null,
    due_date: null,
  })

  it.each([
    { name: 'a tag nobody carries yet', to: 'haus', want: ['a', 'b', 'c'] },
    { name: 'a tag one already carries', to: 'apo', want: ['b', 'c'] },
    { name: 'no tag at all', to: null, want: ['a', 'c'] },
  ])('retags to $name', ({ to, want }) => {
    const tasks = [task('a', { tag: 'apo' }), task('b'), task('c', { tag: 'haus-old' })]
    expect(tasksToRetag(tasks, to).map((t) => t.id)).toEqual(want)
  })

  it('moves only the tasks not already in the phase', () => {
    const tasks = [task('a'), task('b', { phase: TASK_PHASE_DURING }), task('c')]
    expect(tasksToMove(tasks, TASK_PHASE_DURING).map((t) => t.id)).toEqual(['a', 'c'])
    expect(tasksToMove(tasks, TASK_PHASE_BEFORE).map((t) => t.id)).toEqual(['b'])
  })
})
