import { describe, expect, it } from 'vitest'

import { settledTime, typedTime } from '../clockTime'

describe('typedTime — the 24-hour clock as it is typed (UX-6, FR-29.18)', () => {
  it('sets the colon once a two-digit hour is complete', () => {
    expect(typedTime('0')).toBe('0')
    expect(typedTime('08')).toBe('08')
    expect(typedTime('080')).toBe('08:0')
    expect(typedTime('0806')).toBe('08:06')
    expect(typedTime('2015')).toBe('20:15')
  })

  it('reads a first digit above 2 as an hour of its own', () => {
    expect(typedTime('9')).toBe('9')
    expect(typedTime('93')).toBe('9:3')
    expect(typedTime('930')).toBe('9:30')
    expect(typedTime('9301')).toBe('9:30')
  })

  it('keeps digits only, so a typed or pasted colon changes nothing', () => {
    expect(typedTime('08:06')).toBe('08:06')
    expect(typedTime('8.30 Uhr')).toBe('8:30')
    expect(typedTime('am')).toBe('')
  })
})

describe('settledTime — what a left field holds', () => {
  it('writes HH:MM, split where typing showed the colon', () => {
    expect(settledTime('08:06')).toBe('08:06')
    expect(settledTime('9:30')).toBe('09:30')
    expect(settledTime('830')).toBe('08:30')
    expect(settledTime('123')).toBe('12:30')
    expect(settledTime('2359')).toBe('23:59')
    expect(settledTime('9301')).toBe('09:30')
  })

  it('takes an hour alone as its full hour', () => {
    expect(settledTime('7')).toBe('07:00')
    expect(settledTime('20')).toBe('20:00')
    expect(settledTime('9:3')).toBe('09:30')
  })

  it('leaves an empty field empty', () => {
    expect(settledTime('')).toBe('')
  })

  it('leaves what is past the clock as typed, for no caller to take', () => {
    expect(settledTime('25:00')).toBe('25:00')
    expect(settledTime('19:75')).toBe('19:75')
  })
})
