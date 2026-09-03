// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { bucketedRows } from '@/stores/bucketedRows'

interface Row {
  id: string
  parent: string
  name?: string
}

function fixture(initial: Array<[string, Row[]]> = []) {
  const map = ref(new Map<string, Row[]>(initial))
  return { map, rows: bucketedRows(map, (r) => r.parent) }
}

describe('bucketedRows (C-3)', () => {
  it('returns an empty list for a bucket nothing has written', () => {
    const { rows } = fixture()

    expect(rows.get('trip-1')).toEqual([])
  })

  it('creates the bucket on the first upsert', () => {
    const { map, rows } = fixture()

    rows.upsert({ id: 'a', parent: 'trip-1' })

    expect(map.value.get('trip-1')).toEqual([{ id: 'a', parent: 'trip-1' }])
  })

  it('replaces the row with the same id rather than appending a second', () => {
    const { rows } = fixture()
    rows.upsert({ id: 'a', parent: 'trip-1', name: 'Socken' })

    rows.upsert({ id: 'a', parent: 'trip-1', name: 'Wollsocken' })

    expect(rows.get('trip-1')).toEqual([{ id: 'a', parent: 'trip-1', name: 'Wollsocken' }])
  })

  it('keeps the row in place when it is replaced', () => {
    const { rows } = fixture()
    rows.upsert({ id: 'a', parent: 'trip-1' })
    rows.upsert({ id: 'b', parent: 'trip-1' })

    rows.upsert({ id: 'a', parent: 'trip-1', name: 'edited' })

    expect(rows.get('trip-1').map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('keeps buckets apart', () => {
    const { rows } = fixture()

    rows.upsert({ id: 'a', parent: 'trip-1' })
    rows.upsert({ id: 'b', parent: 'trip-2' })

    expect(rows.get('trip-1').map((r) => r.id)).toEqual(['a'])
    expect(rows.get('trip-2').map((r) => r.id)).toEqual(['b'])
  })

  it('removes a row by id without knowing its bucket', () => {
    const { rows } = fixture()
    rows.upsert({ id: 'a', parent: 'trip-1' })
    rows.upsert({ id: 'b', parent: 'trip-2' })

    rows.remove('b')

    expect(rows.get('trip-1').map((r) => r.id)).toEqual(['a'])
    expect(rows.get('trip-2')).toEqual([])
  })

  it('leaves every bucket alone when the id is unknown', () => {
    const { rows } = fixture()
    rows.upsert({ id: 'a', parent: 'trip-1' })

    rows.remove('nope')

    expect(rows.get('trip-1').map((r) => r.id)).toEqual(['a'])
  })

  // The one behaviour the seven hand-written pairs disagreed on: six stopped
  // at the first bucket that changed, `removeComment` scanned them all. A row
  // in two buckets cannot happen while every bucket key is an immutable
  // parent id — but if one ever becomes mutable, stopping early leaves the
  // row in its old bucket, which is a duplicate with no symptom.
  it('removes the id from every bucket that holds it, not just the first', () => {
    const { map, rows } = fixture([
      ['trip-1', [{ id: 'a', parent: 'trip-1' }]],
      ['trip-2', [{ id: 'a', parent: 'trip-2' }]],
    ])

    rows.remove('a')

    expect(map.value.get('trip-1')).toEqual([])
    expect(map.value.get('trip-2')).toEqual([])
  })
})
