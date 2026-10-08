/**
 * FR-29.13 — the packing side's results of an idea: the excursion and the
 * trip tasks that name it, each leading to where it lives.
 */
import { describe, expect, it } from 'vitest'

import { createIdeaResultSource } from '../ideaResultSource'
import { IDEA_RESULT_EXCURSION, IDEA_RESULT_TASK } from '@/domain/ideaBridge'
import { tripExcursionsPath, tripSubPath } from '@/router/paths'
import type { Excursion, TripTodo } from '@/types/domain'

function excursion(id: string, ideaId: string | null): Excursion {
  return {
    id,
    trip_id: 't',
    name: `Ausflug ${id}`,
    starts_on: null,
    ends_on: null,
    source_template_id: null,
    idea_id: ideaId,
  }
}

function task(id: string, ideaId: string | null, resolved = false): TripTodo {
  return {
    id,
    trip_id: 't',
    author_id: 'u',
    body: `Aufgabe ${id}`,
    task_state: resolved ? 'resolved' : 'open',
    task_tag_id: null,
    phase: null,
    due_date: null,
    created_at: null,
    assignee_user_id: null,
    resolved_at: null,
    resolved_by_user_id: null,
    idea_id: ideaId,
  }
}

describe('createIdeaResultSource (FR-29.13)', () => {
  const source = createIdeaResultSource({
    getExcursions: () => [excursion('ex-1', 'idea-1'), excursion('ex-2', 'idea-2')],
    getTripTodos: () => [task('to-1', 'idea-1', true), task('to-2', null), task('to-3', 'idea-1')],
  })

  it('lists the excursion and the tasks made from the idea, and nothing else', () => {
    expect(source.results('t', 'idea-1')).toEqual([
      {
        key: 'excursion:ex-1',
        kind: IDEA_RESULT_EXCURSION,
        title: 'Ausflug ex-1',
        done: false,
        path: tripExcursionsPath('t', 'ex-1'),
      },
      {
        key: 'task:to-1',
        kind: IDEA_RESULT_TASK,
        title: 'Aufgabe to-1',
        done: true,
        path: tripSubPath('t', 'tasks'),
      },
      {
        key: 'task:to-3',
        kind: IDEA_RESULT_TASK,
        title: 'Aufgabe to-3',
        done: false,
        path: tripSubPath('t', 'tasks'),
      },
    ])
  })

  it('lists nothing for an idea nothing came of', () => {
    expect(source.results('t', 'idea-3')).toEqual([])
  })
})
