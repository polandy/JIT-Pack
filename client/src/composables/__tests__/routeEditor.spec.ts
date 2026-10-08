/**
 * FR-29.20 — the editor's history and the requests its new legs make.
 */
import { describe, expect, it, vi } from 'vitest'

import type { TrackKind } from '@/api/types'
import { append, emptyDraft, moveHandle, type LatLon, type RoutePoint } from '@/domain/route'
import { createRouteEditor, legMode, type LegFetchers } from '../routeEditor'

/** A request held open until the test answers or fails it. */
interface Held {
  from: LatLon
  to: LatLon
  kind?: TrackKind
  signal: AbortSignal
  answer(points: RoutePoint[]): void
  fail(): void
}

function heldFetchers() {
  const paths: Held[] = []
  const straights: Held[] = []
  const hold = (list: Held[], from: LatLon, to: LatLon, signal: AbortSignal, kind?: TrackKind) =>
    new Promise<RoutePoint[]>((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      list.push({
        from,
        to,
        kind,
        signal,
        answer: resolve,
        fail: () => reject(new Error('no path')),
      })
    })
  const fetchers: LegFetchers = {
    path: (from, to, kind, signal) => hold(paths, from, to, signal, kind),
    straight: (from, to, signal) => hold(straights, from, to, signal),
  }
  return { fetchers, paths, straights }
}

const A = { lat: 46.5, lon: 7.6 }
const B = { lat: 46.51, lon: 7.6 }
const C = { lat: 46.52, lon: 7.6 }
const line = (from: LatLon, to: LatLon, ele: number): RoutePoint[] => [
  { ...from, ele },
  { ...to, ele: ele + 100 },
]

describe('legMode (FR-29.20)', () => {
  it('follows_paths_only_where_chosen_and_routing_is_on', () => {
    expect(legMode(true, true)).toBe('path')
    expect(legMode(false, true)).toBe('line')
    expect(legMode(true, false)).toBe('line')
  })
})

describe('createRouteEditor (FR-29.20)', () => {
  it('asks_the_router_for_a_new_path_leg_with_the_kind_and_settles_on_its_answer', async () => {
    const { fetchers, paths } = heldFetchers()
    const editor = createRouteEditor({
      draft: append(emptyDraft(), A, 'path'),
      kind: 'bike',
      fetchers,
    })
    editor.edit((d) => append(d, B, 'path'))
    expect(paths).toHaveLength(1)
    expect(paths[0]).toMatchObject({ from: A, to: B, kind: 'bike' })
    const settled = vi.fn()
    void editor.settled().then(settled)
    await Promise.resolve()
    expect(settled).not.toHaveBeenCalled()
    paths[0]!.answer(line(A, B, 1000))
    await editor.settled()
    expect(editor.draft.value.legs[0]!.points).toEqual(line(A, B, 1000))
  })

  it('draws_a_leg_straight_and_says_so_when_the_router_finds_no_path', async () => {
    const { fetchers, paths, straights } = heldFetchers()
    let saidSo!: () => void
    const fellBack = new Promise<void>((resolve) => (saidSo = resolve))
    const onFallback = vi.fn(() => saidSo())
    const editor = createRouteEditor({
      draft: append(emptyDraft(), A, 'path'),
      kind: 'hike',
      fetchers,
      onFallback,
    })
    editor.edit((d) => append(d, B, 'path'))
    paths[0]!.fail()
    await fellBack
    expect(straights).toHaveLength(1)
    expect(onFallback).toHaveBeenCalledTimes(1)
    straights[0]!.answer(line(A, B, 500))
    await editor.settled()
    expect(editor.draft.value.legs[0]!.points).toEqual(line(A, B, 500))
  })

  it('asks_swisstopo_not_the_router_for_a_straight_leg', () => {
    const { fetchers, paths, straights } = heldFetchers()
    const editor = createRouteEditor({
      draft: append(emptyDraft(), A, 'line'),
      kind: 'hike',
      fetchers,
    })
    editor.edit((d) => append(d, B, 'line'))
    expect(paths).toHaveLength(0)
    expect(straights).toHaveLength(1)
  })

  it('undoes_and_redoes_without_asking_again_for_what_was_answered', async () => {
    const { fetchers, paths } = heldFetchers()
    const editor = createRouteEditor({
      draft: append(emptyDraft(), A, 'path'),
      kind: 'hike',
      fetchers,
    })
    editor.edit((d) => append(d, B, 'path'))
    editor.edit((d) => append(d, C, 'path'))
    expect(editor.canUndo.value).toBe(true)
    paths[0]!.answer(line(A, B, 1))
    paths[1]!.answer(line(B, C, 2))
    await editor.settled()
    editor.undo()
    expect(editor.draft.value.handles).toEqual([A, B])
    expect(editor.draft.value.legs[0]!.points).toEqual(line(A, B, 1))
    expect(editor.canRedo.value).toBe(true)
    editor.redo()
    expect(editor.draft.value.handles).toEqual([A, B, C])
    expect(editor.draft.value.legs[1]!.points).toEqual(line(B, C, 2))
    expect(paths).toHaveLength(2)
  })

  it('writes_a_late_answer_into_the_draft_undone_to', async () => {
    const { fetchers, paths } = heldFetchers()
    const editor = createRouteEditor({
      draft: append(emptyDraft(), A, 'path'),
      kind: 'hike',
      fetchers,
    })
    editor.edit((d) => append(d, B, 'path'))
    editor.edit((d) => moveHandle(d, 1, C, 'path'))
    editor.undo()
    paths[0]!.answer(line(A, B, 7))
    paths[1]!.answer(line(A, C, 8))
    await editor.settled()
    expect(editor.draft.value.legs[0]!.points).toEqual(line(A, B, 7))
    editor.redo()
    expect(editor.draft.value.legs[0]!.points).toEqual(line(A, C, 8))
  })

  it('forgets_the_redo_once_something_new_is_edited', () => {
    const { fetchers } = heldFetchers()
    const editor = createRouteEditor({
      draft: append(emptyDraft(), A, 'line'),
      kind: 'hike',
      fetchers,
    })
    editor.edit((d) => append(d, B, 'line'))
    editor.undo()
    editor.edit((d) => append(d, C, 'line'))
    expect(editor.canRedo.value).toBe(false)
    expect(editor.edited.value).toBe(true)
  })

  it('counts_an_edit_that_changes_nothing_as_no_edit', () => {
    const { fetchers } = heldFetchers()
    const editor = createRouteEditor({ draft: emptyDraft(), kind: 'hike', fetchers })
    editor.edit((d) => d)
    expect(editor.edited.value).toBe(false)
  })

  it('stops_every_request_when_it_is_closed', () => {
    const { fetchers, paths } = heldFetchers()
    const editor = createRouteEditor({
      draft: append(emptyDraft(), A, 'path'),
      kind: 'hike',
      fetchers,
    })
    editor.edit((d) => append(d, B, 'path'))
    editor.dispose()
    expect(paths[0]!.signal.aborted).toBe(true)
  })

  it('asks_for_the_new_kind_once_a_route_drawn_from_nothing_changes_it', () => {
    const { fetchers, paths } = heldFetchers()
    const editor = createRouteEditor({
      draft: append(emptyDraft(), A, 'path'),
      kind: 'hike',
      fetchers,
    })
    editor.setKind('bike')
    editor.edit((d) => append(d, B, 'path'))
    expect(paths[0]!.kind).toBe('bike')
  })
})
