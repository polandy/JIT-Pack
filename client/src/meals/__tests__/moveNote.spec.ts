// @vitest-environment jsdom
/**
 * FR-33.15: what the move's toast asks of a meal whose fresh ingredients are
 * already bought — the words, the names it gives and where it stops naming.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { setLocale } from '@/i18n'
import type { MealIngredient } from '@/types/domain'
import { freshNote } from '../moveNote'

function bought(name: string, position: number): MealIngredient {
  return {
    id: name,
    trip_id: 't1',
    meal_id: 'm',
    name,
    amount: null,
    list: 'buy_local',
    position,
    bought: true,
    bought_at: null,
    bought_by_user_id: null,
    shopping_position: null,
    fresh: true,
  }
}

// 2026-10-08 is a Thursday, 2026-10-10 the Saturday after.
const THURSDAY = '2026-10-08'
const SATURDAY = '2026-10-10'
const learned = new Map<string, boolean>()

describe('freshNote (FR-33.15)', () => {
  beforeEach(() => setLocale('de'))

  it('asks whether one bought fresh ingredient lasts until the new day', () => {
    expect(freshNote(THURSDAY, SATURDAY, [bought('Brot', 0)], learned)).toBe(
      '🌿 Brot ist schon gekauft – reicht es bis Sa.?',
    )
  })

  it('names two of them together', () => {
    const two = [bought('Brot', 0), bought('Rucola', 1)]
    expect(freshNote(THURSDAY, SATURDAY, two, learned)).toBe(
      '🌿 Brot, Rucola sind schon gekauft – reicht es bis Sa.?',
    )
  })

  it('names the first two of more and counts the rest, so the toast stays short', () => {
    const four = ['Brot', 'Rucola', 'Basilikum', 'Mozzarella'].map(bought)
    expect(freshNote(THURSDAY, SATURDAY, four, learned)).toBe(
      '🌿 Brot, Rucola + 2 weitere sind schon gekauft – reicht es bis Sa.?',
    )
  })

  it('says nothing for a move by a day only', () => {
    expect(freshNote(THURSDAY, '2026-10-09', [bought('Brot', 0)], learned)).toBeNull()
  })

  it('says nothing when no fresh ingredient is bought', () => {
    const oil = { ...bought('Olivenöl', 0), fresh: false }
    expect(freshNote(THURSDAY, SATURDAY, [oil], learned)).toBeNull()
  })

  it('asks in English too', () => {
    setLocale('en')
    expect(freshNote(THURSDAY, SATURDAY, [bought('Bread', 0)], learned)).toBe(
      '🌿 Bread is already bought – will it last until Sat?',
    )
  })
})
